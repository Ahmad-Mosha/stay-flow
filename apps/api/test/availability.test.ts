import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  availabilityCalendarResponseSchema,
  availabilityResponseSchema,
} from '@stay-flow/contracts';
import type { Insertable } from 'kysely';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import type { Properties } from '../src/platform/database/database.generated.js';
import {
  connectTestDatabase,
  createInventory,
  createReservation,
  occupy,
} from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// Already 2026-10-28 in Cairo (UTC+3), still 2026-10-27 in London (UTC+0).
const now = Temporal.Instant.from('2026-10-27T22:30:00Z');
const HOUR_MS = 3_600_000;

describe('availability', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  /** Doubles 101 and 102 (2 guests, 2,400 EGP, 3,100 from Dec 18), and suite 301 (4 guests, 5,200). */
  async function createGuesthouse(property: Partial<Insertable<Properties>> = {}) {
    const inventory = await createInventory(db, property);
    const { propertyId } = inventory;
    const suite = await db
      .insertInto('unitTypes')
      .values({
        propertyId,
        slug: 'suite',
        name: 'Family Suite',
        maxGuests: 4,
        baseRateMinor: 520_000,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const room301 = await db
      .insertInto('units')
      .values({ propertyId, unitTypeId: suite.id, name: '301' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('rateOverrides')
      .values({
        unitTypeId: inventory.unitTypeId,
        nights: '[2026-12-18,2027-01-05)',
        rateMinor: 310_000,
        label: 'Winter holidays',
      })
      .execute();

    const [room101, room102] = inventory.unitIds;
    const doubles = { propertyId, unitTypeId: inventory.unitTypeId };
    const suites = { propertyId, unitTypeId: suite.id };
    return {
      slug: inventory.slug,
      rooms: [
        { ...doubles, unitId: room101 },
        { ...doubles, unitId: room102 },
        { ...suites, unitId: room301.id },
      ] as const,
    };
  }

  type Room = Awaited<ReturnType<typeof createGuesthouse>>['rooms'][number];

  async function stay(
    room: Room,
    nights: string,
    options: { status?: 'confirmed' | 'held'; holdExpiresAt?: Date; released?: boolean } = {},
  ) {
    const reservation = await createReservation(db, {
      propertyId: room.propertyId,
      unitTypeId: room.unitTypeId,
      nights,
      status: options.status ?? 'confirmed',
      holdExpiresAt: options.holdExpiresAt ?? null,
    });
    await occupy(db, { ...room, nights, reservationId: reservation.id });
    if (options.released === true) {
      await db
        .updateTable('occupancies')
        .set({ releasedAt: new Date() })
        .where('reservationId', '=', reservation.id)
        .execute();
    }
  }

  const block = (room: Room, nights: string) =>
    occupy(db, { ...room, nights, blockReason: 'Repairs' });

  const search = (slug: string, query: Record<string, string>) =>
    request(app.getHttpServer()).get(`/v1/properties/${slug}/availability`).query(query);

  const calendar = (slug: string, query: Record<string, string>) =>
    request(app.getHttpServer()).get(`/v1/properties/${slug}/availability/calendar`).query(query);

  const december = { checkIn: '2026-12-16', checkOut: '2026-12-20', guests: '2' };

  describe('GET /v1/properties/:slug/availability', () => {
    it('prices every room type that fits, night by night, cheapest first', async () => {
      const { slug } = await createGuesthouse();

      const response = await search(slug, december).expect(200);

      expect(availabilityResponseSchema.parse(response.body)).toEqual({
        checkIn: '2026-12-16',
        checkOut: '2026-12-20',
        nights: 4,
        guests: 2,
        currency: 'EGP',
        unitTypes: [
          {
            slug: 'double',
            name: 'Double',
            description: '',
            maxGuests: 2,
            freeUnits: 2,
            nightlyRates: [
              { date: '2026-12-16', rateMinor: 240_000 },
              { date: '2026-12-17', rateMinor: 240_000 },
              { date: '2026-12-18', rateMinor: 310_000 },
              { date: '2026-12-19', rateMinor: 310_000 },
            ],
            totalMinor: 1_100_000,
          },
          {
            slug: 'suite',
            name: 'Family Suite',
            description: '',
            maxGuests: 4,
            freeUnits: 1,
            nightlyRates: ['2026-12-16', '2026-12-17', '2026-12-18', '2026-12-19'].map((date) => ({
              date,
              rateMinor: 520_000,
            })),
            totalMinor: 2_080_000,
          },
        ],
      });
    });

    it('leaves out room types too small for the guests', async () => {
      const { slug } = await createGuesthouse();

      const response = await search(slug, { ...december, guests: '3' }).expect(200);

      expect(response.body).toMatchObject({ unitTypes: [{ slug: 'suite' }] });
    });

    it('counts a room as taken by an overlapping stay, live hold or block', async () => {
      const { slug, rooms } = await createGuesthouse();
      await stay(rooms[0], '[2026-12-15,2026-12-17)');
      await stay(rooms[1], '[2026-12-19,2026-12-22)', {
        status: 'held',
        holdExpiresAt: new Date(Date.now() + HOUR_MS),
      });
      await block(rooms[2], '[2026-12-18,2026-12-19)');

      const response = await search(slug, december).expect(200);

      expect(freeUnitsOf(response.body)).toEqual({ double: 0, suite: 0 });
    });

    it('counts a room as free after a release, an expired hold, or a back-to-back stay', async () => {
      const { slug, rooms } = await createGuesthouse();
      await stay(rooms[0], '[2026-12-16,2026-12-20)', { released: true });
      await stay(rooms[1], '[2026-12-16,2026-12-20)', {
        status: 'held',
        holdExpiresAt: new Date(Date.now() - HOUR_MS),
      });
      await stay(rooms[2], '[2026-12-13,2026-12-16)');
      await stay(rooms[2], '[2026-12-20,2026-12-23)');

      const response = await search(slug, december).expect(200);

      expect(freeUnitsOf(response.body)).toEqual({ double: 2, suite: 1 });
    });

    it("decides whether check-in has passed by the property's own date", async () => {
      const cairo = await createGuesthouse({ timeZone: 'Africa/Cairo' });
      const london = await createGuesthouse({ timeZone: 'Europe/London' });
      const tonight = { checkIn: '2026-10-27', checkOut: '2026-10-29', guests: '2' };

      const response = await search(cairo.slug, tonight).expect(422);
      await search(london.slug, tonight).expect(200);

      expect(response.body).toMatchObject({
        code: 'CHECK_IN_PASSED',
        detail: 'Check-in 2026-10-27 is before today (2026-10-28) at this property.',
      });
    });

    it.each([
      ['STAY_TOO_SHORT', '2026-11-10', '2026-11-11'],
      ['STAY_TOO_LONG', '2026-11-10', '2026-11-18'],
      ['CHECK_IN_TOO_FAR', '2026-12-28', '2026-12-30'],
    ])('rejects a stay that breaks a rule with %s', async (code, checkIn, checkOut) => {
      const { slug } = await createGuesthouse({
        minNights: 2,
        maxNights: 7,
        bookingWindowDays: 60,
      });

      const response = await search(slug, { checkIn, checkOut, guests: '2' }).expect(422);

      expect(response.body).toMatchObject({ code, status: 422 });
    });

    it('lists every invalid query field', async () => {
      const { slug } = await createGuesthouse();

      const response = await search(slug, {
        checkIn: '2026-02-30',
        checkOut: '2026-12-04',
        guests: '0',
      }).expect(400);

      expect(response.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(pointersOf(response.body)).toEqual(['#/checkIn', '#/guests']);
    });

    it('rejects a check-out that is not after the check-in', async () => {
      const { slug } = await createGuesthouse();

      const response = await search(slug, { ...december, checkOut: '2026-12-16' }).expect(400);

      expect(response.body).toMatchObject({
        errors: [{ pointer: '#/checkOut', detail: 'Must be after checkIn' }],
      });
    });

    it('answers 404 for an unknown property', async () => {
      await search('no-such-place', december).expect(404);
    });
  });

  describe('GET /v1/properties/:slug/availability/calendar', () => {
    it('marks past nights unavailable and gives the check-in window', async () => {
      const { slug } = await createGuesthouse();

      const response = await calendar(slug, { month: '2026-10', guests: '2' }).expect(200);

      const body = availabilityCalendarResponseSchema.parse(response.body);
      expect(body).toMatchObject({
        month: '2026-10',
        currency: 'EGP',
        checkInWindow: { earliest: '2026-10-28', latest: '2027-10-28' },
      });
      expect(body.nights).toHaveLength(31);
      expect(body.nights[26]).toEqual({
        date: '2026-10-27',
        available: false,
        fromRateMinor: null,
      });
      expect(body.nights[27]).toEqual({
        date: '2026-10-28',
        available: true,
        fromRateMinor: 240_000,
      });
    });

    it('prices each night at its cheapest free room, if any', async () => {
      const { slug, rooms } = await createGuesthouse();
      await stay(rooms[0], '[2026-12-10,2026-12-12)');
      await stay(rooms[1], '[2026-12-10,2026-12-12)');
      await block(rooms[2], '[2026-12-11,2026-12-12)');

      const response = await calendar(slug, { month: '2026-12', guests: '2' }).expect(200);

      expect(
        nightsOf(response.body, ['2026-12-09', '2026-12-10', '2026-12-11', '2026-12-18']),
      ).toEqual([
        { date: '2026-12-09', available: true, fromRateMinor: 240_000 },
        { date: '2026-12-10', available: true, fromRateMinor: 520_000 },
        { date: '2026-12-11', available: false, fromRateMinor: null },
        { date: '2026-12-18', available: true, fromRateMinor: 310_000 },
      ]);
    });

    it('only considers rooms that fit the guests', async () => {
      const { slug } = await createGuesthouse();

      const response = await calendar(slug, { month: '2026-12', guests: '3' }).expect(200);

      expect(nightsOf(response.body, ['2026-12-18'])).toEqual([
        { date: '2026-12-18', available: true, fromRateMinor: 520_000 },
      ]);
    });

    it('rejects a malformed month', async () => {
      const { slug } = await createGuesthouse();

      const response = await calendar(slug, { month: '2026-13', guests: '2' }).expect(400);

      expect(pointersOf(response.body)).toEqual(['#/month']);
    });
  });
});

function freeUnitsOf(body: unknown): Record<string, number> {
  const { unitTypes } = availabilityResponseSchema.parse(body);
  return Object.fromEntries(unitTypes.map((unitType) => [unitType.slug, unitType.freeUnits]));
}

function nightsOf(body: unknown, dates: readonly string[]) {
  return availabilityCalendarResponseSchema
    .parse(body)
    .nights.filter((night) => dates.includes(night.date));
}

function pointersOf(body: unknown): string[] {
  return (body as { errors: { pointer: string }[] }).errors.map((error) => error.pointer);
}
