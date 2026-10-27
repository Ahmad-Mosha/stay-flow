import type { NestExpressApplication } from '@nestjs/platform-express';
import { hostPropertyListResponseSchema, hostPropertyResponseSchema } from '@stay-flow/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { createSignedInUser, createTeam, roleOf } from './support/access.js';
import { connectTestDatabase, uniqueSlug } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('host properties', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const create = (cookie: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/v1/host/properties')
      .set('Cookie', cookie)
      .send({
        slug: uniqueSlug('riverside'),
        name: 'Riverside Rooms',
        timeZone: 'Africa/Cairo',
        currency: 'EGP',
        ...body,
      });

  describe('POST /v1/host/properties', () => {
    it('creates the property with its creator as owner', async () => {
      const host = await createSignedInUser(db);

      const response = await create(host.cookie).expect(201);

      const property = hostPropertyResponseSchema.parse(response.body);
      expect(property).toMatchObject({ name: 'Riverside Rooms', role: 'owner' });
      expect(property.stayRules).toEqual({
        minNights: 1,
        maxNights: 30,
        bookingWindowDays: 365,
        freeCancellationHours: 48,
      });
      expect(await roleOf(db, property.id, host.id)).toBe('owner');
    });

    it('answers 409 SLUG_TAKEN for a slug in use', async () => {
      const host = await createSignedInUser(db);
      const { slug } = await createTeam(db);

      const response = await create(host.cookie, { slug }).expect(409);

      expect(response.body).toMatchObject({ code: 'SLUG_TAKEN' });
    });

    it('rejects an unknown time zone', async () => {
      const host = await createSignedInUser(db);

      const response = await create(host.cookie, { timeZone: 'Africa/Atlantis' }).expect(400);

      expect(response.body).toMatchObject({ errors: [{ pointer: '#/timeZone' }] });
    });
  });

  describe('GET /v1/host/properties', () => {
    it("lists only the properties the user works at, with the user's role", async () => {
      const team = await createTeam(db);
      await createTeam(db);

      const response = await request(app.getHttpServer())
        .get('/v1/host/properties')
        .set('Cookie', team.manager.cookie)
        .expect(200);

      expect(hostPropertyListResponseSchema.parse(response.body)).toEqual({
        properties: [
          { id: team.propertyId, slug: team.slug, name: 'Test Guesthouse', role: 'manager' },
        ],
      });
    });
  });

  describe('GET /v1/host/properties/:propertyId', () => {
    it("shows the property with the user's role there", async () => {
      const team = await createTeam(db);

      const response = await request(app.getHttpServer())
        .get(`/v1/host/properties/${team.propertyId}`)
        .set('Cookie', team.frontDesk.cookie)
        .expect(200);

      expect(response.body).toMatchObject({ id: team.propertyId, role: 'front_desk' });
    });
  });
});
