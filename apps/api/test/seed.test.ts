import { sql } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { fromDateRange } from '../src/platform/database/date-range.js';
import { nightsOf } from '../src/platform/time/date-span.js';
import { verifyPassword } from '../src/modules/identity/password.js';
import { demoHotels } from '../src/seed/demo-hotels.js';
import { darNubia, demoHost, demoTeam } from '../src/seed/demo-property.js';
import { seedDemoHost } from '../src/seed/seed-demo-host.js';
import { seedHistory, seedHotel } from '../src/seed/seed-hotel.js';
import { connectTestDatabase } from './support/fixtures.js';

const now = Temporal.Instant.from('2026-10-27T09:00:00Z');

describe('demo seed', () => {
  const db: Database = connectTestDatabase();
  let propertyId: string;

  beforeAll(async () => {
    await seedHotel(db, darNubia, now);
    const property = await db
      .selectFrom('properties')
      .select('id')
      .where('slug', '=', 'dar-nubia')
      .executeTakeFirstOrThrow();
    propertyId = property.id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  const reservations = () =>
    db.selectFrom('reservations').where('reservations.propertyId', '=', propertyId);

  it('runs only once', async () => {
    await expect(seedHotel(db, darNubia, now)).resolves.toBe('already-seeded');
  });

  it('gives the property a host who can sign in as its owner', async () => {
    await expect(seedDemoHost(db)).resolves.toBe('seeded');
    await expect(seedDemoHost(db)).resolves.toBe('already-seeded');

    const host = await db
      .selectFrom('users')
      .innerJoin('propertyMembers', 'propertyMembers.userId', 'users.id')
      .select(['users.passwordHash', 'propertyMembers.propertyId', 'propertyMembers.role'])
      .where('users.email', '=', demoHost.email)
      .executeTakeFirstOrThrow();

    expect([host.propertyId, host.role]).toEqual([propertyId, 'owner']);
    await expect(verifyPassword(host.passwordHash, demoHost.password)).resolves.toBe(true);
  });

  it('puts a manager and a front desk clerk on the team too', async () => {
    const team = await db
      .selectFrom('propertyMembers')
      .innerJoin('users', 'users.id', 'propertyMembers.userId')
      .select(['users.email', 'propertyMembers.role'])
      .where('propertyMembers.propertyId', '=', propertyId)
      .orderBy('users.email')
      .execute();

    expect(team).toEqual(
      [
        { email: demoHost.email, role: 'owner' },
        ...demoTeam.map(({ email, role }) => ({ email, role })),
      ].sort((a, b) => a.email.localeCompare(b.email)),
    );
  });

  it('creates 4 room types, 10 rooms, 18 stays and a maintenance block', async () => {
    const [unitTypes, units, stays, blocks] = await Promise.all([
      db.selectFrom('unitTypes').select('id').where('propertyId', '=', propertyId).execute(),
      db.selectFrom('units').select('id').where('propertyId', '=', propertyId).execute(),
      reservations().select('id').execute(),
      db
        .selectFrom('occupancies')
        .select('id')
        .where('propertyId', '=', propertyId)
        .where('blockReason', 'is not', null)
        .execute(),
    ]);

    expect([unitTypes.length, units.length, stays.length, blocks.length]).toEqual([4, 10, 18, 1]);
  });

  it('prices every stay night by night, matching its total', async () => {
    const rows = await reservations().select(['nights', 'totalMinor', 'priceSnapshot']).execute();

    for (const row of rows) {
      const { nightlyRates } = row.priceSnapshot as {
        nightlyRates: { date: string; rateMinor: number }[];
      };
      const nights = nightsOf(fromDateRange(row.nights)).map(String);

      expect(nightlyRates.map((night) => night.date)).toEqual(nights);
      expect(nightlyRates.reduce((total, night) => total + night.rateMinor, 0)).toBe(
        row.totalMinor,
      );
    }
  });

  it('frees the room exactly for stays that ended without staying', async () => {
    const rows = await reservations()
      .innerJoin('occupancies', 'occupancies.reservationId', 'reservations.id')
      .select(['reservations.status', 'occupancies.releasedAt'])
      .execute();

    const releasing = new Set(['expired', 'released', 'cancelled', 'no_show']);
    for (const row of rows) {
      expect(row.releasedAt !== null).toBe(releasing.has(row.status));
    }
  });

  it('records each history in order, from held to the current status', async () => {
    const rows = await reservations()
      .select((eb) => [
        'reservations.status',
        eb
          .selectFrom('reservationEvents')
          .select(sql<string[]>`array_agg(to_status::text order by occurred_at)`.as('statuses'))
          .whereRef('reservationEvents.reservationId', '=', 'reservations.id')
          .as('statuses'),
      ])
      .execute();

    for (const row of rows) {
      expect(row.statuses?.[0]).toBe('held');
      expect(row.statuses?.at(-1)).toBe(row.status);
    }
  });
});

describe('demo hotels', () => {
  const db: Database = connectTestDatabase();
  const hotels = [darNubia, ...demoHotels];
  const slugs = hotels.map((hotel) => hotel.property.slug);

  beforeAll(async () => {
    for (const hotel of hotels) {
      await seedHotel(db, hotel, now);
      await seedDemoHost(db, hotel.property.slug);
      await seedHistory(db, hotel, now);
    }
  }, 120_000);

  afterAll(async () => {
    await db.destroy();
  });

  const stays = () =>
    db
      .selectFrom('reservations')
      .innerJoin('properties', 'properties.id', 'reservations.propertyId')
      .where('properties.slug', 'in', slugs);

  it('adds each history once, even on a later day', async () => {
    for (const hotel of hotels) {
      await expect(seedHistory(db, hotel, now.add({ hours: 30 }))).resolves.toBe('already-seeded');
    }
  });

  it('fills every hotel with months of stays', async () => {
    const rows = await stays()
      .select(['properties.slug', (eb) => eb.fn.countAll<number>().as('stays')])
      .groupBy('properties.slug')
      .execute();

    expect(rows.map((row) => row.slug).sort()).toEqual([...slugs].sort());
    for (const row of rows) {
      expect(row.stays).toBeGreaterThan(150);
    }
  });

  it('makes the demo host the owner of every hotel, opening on Dar Nubia', async () => {
    const memberships = await db
      .selectFrom('propertyMembers')
      .innerJoin('users', 'users.id', 'propertyMembers.userId')
      .innerJoin('properties', 'properties.id', 'propertyMembers.propertyId')
      .select(['properties.slug', 'propertyMembers.role'])
      .where('users.email', '=', demoHost.email)
      .orderBy('propertyMembers.createdAt')
      .execute();

    expect(memberships.map((member) => member.slug)).toEqual(slugs);
    expect(new Set(memberships.map((member) => member.role))).toEqual(new Set(['owner']));
  });

  it('gives every stay a status its dates allow by now', async () => {
    const rows = await stays()
      .select(['reservations.status', 'reservations.nights', 'properties.timeZone'])
      .execute();

    for (const row of rows) {
      const today = now.toZonedDateTimeISO(row.timeZone).toPlainDate();
      const { start, end } = fromDateRange(row.nights);
      const startsIn = today.until(start).days;
      const endsIn = today.until(end).days;
      const allowed: Partial<Record<string, boolean>> = {
        confirmed: startsIn >= 0,
        checked_in: startsIn < 0 && endsIn >= 0,
        checked_out: endsIn <= 0,
        no_show: startsIn < 0,
      };
      expect(allowed[row.status] ?? true, `${row.status} ${row.nights}`).toBe(true);
    }
  });

  it('dates nothing after now', async () => {
    const latest = await stays()
      .innerJoin('reservationEvents', 'reservationEvents.reservationId', 'reservations.id')
      .select((eb) => eb.fn.max('reservationEvents.occurredAt').as('at'))
      .executeTakeFirstOrThrow();

    expect(latest.at.getTime()).toBeLessThanOrEqual(now.epochMilliseconds);
  });

  it('prices every night at its room type rate on that date', async () => {
    const rows = await stays()
      .innerJoin('unitTypes', 'unitTypes.id', 'reservations.unitTypeId')
      .select((eb) => [
        'reservations.nights',
        'reservations.totalMinor',
        'reservations.priceSnapshot',
        'unitTypes.baseRateMinor',
        eb
          .selectFrom('rateOverrides')
          .select(sql<string>`nights::text`.as('nights'))
          .whereRef('rateOverrides.unitTypeId', '=', 'unitTypes.id')
          .as('season'),
        eb
          .selectFrom('rateOverrides')
          .select('rateMinor')
          .whereRef('rateOverrides.unitTypeId', '=', 'unitTypes.id')
          .as('seasonRateMinor'),
      ])
      .execute();

    for (const row of rows) {
      const { nightlyRates } = row.priceSnapshot as {
        nightlyRates: { date: string; rateMinor: number }[];
      };
      const season = row.season === null ? undefined : fromDateRange(row.season);
      const expected = nightsOf(fromDateRange(row.nights)).map((date) => ({
        date: date.toString(),
        rateMinor: Number(
          season !== undefined &&
            Temporal.PlainDate.compare(season.start, date) <= 0 &&
            Temporal.PlainDate.compare(date, season.end) < 0
            ? row.seasonRateMinor
            : row.baseRateMinor,
        ),
      }));

      expect(nightlyRates).toEqual(expected);
      expect(row.totalMinor).toBe(expected.reduce((total, night) => total + night.rateMinor, 0));
    }
  });
});
