import type { NestExpressApplication } from '@nestjs/platform-express';
import { guestReservationResponseSchema } from '@stay-flow/contracts';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GuestReservationsService } from '../src/modules/reservations/guest-reservations.service.js';
import type { Database } from '../src/platform/database/database.js';
import { hashSecretToken, newSecretToken } from '../src/platform/security/secret-token.js';
import { createTeam } from './support/access.js';
import { placeHold, reservationIdOf, roomOf, statusOf } from './support/booking.js';
import { connectTestDatabase, createStay } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// 13:00 on 27 October 2026 in Cairo, still on summer time (UTC+3).
const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

type Team = Awaited<ReturnType<typeof createTeam>>;

describe('the manage-booking link', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  /** A stay in room 101 at 2 000.00 a night. Cancelling is free until 48 hours before 15:00. */
  const stay = (team: Team, nights: string, extra: object = {}) =>
    createStay(db, {
      ...team,
      unitId: team.unitIds[0],
      nights,
      nightlyRateMinor: 200_000,
      guestName: 'Nour Hassan',
      ...extra,
    });

  async function linkTo(reservationId: string): Promise<string> {
    const { token } = await app.get(GuestReservationsService).issueLink(reservationId);
    return token;
  }

  const view = (token: string) =>
    request(app.getHttpServer())
      .get('/v1/guest/reservation')
      .set('Authorization', `Bearer ${token}`);

  const cancel = (token: string, body: object) =>
    request(app.getHttpServer())
      .post('/v1/guest/reservation/cancel')
      .set('Authorization', `Bearer ${token}`)
      .send(body);

  const bookingOf = (response: { body: unknown }) =>
    guestReservationResponseSchema.strict().parse(response.body);

  describe('GET /v1/guest/reservation', () => {
    it('shows the booking the link opens, with the refund for cancelling now', async () => {
      const team = await createTeam(db);
      const { id, reference } = await stay(team, '[2026-10-30,2026-11-01)');
      await stay(team, '[2026-11-05,2026-11-07)');

      const response = await view(await linkTo(id)).expect(200);

      expect(bookingOf(response)).toMatchObject({
        reference,
        status: 'confirmed',
        property: { name: 'Test Guesthouse' },
        unitType: { name: 'Double' },
        checkIn: '2026-10-30',
        checkOut: '2026-11-01',
        guest: { name: 'Nour Hassan' },
        totalMinor: 400_000,
        policy: { freeCancellationHours: 48, checkInTime: '15:00' },
        // 15:00 on the 30th is 13:00 UTC, once Egypt's summer time ends on the 29th.
        refund: { freeUntil: '2026-10-28T13:00:00Z', refundMinor: 400_000, feeMinor: 0 },
      });
    });

    it('keeps only a hash of the token, valid until a month after check-out', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-30,2026-11-01)');

      const { token, expiresAt } = await app.get(GuestReservationsService).issueLink(id);

      const stored = await db
        .selectFrom('guestAccessTokens')
        .select(['tokenHash', 'expiresAt'])
        .where('reservationId', '=', id)
        .executeTakeFirstOrThrow();
      expect(stored.tokenHash.equals(hashSecretToken(token))).toBe(true);
      expect(stored.expiresAt.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(expiresAt.toString()).toBe('2026-12-01T00:00:00Z');
    });

    it('answers 401 INVALID_GUEST_LINK for a missing, malformed, unknown or expired token', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-30,2026-11-01)');
      const expired = newSecretToken();
      await db
        .insertInto('guestAccessTokens')
        .values({
          reservationId: id,
          tokenHash: hashSecretToken(expired),
          expiresAt: new Date('2026-10-27T09:59:59Z'),
        })
        .execute();
      const token = await linkTo(id);

      const responses = await Promise.all([
        request(app.getHttpServer()).get('/v1/guest/reservation'),
        request(app.getHttpServer())
          .get('/v1/guest/reservation')
          .set('Authorization', `Basic ${token}`),
        view(`${token}x`),
        view(newSecretToken()),
        view(expired),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ code: 'INVALID_GUEST_LINK' });
      }
    });

    it('gives no link to a hold, which has no guest yet', async () => {
      const { slug } = await createTeam(db);
      const id = reservationIdOf(await placeHold(app.getHttpServer(), slug).expect(201));

      await expect(app.get(GuestReservationsService).issueLink(id)).rejects.toThrow('has no guest');
    });
  });

  describe('POST /v1/guest/reservation/cancel', () => {
    it('cancels with the refund the guest was shown, and frees the room', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-30,2026-11-01)');
      const token = await linkTo(id);

      const response = await cancel(token, {
        expectedRefundMinor: 400_000,
        reason: 'Plans changed',
      }).expect(200);

      expect(bookingOf(response)).toMatchObject({
        status: 'cancelled',
        refund: { refundMinor: 400_000, feeMinor: 0 },
      });
      expect(await roomOf(db, id)).toBeUndefined();
      expect(
        await db
          .selectFrom('reservationEvents')
          .select(['toStatus', 'actor', 'userId', 'note'])
          .where('reservationId', '=', id)
          .execute(),
      ).toEqual([{ toStatus: 'cancelled', actor: 'guest', userId: null, note: 'Plans changed' }]);
    });

    it('cancels nothing when the refund changed since the guest saw it', async () => {
      const team = await createTeam(db);
      // Free cancellation ended at 12:00 UTC yesterday, so the first night is now a fee.
      const { id } = await stay(team, '[2026-10-28,2026-10-30)');
      const token = await linkTo(id);

      const response = await cancel(token, { expectedRefundMinor: 400_000 }).expect(409);

      expect(response.body).toMatchObject({ code: 'REFUND_CHANGED' });
      expect(await statusOf(db, id)).toBe('confirmed');
      expect(bookingOf(await view(token).expect(200)).refund).toMatchObject({
        refundMinor: 200_000,
        feeMinor: 200_000,
      });
    });

    it('answers a repeated cancellation with the first one', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-28,2026-10-30)');
      const token = await linkTo(id);
      await cancel(token, { expectedRefundMinor: 200_000 }).expect(200);

      const again = await cancel(token, { expectedRefundMinor: 200_000 }).expect(200);

      expect(bookingOf(again).refund).toMatchObject({ refundMinor: 200_000 });
      const events = await db
        .selectFrom('reservationEvents')
        .select('id')
        .where('reservationId', '=', id)
        .execute();
      expect(events).toHaveLength(1);
    });

    it('answers 409 INVALID_TRANSITION once the guest has checked in', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-27,2026-10-29)', { status: 'checked_in' });
      const token = await linkTo(id);

      const response = await cancel(token, { expectedRefundMinor: 0 }).expect(409);

      expect(response.body).toMatchObject({ code: 'INVALID_TRANSITION' });
      expect(bookingOf(await view(token).expect(200)).refund).toBeNull();
    });

    it('answers 400 without the refund the guest agreed to', async () => {
      const team = await createTeam(db);
      const { id } = await stay(team, '[2026-10-30,2026-11-01)');

      await cancel(await linkTo(id), {}).expect(400);
    });
  });
});
