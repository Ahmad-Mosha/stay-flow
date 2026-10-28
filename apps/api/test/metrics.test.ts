import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { Metrics } from '../src/platform/metrics/metrics.js';
import { MetricsServer } from '../src/platform/metrics/metrics-server.js';
import { createTeam } from './support/access.js';
import {
  decemberHold,
  lapseHold,
  placeHold,
  reservationIdOf,
  roomOf,
  statusOf,
} from './support/booking.js';
import { connectTestDatabase, createInventory, createStay } from './support/fixtures.js';
import { lockRooms } from './support/room-lock.js';
import { createTestApp } from './support/test-app.js';

// Tonight is 27 October 2026 in Cairo.
const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

describe('metrics', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;
  let metricsUrl: string;

  beforeAll(async () => {
    app = await createTestApp({ env: { METRICS_PORT: '0' }, now });
    const address = app.get(MetricsServer).address;
    metricsUrl = `http://127.0.0.1:${String(address?.port)}/metrics`;
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  /** How many requests the API has timed with these labels. */
  async function requestCount(labels: Record<string, string>): Promise<number> {
    const { values } = await app.get(Metrics).httpRequestDuration.get();
    return values
      .filter(
        (value) =>
          value.metricName === 'http_request_duration_seconds_count' &&
          Object.entries(labels).every(
            ([name, label]) => (value.labels as Record<string, unknown>)[name] === label,
          ),
      )
      .reduce((sum, { value }) => sum + value, 0);
  }

  it('serves Prometheus metrics on a port of their own, and not on the public one', async () => {
    const response = await fetch(metricsUrl);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain; version=0.0.4; charset=utf-8');
    const body = await response.text();
    expect(body).toContain('# TYPE http_request_duration_seconds histogram');
    expect(body).toContain('# TYPE process_cpu_seconds_total counter');
    expect((await fetch(new URL('/other', metricsUrl))).status).toBe(404);
    await request(app.getHttpServer()).get('/metrics').expect(404);
  });

  it('times requests by route pattern, so every property shares one series', async () => {
    const route = { method: 'GET', route: '/v1/properties/:slug', status_code: '200' };
    const before = await requestCount(route);
    const unmatched = { route: 'unmatched', status_code: '404' };
    const unmatchedBefore = await requestCount(unmatched);

    for (const { slug } of [await createInventory(db), await createInventory(db)]) {
      await request(app.getHttpServer()).get(`/v1/properties/${slug}`).expect(200);
    }
    await request(app.getHttpServer()).get('/v1/nowhere').expect(404);

    expect(await requestCount(route)).toBe(before + 2);
    expect(await requestCount(unmatched)).toBe(unmatchedBefore + 1);
  });

  it('records a request the client gave up on as 499', async () => {
    const aborted = { route: '/v1/properties/:slug/holds', status_code: '499' };
    const before = await requestCount(aborted);
    const { propertyId, slug } = await createInventory(db);
    const rooms = await lockRooms(db, propertyId);

    // The booking waits for the room, and the client stops waiting first.
    await expect(placeHold(app.getHttpServer(), slug).timeout(200)).rejects.toThrow(/timeout/i);
    await rooms.release();

    await expect.poll(() => requestCount(aborted)).toBe(before + 1);
  });

  /** A counter's value, which only this file's application adds to. */
  async function valueOf(counter: 'bookingConflicts' | 'holdsSoldOut' | 'holdsExpired') {
    const { values } = await app.get(Metrics)[counter].get();
    return values[0]?.value ?? 0;
  }

  it('counts a hold refused because every room is taken', async () => {
    const before = await valueOf('holdsSoldOut');
    const { slug } = await createInventory(db);
    await placeHold(app.getHttpServer(), slug).expect(201);
    await placeHold(app.getHttpServer(), slug).expect(201);

    await placeHold(app.getHttpServer(), slug).expect(409);

    expect(await valueOf('holdsSoldOut')).toBe(before + 1);
  });

  it('counts the booking that loses a race for a room, which then gets the next one', async () => {
    const before = await valueOf('bookingConflicts');
    const { propertyId, slug } = await createInventory(db);
    const rooms = await lockRooms(db, propertyId);
    // Both pick the same best room, then wait to take it. Awaiting sends a request.
    const racing = [1, 2].map(async () =>
      reservationIdOf(await placeHold(app.getHttpServer(), slug).expect(201)),
    );
    await expect.poll(() => rooms.waiters(), { timeout: 5_000 }).toBe(2);

    await rooms.release();
    const holds = await Promise.all(racing);

    expect(new Set(await Promise.all(holds.map((id) => roomOf(db, id)))).size).toBe(2);
    expect(await valueOf('bookingConflicts')).toBe(before + 1);
  });

  it('counts a hold that ran out when a new hold clears it out of the way', async () => {
    const before = await valueOf('holdsExpired');
    const { slug } = await createInventory(db);
    const lapsed = reservationIdOf(await placeHold(app.getHttpServer(), slug).expect(201));
    await lapseHold(db, lapsed);

    await placeHold(app.getHttpServer(), slug).expect(201);

    expect(await statusOf(db, lapsed)).toBe('expired');
    expect(await valueOf('holdsExpired')).toBe(before + 1);
  });

  it('counts a hold that ran out once its expiry commits, and not when it rolls back', async () => {
    const before = await valueOf('holdsExpired');
    const team = await createTeam(db);
    const nights = `[${decemberHold.checkIn},${decemberHold.checkOut})`;
    const [lapsedRoom, bookedRoom] = team.unitIds;
    const { id: lapsed } = await createStay(db, {
      ...team,
      unitId: lapsedRoom,
      nights,
      status: 'held',
      holdExpiresAt: new Date(Date.now() - 60_000),
    });
    await createStay(db, { ...team, unitId: bookedRoom, nights });
    const block = (unitId: string) =>
      request(app.getHttpServer())
        .post(`/v1/host/properties/${team.propertyId}/blocks`)
        .set('Cookie', team.frontDesk.cookie)
        .send({
          unitId,
          nights: { from: decemberHold.checkIn, to: decemberHold.checkOut },
          reason: 'Repainting',
        });

    // Expires the lapsed hold on the way, then fails on the booked room and rolls back.
    await block(bookedRoom).expect(409);
    expect(await statusOf(db, lapsed)).toBe('held');
    expect(await valueOf('holdsExpired')).toBe(before);

    await block(lapsedRoom).expect(201);
    expect(await statusOf(db, lapsed)).toBe('expired');
    expect(await valueOf('holdsExpired')).toBe(before + 1);
  });
});
