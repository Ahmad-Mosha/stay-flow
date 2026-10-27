import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './support/test-app.js';

describe('health probes', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports liveness without touching the database', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
  });

  it('reports readiness when the database answers', async () => {
    await request(app.getHttpServer()).get('/health/ready').expect(200, { status: 'ok' });
  });

  it('keeps the probes outside the versioned API prefix', async () => {
    await request(app.getHttpServer()).get('/v1/health/live').expect(404);
  });
});

describe('health probes without a database', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    // Port 1 refuses connections immediately, which simulates a database outage.
    app = await createTestApp({
      env: { DATABASE_URL: 'postgres://nobody:nothing@127.0.0.1:1/none' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('stays live, because restarting the process would not fix the database', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });

  it('reports not ready with a problem document', async () => {
    const response = await request(app.getHttpServer()).get('/health/ready').expect(503);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      detail: 'The database is not reachable.',
      instance: '/health/ready',
    });
  });
});
