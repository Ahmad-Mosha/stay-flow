import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decemberHold } from './support/booking.js';
import { createTestApp } from './support/test-app.js';

const TRUSTED = 'https://app.stayflow.example';

describe('requests from other sites', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ env: { TRUSTED_ORIGINS: TRUSTED } });
  });

  afterAll(async () => {
    await app.close();
  });

  const postHold = (origin: string, secFetchSite: string) =>
    request(app.getHttpServer())
      .post('/v1/properties/no-such-place/holds')
      .set('Idempotency-Key', randomUUID())
      .set('Origin', origin)
      .set('Sec-Fetch-Site', secFetchSite)
      .send(decemberHold);

  it('turns away a state-changing request that a page on another site sent', async () => {
    const response = await postHold('https://evil.example', 'cross-site').expect(403);

    expect(response.body).toMatchObject({ code: 'CROSS_ORIGIN_REQUEST' });
  });

  it('lets a trusted origin through', async () => {
    await postHold(TRUSTED, 'same-site').expect(404);
  });

  it('never blocks reading', async () => {
    await request(app.getHttpServer())
      .get('/v1/properties/no-such-place')
      .set('Origin', 'https://evil.example')
      .set('Sec-Fetch-Site', 'cross-site')
      .expect(404);
  });
});
