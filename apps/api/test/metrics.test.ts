import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { Metrics } from '../src/platform/metrics/metrics.js';
import { MetricsServer } from '../src/platform/metrics/metrics-server.js';
import { placeHold } from './support/booking.js';
import { connectTestDatabase, createInventory } from './support/fixtures.js';
import { lockRooms } from './support/room-lock.js';
import { createTestApp } from './support/test-app.js';

describe('metrics', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;
  let metricsUrl: string;

  beforeAll(async () => {
    app = await createTestApp({ env: { METRICS_PORT: '0' } });
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
});
