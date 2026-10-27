import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { reservationResponseSchema } from '@stay-flow/contracts';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import {
  confirmReservation,
  eventsOf,
  lapseHold,
  placeHold,
  releaseReservation,
  reservationIdOf,
  roomOf,
  statusOf,
} from './support/booking.js';
import { connectTestDatabase, createInventory } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

const now = Temporal.Instant.from('2026-10-27T22:30:00Z');

describe('reservations', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  async function placeHeldReservation() {
    const { slug } = await createInventory(db);
    const id = reservationIdOf(await placeHold(app.getHttpServer(), slug).expect(201));
    return { slug, id };
  }

  const confirm = (id: string, key?: string, guest?: Record<string, unknown>) =>
    confirmReservation(app.getHttpServer(), id, key, guest);

  const release = (id: string) => releaseReservation(app.getHttpServer(), id);

  describe('POST /v1/reservations/:id/confirm', () => {
    it('books the held room for the guest', async () => {
      const { id } = await placeHeldReservation();
      const room = await roomOf(db, id);

      const response = await confirm(id, randomUUID(), {
        guestName: '  Nour Hassan ',
        guestEmail: 'nour@example.com',
      }).expect(200);

      expect(reservationResponseSchema.parse(response.body)).toMatchObject({
        id,
        status: 'confirmed',
        holdExpiresAt: null,
        guest: { name: 'Nour Hassan', email: 'nour@example.com' },
      });
      expect(await roomOf(db, id)).toBe(room);
      expect(await eventsOf(db, id)).toEqual([
        { fromStatus: null, toStatus: 'held', actor: 'guest' },
        { fromStatus: 'held', toStatus: 'confirmed', actor: 'guest' },
      ]);
    });

    it('answers 409 HOLD_EXPIRED once the hold has lapsed', async () => {
      const { id } = await placeHeldReservation();
      await lapseHold(db, id);

      const response = await confirm(id).expect(409);

      expect(response.body).toMatchObject({ code: 'HOLD_EXPIRED' });
    });

    it('replays a retry with the same key, and refuses a second confirmation', async () => {
      const { id } = await placeHeldReservation();
      const key = randomUUID();
      const first = await confirm(id, key).expect(200);

      const retry = await confirm(id, key).expect(200);
      const another = await confirm(id).expect(409);

      expect(retry.body).toEqual(first.body);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(another.body).toMatchObject({
        code: 'RESERVATION_NOT_HELD',
        detail: 'This reservation is confirmed, not on hold.',
      });
    });

    it('validates the id and the guest details', async () => {
      const { id } = await placeHeldReservation();

      const badId = await confirm('not-an-id').expect(400);
      const badEmail = await confirm(id, randomUUID(), {
        guestName: '',
        guestEmail: 'nour.example.com',
      }).expect(400);

      expect(badId.body).toMatchObject({ errors: [{ pointer: '#/id' }] });
      expect(badEmail.body).toMatchObject({
        errors: [{ pointer: '#/guestName' }, { pointer: '#/guestEmail' }],
      });
    });

    it('answers 404 for an unknown reservation', async () => {
      await confirm(randomUUID()).expect(404);
    });
  });

  describe('POST /v1/reservations/:id/release', () => {
    it('ends the hold and frees its room', async () => {
      const { slug, id } = await placeHeldReservation();
      const room = await roomOf(db, id);

      await release(id).expect(204);

      expect(await statusOf(db, id)).toBe('released');
      expect(await roomOf(db, id)).toBeUndefined();
      const next = await placeHold(app.getHttpServer(), slug).expect(201);
      expect(await roomOf(db, reservationIdOf(next))).toBe(room);
    });

    it('does nothing for a hold that has already ended', async () => {
      const { id } = await placeHeldReservation();
      await release(id).expect(204);

      await release(id).expect(204);
      expect(await eventsOf(db, id)).toHaveLength(2);
    });

    it('refuses to release a confirmed booking', async () => {
      const { id } = await placeHeldReservation();
      await confirm(id).expect(200);

      const response = await release(id).expect(409);

      expect(response.body).toMatchObject({ code: 'RESERVATION_NOT_HELD' });
      expect(await roomOf(db, id)).toBeDefined();
    });

    it('answers 404 for an unknown reservation', async () => {
      await release(randomUUID()).expect(404);
    });
  });
});
