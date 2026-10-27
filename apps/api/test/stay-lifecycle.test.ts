import type { NestExpressApplication } from '@nestjs/platform-express';
import { hostReservationDetailResponseSchema } from '@stay-flow/contracts';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { createTeam } from './support/access.js';
import { eventsOf, roomOf, statusOf } from './support/booking.js';
import { connectTestDatabase, createStay } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// 13:00 on 27 October 2026 in Cairo, still on summer time (UTC+3).
const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

type Team = Awaited<ReturnType<typeof createTeam>>;
type Action = 'check-in' | 'check-out' | 'no-show' | 'cancel';

describe('the stay, from check-in to check-out', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const path = (team: Team, id: string) =>
    `/v1/host/properties/${team.propertyId}/reservations/${id}`;

  const act = (team: Team, id: string, action: Action, body: object = {}) =>
    request(app.getHttpServer())
      .post(`${path(team, id)}/${action}`)
      .set('Cookie', team.frontDesk.cookie)
      .send(action === 'cancel' ? { reason: 'Guest called', ...body } : body);

  const detailOf = (response: { body: unknown }) =>
    hostReservationDetailResponseSchema.parse(response.body);

  /** A stay in room 101, confirmed unless `status` says otherwise. */
  const stay = (
    team: Team,
    nights: string,
    extra: Parameters<typeof createStay>[1] | object = {},
  ) => createStay(db, { ...team, unitId: team.unitIds[0], nights, ...extra });

  async function occupancyOf(reservationId: string) {
    return db
      .selectFrom('occupancies')
      .select(['nights', 'releasedAt'])
      .where('reservationId', '=', reservationId)
      .executeTakeFirstOrThrow();
  }

  describe('POST .../check-in', () => {
    it('checks the guest in, records who did it, and does nothing the second time', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-27,2026-10-29)');

      const first = detailOf(await act(team, id, 'check-in').expect(200));
      const second = detailOf(await act(team, id, 'check-in').expect(200));

      expect(first.status).toBe('checked_in');
      expect(first.events).toMatchObject([
        {
          fromStatus: 'confirmed',
          toStatus: 'checked_in',
          actor: 'host',
          userId: team.frontDesk.id,
        },
      ]);
      expect(second.events).toHaveLength(1);
      expect(await roomOf(db, id)).toBe(team.unitIds[0]);
    });

    it('answers 422 before the day of arrival and after the stay', async () => {
      const team = await createTeam(db);
      const tomorrow = await stay(team, '[2026-10-28,2026-10-30)');
      const over = await stay(team, '[2026-10-24,2026-10-27)');

      const early = await act(team, tomorrow.id, 'check-in').expect(422);
      const late = await act(team, over.id, 'check-in').expect(422);

      expect(early.body).toMatchObject({
        code: 'ARRIVAL_NOT_DUE',
        detail: 'The guest is due on 2026-10-28.',
      });
      expect(late.body).toMatchObject({ code: 'STAY_ENDED' });
    });

    it('answers 409 INVALID_TRANSITION for a reservation that is not confirmed', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-27,2026-10-29)', { status: 'checked_out' });

      const response = await act(team, id, 'check-in').expect(409);

      expect(response.body).toMatchObject({
        code: 'INVALID_TRANSITION',
        detail: 'This reservation is checked out, so it cannot be checked in.',
      });
    });
  });

  describe('POST .../check-out', () => {
    it('keeps the nights the guest stayed', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-25,2026-10-27)', { status: 'checked_in' });

      const response = await act(team, id, 'check-out').expect(200);

      expect(detailOf(response).status).toBe('checked_out');
      expect(await occupancyOf(id)).toEqual({
        nights: '[2026-10-25,2026-10-27)',
        releasedAt: null,
      });
    });

    it('gives the room back from tonight when the guest leaves early', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-26,2026-10-30)', { status: 'checked_in' });

      await act(team, id, 'check-out').expect(200);

      expect(await occupancyOf(id)).toEqual({
        nights: '[2026-10-26,2026-10-27)',
        releasedAt: null,
      });
      expect(await statusOf(db, id)).toBe('checked_out');
    });

    it('frees the whole stay for a guest who leaves on the day they came', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-27,2026-10-29)', { status: 'checked_in' });

      await act(team, id, 'check-out').expect(200);

      expect((await occupancyOf(id)).releasedAt).not.toBeNull();
    });
  });

  describe('POST .../no-show', () => {
    it('marks a guest who did not come, and frees the room', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-27,2026-10-29)');

      const response = await act(team, id, 'no-show').expect(200);

      expect(detailOf(response).status).toBe('no_show');
      expect(await roomOf(db, id)).toBeUndefined();
    });

    it('answers 422 ARRIVAL_NOT_DUE before the day of arrival', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-28,2026-10-29)');

      await act(team, id, 'no-show').expect(422);
    });
  });

  describe('POST .../cancel', () => {
    // 2 000.00 a night. Check-in time is 15:00 and cancelling is free until 48 hours before.
    const rate = { nightlyRateMinor: 200_000 };

    it('refunds everything before the deadline and frees the room', async () => {
      const team = await createTeam(db);
      // Check-in 15:00 on the 30th is 13:00 UTC (Egypt's summer time ends on the 29th).
      const { id } = await stay(team, '[2026-10-30,2026-11-01)', rate);

      const response = await act(team, id, 'cancel', { reason: 'Flight cancelled' }).expect(200);

      expect(detailOf(response)).toMatchObject({
        status: 'cancelled',
        unit: null,
        refund: { freeUntil: '2026-10-28T13:00:00Z', refundMinor: 400_000, feeMinor: 0 },
        events: [
          {
            toStatus: 'cancelled',
            actor: 'host',
            userId: team.frontDesk.id,
            note: 'Flight cancelled',
          },
        ],
      });
      expect(await roomOf(db, id)).toBeUndefined();
    });

    it('keeps the first night after the deadline, unless the fee is waived', async () => {
      const team = await createTeam(db);
      const late = await stay(team, '[2026-10-28,2026-10-30)', rate);
      const waived = await stay(team, '[2026-10-28,2026-10-30)', {
        ...rate,
        unitId: team.unitIds[1],
      });

      const charged = await act(team, late.id, 'cancel').expect(200);
      const free = await act(team, waived.id, 'cancel', { waiveFee: true }).expect(200);

      expect(detailOf(charged).refund).toMatchObject({ refundMinor: 200_000, feeMinor: 200_000 });
      expect(detailOf(free).refund).toMatchObject({ refundMinor: 400_000, feeMinor: 0 });
    });

    it('keeps the first refund when the cancellation is sent again', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-28,2026-10-30)', rate);
      await act(team, id, 'cancel').expect(200);

      const again = await act(team, id, 'cancel', { waiveFee: true }).expect(200);

      expect(detailOf(again).refund).toMatchObject({ refundMinor: 200_000 });
      expect(await eventsOf(db, id)).toHaveLength(1);
    });

    it('answers 422 STAY_ENDED once the stay is over', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-25,2026-10-27)');

      await act(team, id, 'cancel').expect(422);
    });
  });

  describe('GET /v1/host/properties/:propertyId/reservations/:reservationId', () => {
    it('quotes the refund for cancelling now', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-30,2026-11-01)', { nightlyRateMinor: 200_000 });

      const response = await request(app.getHttpServer())
        .get(path(team, id))
        .set('Cookie', team.frontDesk.cookie)
        .expect(200);

      expect(detailOf(response)).toMatchObject({
        status: 'confirmed',
        nightlyRates: [
          { date: '2026-10-30', rateMinor: 200_000 },
          { date: '2026-10-31', rateMinor: 200_000 },
        ],
        policy: { freeCancellationHours: 48, checkInTime: '15:00' },
        refund: { refundMinor: 400_000, feeMinor: 0 },
        events: [],
      });
    });

    it("answers 404 for another property's reservation and 400 for an id that is not one", async () => {
      const team = await createTeam(db);
      const other = await createTeam(db);
      const { id } = await stay(other, '[2026-10-30,2026-11-01)');

      for (const action of ['check-in', 'cancel'] as const) {
        await act(team, id, action).expect(404);
      }
      await request(app.getHttpServer())
        .get(path(team, 'not-an-id'))
        .set('Cookie', team.frontDesk.cookie)
        .expect(400);
    });
  });
});
