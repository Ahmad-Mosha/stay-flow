import type { NestExpressApplication } from '@nestjs/platform-express';
import { roomCalendarResponseSchema, todayResponseSchema } from '@stay-flow/contracts';
import { sql } from 'kysely';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { createTeam } from './support/access.js';
import { connectTestDatabase, createReservation, createStay, occupy } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// Tonight is 27 October 2026 in Cairo.
const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

const inTenMinutes = () => new Date(Date.now() + 600_000);
const aMinuteAgo = () => new Date(Date.now() - 60_000);

type Team = Awaited<ReturnType<typeof createTeam>>;

describe('front desk', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const get = (team: Team, path: string) =>
    request(app.getHttpServer())
      .get(`/v1/host/properties/${team.propertyId}/${path}`)
      .set('Cookie', team.frontDesk.cookie);

  /** Adds a room to the team's "double" type. */
  async function addRoom(team: Team, name: string): Promise<string> {
    const { id } = await db
      .insertInto('units')
      .values({ propertyId: team.propertyId, unitTypeId: team.unitTypeId, name })
      .returning('id')
      .executeTakeFirstOrThrow();
    return id;
  }

  describe('GET /v1/host/properties/:propertyId/calendar', () => {
    it('shows each room with the stays, live holds and blocks that take a night', async () => {
      const team = await createTeam(db);
      const [room101, room102] = team.unitIds;
      const stay = await createStay(db, {
        ...team,
        unitId: room101,
        nights: '[2026-12-01,2026-12-04)',
      });
      // Runs past the calendar's first night.
      const arriving = await createStay(db, {
        ...team,
        unitId: room102,
        nights: '[2026-11-28,2026-12-02)',
      });
      const hold = await createStay(db, {
        ...team,
        unitId: room102,
        nights: '[2026-12-02,2026-12-03)',
        status: 'held',
        holdExpiresAt: inTenMinutes(),
      });
      const block = await occupy(db, {
        ...team,
        unitId: room102,
        nights: '[2026-12-05,2026-12-07)',
        blockReason: 'Repainting',
      });
      // None of these show: a hold that ran out, a released block, and a stay after the calendar.
      await createStay(db, {
        ...team,
        unitId: room101,
        nights: '[2026-12-05,2026-12-06)',
        status: 'held',
        holdExpiresAt: aMinuteAgo(),
      });
      const released = await occupy(db, {
        ...team,
        unitId: room101,
        nights: '[2026-12-06,2026-12-07)',
        blockReason: 'Deep clean',
      });
      await db
        .updateTable('occupancies')
        .set({ releasedAt: sql<Date>`now()` })
        .where('id', '=', released.id)
        .execute();
      await createStay(db, { ...team, unitId: room101, nights: '[2026-12-08,2026-12-10)' });

      const response = await get(team, 'calendar')
        .query({ from: '2026-12-01', to: '2026-12-08' })
        .expect(200);

      const calendar = roomCalendarResponseSchema.parse(response.body);
      expect(calendar.nights).toEqual({ from: '2026-12-01', to: '2026-12-08' });
      expect(calendar.unitTypes).toMatchObject([
        {
          id: team.unitTypeId,
          name: 'Double',
          units: [
            {
              id: room101,
              name: '101',
              bars: [
                {
                  kind: 'stay',
                  nights: { from: '2026-12-01', to: '2026-12-04' },
                  reservation: { id: stay.id, status: 'confirmed', unit: { name: '101' } },
                },
              ],
            },
            {
              id: room102,
              name: '102',
              bars: [
                {
                  kind: 'stay',
                  nights: { from: '2026-11-28', to: '2026-12-02' },
                  reservation: { id: arriving.id },
                },
                { kind: 'stay', reservation: { id: hold.id, status: 'held' } },
                {
                  kind: 'block',
                  id: block.id,
                  nights: { from: '2026-12-05', to: '2026-12-07' },
                  reason: 'Repainting',
                },
              ],
            },
          ],
        },
      ]);
      expect(calendar.unitTypes[0]?.units[0]?.bars).toHaveLength(1);
    });

    it('answers 400 for more than 62 nights', async () => {
      const team = await createTeam(db);

      await get(team, 'calendar').query({ from: '2026-12-01', to: '2027-02-02' }).expect(400);
    });
  });

  describe('GET /v1/host/properties/:propertyId/today', () => {
    it("shows the day's arrivals, departures and guests in, and how the rooms sell", async () => {
      const team = await createTeam(db);
      const [room101, room102] = team.unitIds;
      const room103 = await addRoom(team, '103');
      const room104 = await addRoom(team, '104');
      const room105 = await addRoom(team, '105');

      const dueIn = await createStay(db, {
        ...team,
        unitId: room101,
        nights: '[2026-10-27,2026-10-29)',
        nightlyRateMinor: 250_000,
      });
      const noShow = await createReservation(db, {
        ...team,
        nights: '[2026-10-27,2026-10-28)',
        status: 'no_show',
        nightlyRateMinor: 999_000,
      });
      const dueOut = await createStay(db, {
        ...team,
        unitId: room102,
        nights: '[2026-10-25,2026-10-27)',
        status: 'checked_in',
        nightlyRateMinor: 200_000,
      });
      const stayingOn = await createStay(db, {
        ...team,
        unitId: room103,
        nights: '[2026-10-26,2026-10-30)',
        status: 'checked_in',
        nightlyRateMinor: 100_000,
      });
      const gone = await createStay(db, {
        ...team,
        unitId: room104,
        nights: '[2026-10-24,2026-10-27)',
        status: 'checked_out',
        nightlyRateMinor: 150_000,
      });
      // Crosses into November: only its October night counts this month.
      await createStay(db, {
        ...team,
        unitId: room105,
        nights: '[2026-10-31,2026-11-02)',
        nightlyRateMinor: 300_000,
      });
      // Tonight 102 is held and 104 blocked; 105 is free.
      await createStay(db, {
        ...team,
        unitId: room102,
        nights: '[2026-10-27,2026-10-28)',
        status: 'held',
        holdExpiresAt: inTenMinutes(),
        nightlyRateMinor: 999_000,
      });
      await occupy(db, {
        ...team,
        unitId: room104,
        nights: '[2026-10-27,2026-10-28)',
        blockReason: 'Leak',
      });
      // Not today's business: a cancelled arrival, and an arrival at another property.
      await createReservation(db, {
        ...team,
        nights: '[2026-10-27,2026-10-28)',
        status: 'cancelled',
        nightlyRateMinor: 999_000,
      });
      const other = await createTeam(db);
      await createStay(db, {
        ...other,
        unitId: other.unitIds[0],
        nights: '[2026-10-27,2026-10-28)',
      });

      const response = await get(team, 'today').expect(200);

      const today = todayResponseSchema.parse(response.body);
      expect(today.date).toBe('2026-10-27');
      expect(today.arrivals.map(({ id }) => id)).toEqual([dueIn.id, noShow.id]);
      expect(today.departures.map(({ id }) => id)).toEqual([dueOut.id, gone.id]);
      expect(today.inHouse.map(({ id }) => id)).toEqual([dueOut.id, stayingOn.id]);
      expect(today.arrivals[0]).toMatchObject({ unit: { name: '101' }, status: 'confirmed' });
      expect(today.tonight).toEqual({ rooms: 5, sold: 2, held: 1, blocked: 1, free: 1 });
      expect(today.thisMonth).toEqual({
        month: '2026-10',
        // 2 nights at 2 500.00, 2 at 2 000.00, 4 at 1 000.00, 3 at 1 500.00 and 1 at 3 000.00.
        nightsSold: 12,
        currency: 'EGP',
        revenueMinor: 2_050_000,
      });
    });

    it("counts the day by the property's clock, not the server's", async () => {
      // 22:30 UTC on the 27th is already the 28th in Cairo.
      const lateApp = await createTestApp({ now: Temporal.Instant.from('2026-10-27T22:30:00Z') });
      try {
        const team = await createTeam(db);
        const arrival = await createStay(db, {
          ...team,
          unitId: team.unitIds[0],
          nights: '[2026-10-28,2026-10-30)',
        });

        const response = await request(lateApp.getHttpServer())
          .get(`/v1/host/properties/${team.propertyId}/today`)
          .set('Cookie', team.owner.cookie)
          .expect(200);

        const today = todayResponseSchema.parse(response.body);
        expect(today.date).toBe('2026-10-28');
        expect(today.arrivals.map(({ id }) => id)).toEqual([arrival.id]);
      } finally {
        await lateApp.close();
      }
    });
  });
});
