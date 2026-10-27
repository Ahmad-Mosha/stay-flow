import { sql } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { fromDateRange } from '../src/platform/database/date-range.js';
import { nightsOf } from '../src/platform/time/date-span.js';
import { verifyPassword } from '../src/modules/identity/password.js';
import { demoHost } from '../src/seed/demo-property.js';
import { seedDemoHost } from '../src/seed/seed-demo-host.js';
import { seedDemoProperty } from '../src/seed/seed-demo-property.js';
import { connectTestDatabase } from './support/fixtures.js';

const now = Temporal.Instant.from('2026-10-27T09:00:00Z');

describe('demo seed', () => {
  const db: Database = connectTestDatabase();
  let propertyId: string;

  beforeAll(async () => {
    await seedDemoProperty(db, now);
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
    await expect(seedDemoProperty(db, now)).resolves.toBe('already-seeded');
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
