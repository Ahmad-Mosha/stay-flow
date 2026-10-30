import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { Metrics } from '../src/platform/metrics/metrics.js';
import { MetricsServer } from '../src/platform/metrics/metrics-server.js';
import { createTeam } from './support/access.js';
import {
  confirmReservation,
  decemberHold,
  lapseHold,
  placeHold,
  releaseReservation,
  reservationCount,
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
    // The server still places the hold. Wait for it, so a later test does not count it.
    await expect.poll(() => reservationCount(db, propertyId)).toBe(1);
  });

  /** A counter's value, which only this file's application adds to. */
  async function valueOf(
    counter: 'holdsPlaced' | 'bookingConflicts' | 'holdsSoldOut' | 'holdsExpired',
  ) {
    const { values } = await app.get(Metrics)[counter].get();
    return values[0]?.value ?? 0;
  }

  /** How many reservations moved to `status`, taken by `actor`. */
  async function statusChanges(status: string, actor: string): Promise<number> {
    const { values } = await app.get(Metrics).reservationStatusChanges.get();
    const series = values.find(
      (value) => value.labels.status === status && value.labels.actor === actor,
    );
    return series?.value ?? 0;
  }

  it('counts a hold and its confirmation once each, however often the guest retries', async () => {
    const holdsBefore = await valueOf('holdsPlaced');
    const confirmedBefore = await statusChanges('confirmed', 'guest');
    const { slug } = await createInventory(db);
    const holdKey = randomUUID();
    const confirmKey = randomUUID();

    const id = reservationIdOf(await placeHold(app.getHttpServer(), slug, {}, holdKey).expect(201));
    await placeHold(app.getHttpServer(), slug, {}, holdKey).expect(201);
    await confirmReservation(app.getHttpServer(), id, confirmKey).expect(200);
    await confirmReservation(app.getHttpServer(), id, confirmKey).expect(200);

    expect(await valueOf('holdsPlaced')).toBe(holdsBefore + 1);
    expect(await statusChanges('confirmed', 'guest')).toBe(confirmedBefore + 1);
  });

  it('counts a hold the guest gave up on once', async () => {
    const before = await statusChanges('released', 'guest');
    const { slug } = await createInventory(db);
    const id = reservationIdOf(await placeHold(app.getHttpServer(), slug).expect(201));

    await releaseReservation(app.getHttpServer(), id).expect(204);
    await releaseReservation(app.getHttpServer(), id).expect(204);

    expect(await statusChanges('released', 'guest')).toBe(before + 1);
  });

  it('counts each step of a stay by who took it, and a repeated step once', async () => {
    const steps = [
      ['checked_in', 'host'],
      ['checked_out', 'host'],
      ['no_show', 'host'],
      ['cancelled', 'host'],
    ] as const;
    const before = await Promise.all(steps.map(([status, actor]) => statusChanges(status, actor)));
    const team = await createTeam(db);
    const [first, second] = team.unitIds;
    const tonight = '[2026-10-27,2026-10-29)';
    const { id: staying } = await createStay(db, { ...team, unitId: first, nights: tonight });
    const { id: missing } = await createStay(db, { ...team, unitId: second, nights: tonight });
    const { id: cancelling } = await createStay(db, {
      ...team,
      unitId: first,
      nights: '[2026-11-02,2026-11-04)',
    });
    const act = (id: string, action: string) =>
      request(app.getHttpServer())
        .post(`/v1/host/properties/${team.propertyId}/reservations/${id}/${action}`)
        .set('Cookie', team.frontDesk.cookie)
        .send(action === 'cancel' ? { reason: 'Guest called' } : {});

    await act(staying, 'check-in').expect(200);
    await act(staying, 'check-in').expect(200);
    await act(staying, 'check-out').expect(200);
    await act(missing, 'no-show').expect(200);
    await act(cancelling, 'cancel').expect(200);
    // Refused: a cancelled booking cannot be checked in, and nothing is counted.
    await act(cancelling, 'check-in').expect(409);

    const after = await Promise.all(steps.map(([status, actor]) => statusChanges(status, actor)));
    expect(after).toEqual(before.map((count) => count + 1));
  });

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

  it('counts a hold that ran out once its expiry commits, even if the block after it fails', async () => {
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

    // Expires the lapsed hold on the way, in a transaction of its own, then fails on the booked
    // room. The expiry stands: the hold was due either way.
    await block(bookedRoom).expect(409);
    expect(await statusOf(db, lapsed)).toBe('expired');
    expect(await valueOf('holdsExpired')).toBe(before + 1);

    await block(lapsedRoom).expect(201);
    expect(await valueOf('holdsExpired')).toBe(before + 1);
  });
});
