import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ProblemDetails } from '../src/platform/errors/problem-details.js';
import { createTestApp } from './support/test-app.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('error responses', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers an unknown route with a 404 problem document', async () => {
    const response = await request(app.getHttpServer()).get('/v1/nowhere?token=secret').expect(404);

    expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
    expect(response.body).toEqual({
      type: 'urn:stay-flow:problem:not-found',
      title: 'Not found',
      status: 404,
      detail: 'Cannot GET /v1/nowhere?token=secret',
      instance: '/v1/nowhere',
      code: 'NOT_FOUND',
      requestId: response.headers['x-request-id'],
    });
  });

  it('generates a request id and returns it in the header and the body', async () => {
    const response = await request(app.getHttpServer()).get('/v1/nowhere').expect(404);

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect((response.body as ProblemDetails).requestId).toBe(response.headers['x-request-id']);
  });

  it("reuses the caller's request id when it looks like one", async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/nowhere')
      .set('x-request-id', 'edge-proxy-7f3a9c21')
      .expect(404);

    expect(response.headers['x-request-id']).toBe('edge-proxy-7f3a9c21');
  });

  it("replaces a caller's request id that could inject into logs", async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/nowhere')
      .set('x-request-id', 'bad id; drop table')
      .expect(404);

    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });

  it('rejects a malformed JSON body with a 400 problem document that carries the request id', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/anything')
      .set('content-type', 'application/json')
      .send('{"guests": ')
      .expect(400);

    const problem = response.body as ProblemDetails;
    expect(problem).toMatchObject({ code: 'BAD_REQUEST', status: 400, instance: '/v1/anything' });
    expect(problem.requestId).toBe(response.headers['x-request-id']);
    expect(problem.requestId).toMatch(UUID_PATTERN);
  });

  it('does not advertise the framework', async () => {
    const response = await request(app.getHttpServer()).get('/health/live');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
