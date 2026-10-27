import type { NestExpressApplication } from '@nestjs/platform-express';
import { propertyResponseSchema } from '@stay-flow/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { connectTestDatabase, createInventory } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('GET /v1/properties/:slug', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  it('returns the public profile and stay rules of a property', async () => {
    const { slug } = await createInventory(db, {
      checkInTime: '14:00',
      minNights: 2,
      maxNights: 14,
    });

    const response = await request(app.getHttpServer()).get(`/v1/properties/${slug}`).expect(200);

    expect(propertyResponseSchema.parse(response.body)).toEqual({
      slug,
      name: 'Test Guesthouse',
      timeZone: 'Africa/Cairo',
      currency: 'EGP',
      checkInTime: '14:00',
      checkOutTime: '11:00',
      stayRules: {
        minNights: 2,
        maxNights: 14,
        bookingWindowDays: 365,
        freeCancellationHours: 48,
      },
    });
  });

  it('answers 404 for an unknown slug', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/properties/no-such-place')
      .expect(404);

    expect(response.body).toMatchObject({
      code: 'NOT_FOUND',
      detail: 'No property has this slug.',
    });
  });
});
