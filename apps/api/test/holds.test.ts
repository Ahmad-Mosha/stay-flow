import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { reservationResponseSchema } from '@stay-flow/contracts';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import {
  eventsOf,
  lapseHold,
  placeHold,
  reservationCount,
  reservationIdOf,
  roomOf,
  statusOf,
} from './support/booking.js';
import { connectTestDatabase, createInventory, occupy } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// 2026-10-28 in Cairo, the properties' time zone.
const now = Temporal.Instant.from('2026-10-27T22:30:00Z');
const MINUTE_MS = 60_000;

describe('POST /v1/properties/:slug/holds', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const hold = (slug: string, body: Record<string, unknown> = {}, key?: string) =>
    placeHold(app.getHttpServer(), slug, body, key);

  async function createGuesthouse() {
    const inventory = await createInventory(db);
    const [room101, room102] = inventory.unitIds;
    const block = (unitId: string, nights: string) =>
      occupy(db, { propertyId: inventory.propertyId, unitId, nights, blockReason: 'Repairs' });
    return { ...inventory, room101, room102, block };
  }

  it('holds a room for ten minutes at the current prices', async () => {
    const { slug } = await createGuesthouse();
    const startedAt = Date.now();

    const response = await hold(slug).expect(201);

    const body = reservationResponseSchema.parse(response.body);
    expect(body).toMatchObject({
      status: 'held',
      unitType: { slug: 'double', name: 'Double' },
      checkIn: '2026-12-16',
      checkOut: '2026-12-20',
      nights: 4,
      guests: 2,
      currency: 'EGP',
      totalMinor: 960_000,
      guest: null,
    });
    expect(body.reference).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);
    expect(body.nightlyRates).toHaveLength(4);
    const holdMs = Date.parse(body.holdExpiresAt ?? '') - startedAt;
    expect(holdMs).toBeGreaterThan(9 * MINUTE_MS);
    expect(holdMs).toBeLessThan(11 * MINUTE_MS);

    expect(await roomOf(db, body.id)).toBeDefined();
    expect(await eventsOf(db, body.id)).toEqual([
      { fromStatus: null, toStatus: 'held', actor: 'guest' },
    ]);
  });

  it('puts the stay in the room where it fits best', async () => {
    const { slug, room102, block } = await createGuesthouse();
    // Room 102 is blocked until the 16th, so the new stay starts right as the block ends.
    await block(room102, '[2026-12-12,2026-12-16)');

    const response = await hold(slug).expect(201);

    expect(await roomOf(db, reservationIdOf(response))).toBe(room102);
  });

  it('answers 409 SOLD_OUT and keeps nothing when every room is taken', async () => {
    const { slug, propertyId, room101, room102, block } = await createGuesthouse();
    await block(room101, '[2026-12-18,2026-12-19)');
    await block(room102, '[2026-12-10,2026-12-17)');

    const response = await hold(slug).expect(409);

    expect(response.body).toMatchObject({ code: 'SOLD_OUT' });
    expect(await reservationCount(db, propertyId)).toBe(0);
  });

  it('expires the lapsed holds in its way and takes their room', async () => {
    const { slug } = await createGuesthouse();
    const first = reservationIdOf(await hold(slug).expect(201));
    const second = reservationIdOf(await hold(slug).expect(201));
    await lapseHold(db, first);
    await lapseHold(db, second);

    const third = reservationIdOf(await hold(slug).expect(201));

    for (const lapsed of [first, second]) {
      expect(await statusOf(db, lapsed)).toBe('expired');
      expect(await roomOf(db, lapsed)).toBeUndefined();
      expect(await eventsOf(db, lapsed)).toContainEqual({
        fromStatus: 'held',
        toStatus: 'expired',
        actor: 'system',
      });
    }
    expect(await roomOf(db, third)).toBeDefined();
  });

  it.each([
    ['more guests than the room sleeps', { guests: 3 }, 422, 'TOO_MANY_GUESTS'],
    ['an unknown room type', { unitType: 'suite' }, 404, 'NOT_FOUND'],
    ['a check-in that has passed', { checkIn: '2026-10-27' }, 422, 'CHECK_IN_PASSED'],
    ['guests sent as text', { guests: '2' }, 400, 'VALIDATION_FAILED'],
  ])('rejects %s', async (_case, body, status, code) => {
    const { slug } = await createGuesthouse();

    const response = await hold(slug, body).expect(status);

    expect(response.body).toMatchObject({ code });
  });

  it('names the room type and its capacity when there are too many guests', async () => {
    const { slug } = await createGuesthouse();

    const response = await hold(slug, { guests: 3 }).expect(422);

    expect(response.body).toMatchObject({ detail: 'Double sleeps at most 2 guests.' });
  });

  it('answers 404 for an unknown property', async () => {
    await hold('no-such-place').expect(404);
  });

  it('requires an Idempotency-Key header', async () => {
    const { slug } = await createGuesthouse();

    const response = await request(app.getHttpServer())
      .post(`/v1/properties/${slug}/holds`)
      .send({ unitType: 'double', checkIn: '2026-12-16', checkOut: '2026-12-20', guests: 2 })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_INVALID' });
  });

  describe('with a repeated Idempotency-Key', () => {
    it('replays the first response instead of holding a second room', async () => {
      const { slug, propertyId } = await createGuesthouse();
      const key = randomUUID();
      const first = await hold(slug, {}, key).expect(201);

      const retry = await hold(slug, {}, key).expect(201);

      expect(retry.body).toEqual(first.body);
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(await reservationCount(db, propertyId)).toBe(1);
    });

    it('rejects a different request with 422', async () => {
      const { slug } = await createGuesthouse();
      const key = randomUUID();
      await hold(slug, {}, key).expect(201);

      const response = await hold(slug, { checkOut: '2026-12-21' }, key).expect(422);

      expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    });

    it('runs a failed request again', async () => {
      const { slug, room101, room102, block } = await createGuesthouse();
      const repairs = await block(room101, '[2026-12-01,2026-12-31)');
      await block(room102, '[2026-12-01,2026-12-31)');
      const key = randomUUID();
      await hold(slug, {}, key).expect(409);

      await db
        .updateTable('occupancies')
        .set({ releasedAt: new Date() })
        .where('id', '=', repairs.id)
        .execute();

      await hold(slug, {}, key).expect(201);
    });
  });
});
