import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  hostPropertyResponseSchema,
  hostUnitTypeListResponseSchema,
  hostUnitTypeResponseSchema,
  rateOverrideListResponseSchema,
  rateOverrideResponseSchema,
  reservationResponseSchema,
  unitResponseSchema,
} from '@stay-flow/contracts';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { createTeam } from './support/access.js';
import { placeHold } from './support/booking.js';
import { connectTestDatabase } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// Tonight is 27 October 2026 in Cairo.
const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

describe('host inventory', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const api = () => request(app.getHttpServer());

  describe('PATCH /v1/host/properties/:propertyId', () => {
    it('changes the settings that are sent and keeps the rest', async () => {
      const { propertyId, slug, manager } = await createTeam(db);

      const response = await api()
        .patch(`/v1/host/properties/${propertyId}`)
        .set('Cookie', manager.cookie)
        .send({ name: 'Riverside Rooms', checkInTime: '14:00', stayRules: { minNights: 2 } })
        .expect(200);

      expect(hostPropertyResponseSchema.parse(response.body)).toMatchObject({
        name: 'Riverside Rooms',
        checkInTime: '14:00',
        checkOutTime: '11:00',
        stayRules: { minNights: 2, maxNights: 30 },
      });
      // Guests see the change at once.
      const publicView = await api().get(`/v1/properties/${slug}`).expect(200);
      expect(publicView.body).toMatchObject({ name: 'Riverside Rooms', checkInTime: '14:00' });
    });

    it('answers 422 STAY_RULES_CONFLICT when the change contradicts a stored rule', async () => {
      const { propertyId, owner } = await createTeam(db);

      const response = await api()
        .patch(`/v1/host/properties/${propertyId}`)
        .set('Cookie', owner.cookie)
        .send({ stayRules: { minNights: 31 } })
        .expect(422);

      expect(response.body).toMatchObject({ code: 'STAY_RULES_CONFLICT' });
    });

    it('cannot change the time zone or the currency', async () => {
      const { propertyId, owner } = await createTeam(db);

      await api()
        .patch(`/v1/host/properties/${propertyId}`)
        .set('Cookie', owner.cookie)
        .send({ timeZone: 'Europe/London', currency: 'GBP' })
        .expect(400);
    });
  });

  describe('room types', () => {
    const familySuite = {
      slug: 'family-suite',
      name: 'Family Suite',
      maxGuests: 4,
      baseRateMinor: 450_000,
    };

    it('creates a room type, with no rooms yet', async () => {
      const { propertyId, manager } = await createTeam(db);

      const response = await api()
        .post(`/v1/host/properties/${propertyId}/unit-types`)
        .set('Cookie', manager.cookie)
        .send(familySuite)
        .expect(201);

      expect(hostUnitTypeResponseSchema.parse(response.body)).toMatchObject({
        ...familySuite,
        description: '',
        units: [],
      });
    });

    it('answers 409 SLUG_TAKEN for a slug the property already uses, but not for another property', async () => {
      const team = await createTeam(db);
      const other = await createTeam(db);

      const taken = await api()
        .post(`/v1/host/properties/${team.propertyId}/unit-types`)
        .set('Cookie', team.owner.cookie)
        .send({ ...familySuite, slug: 'double' })
        .expect(409);
      expect(taken.body).toMatchObject({ code: 'SLUG_TAKEN' });

      await api()
        .post(`/v1/host/properties/${other.propertyId}/unit-types`)
        .set('Cookie', other.owner.cookie)
        .send(familySuite)
        .expect(201);
      await api()
        .post(`/v1/host/properties/${team.propertyId}/unit-types`)
        .set('Cookie', team.owner.cookie)
        .send(familySuite)
        .expect(201);
    });

    it('changes the base rate that new holds are priced at', async () => {
      const { propertyId, slug, unitTypeId, owner } = await createTeam(db);

      const response = await api()
        .patch(`/v1/host/properties/${propertyId}/unit-types/${unitTypeId}`)
        .set('Cookie', owner.cookie)
        .send({ baseRateMinor: 200_000 })
        .expect(200);

      expect(hostUnitTypeResponseSchema.parse(response.body)).toMatchObject({
        slug: 'double',
        baseRateMinor: 200_000,
        units: [{ name: '101' }, { name: '102' }],
      });
      const hold = await placeHold(app.getHttpServer(), slug, {
        checkIn: '2026-11-10',
        checkOut: '2026-11-12',
      });
      expect(reservationResponseSchema.parse(hold.body).totalMinor).toBe(400_000);
    });

    it("answers 404 for another property's room type", async () => {
      const team = await createTeam(db);
      const other = await createTeam(db);

      await api()
        .patch(`/v1/host/properties/${team.propertyId}/unit-types/${other.unitTypeId}`)
        .set('Cookie', team.owner.cookie)
        .send({ name: 'Mine now' })
        .expect(404);
    });
  });

  describe('rooms', () => {
    it('adds rooms and lists them in number order', async () => {
      const { propertyId, unitTypeId, manager } = await createTeam(db);

      for (const name of ['9', '10']) {
        const response = await api()
          .post(`/v1/host/properties/${propertyId}/units`)
          .set('Cookie', manager.cookie)
          .send({ unitTypeId, name })
          .expect(201);
        expect(unitResponseSchema.parse(response.body)).toMatchObject({ unitTypeId, name });
      }

      const response = await api()
        .get(`/v1/host/properties/${propertyId}/unit-types`)
        .set('Cookie', manager.cookie)
        .expect(200);
      const [double] = hostUnitTypeListResponseSchema.parse(response.body).unitTypes;
      expect(double?.units.map((unit) => unit.name)).toEqual(['9', '10', '101', '102']);
    });

    it('answers 409 UNIT_NAME_TAKEN for a name in use, on create and on rename', async () => {
      const { propertyId, unitTypeId, unitIds, owner } = await createTeam(db);

      const created = await api()
        .post(`/v1/host/properties/${propertyId}/units`)
        .set('Cookie', owner.cookie)
        .send({ unitTypeId, name: '101' })
        .expect(409);
      const renamed = await api()
        .patch(`/v1/host/properties/${propertyId}/units/${unitIds[1]}`)
        .set('Cookie', owner.cookie)
        .send({ name: '101' })
        .expect(409);

      expect([created.body, renamed.body]).toMatchObject([
        { code: 'UNIT_NAME_TAKEN' },
        { code: 'UNIT_NAME_TAKEN' },
      ]);
    });

    it('renames a room', async () => {
      const { propertyId, unitIds, owner } = await createTeam(db);

      const response = await api()
        .patch(`/v1/host/properties/${propertyId}/units/${unitIds[0]}`)
        .set('Cookie', owner.cookie)
        .send({ name: 'Garden Room' })
        .expect(200);

      expect(response.body).toMatchObject({ id: unitIds[0], name: 'Garden Room' });
    });

    it("answers 404 for another property's room type or room", async () => {
      const team = await createTeam(db);
      const other = await createTeam(db);

      await api()
        .post(`/v1/host/properties/${team.propertyId}/units`)
        .set('Cookie', team.owner.cookie)
        .send({ unitTypeId: other.unitTypeId, name: '501' })
        .expect(404);
      await api()
        .patch(`/v1/host/properties/${team.propertyId}/units/${other.unitIds[0]}`)
        .set('Cookie', team.owner.cookie)
        .send({ name: '501' })
        .expect(404);
    });
  });

  describe('rate overrides', () => {
    const createOverride = (
      team: { propertyId: string; unitTypeId: string; owner: { cookie: string } },
      nights: { from: string; to: string },
    ) =>
      api()
        .post(`/v1/host/properties/${team.propertyId}/rate-overrides`)
        .set('Cookie', team.owner.cookie)
        .send({ unitTypeId: team.unitTypeId, nights, rateMinor: 300_000, label: 'Long weekend' });

    it('prices the nights it covers for new holds', async () => {
      const team = await createTeam(db);

      const response = await createOverride(team, { from: '2026-11-11', to: '2026-11-12' }).expect(
        201,
      );

      expect(rateOverrideResponseSchema.parse(response.body)).toMatchObject({
        nights: { from: '2026-11-11', to: '2026-11-12' },
        rateMinor: 300_000,
        label: 'Long weekend',
      });
      const hold = await placeHold(app.getHttpServer(), team.slug, {
        checkIn: '2026-11-10',
        checkOut: '2026-11-12',
      });
      // 2 400.00 for the 10th, 3 000.00 for the 11th.
      expect(reservationResponseSchema.parse(hold.body).totalMinor).toBe(540_000);
    });

    it('answers 409 RATES_OVERLAP when another rate covers a night, and allows touching rates', async () => {
      const team = await createTeam(db);
      await createOverride(team, { from: '2026-11-11', to: '2026-11-14' }).expect(201);

      const overlapping = await createOverride(team, { from: '2026-11-13', to: '2026-11-15' });

      expect(overlapping.status).toBe(409);
      expect(overlapping.body).toMatchObject({ code: 'RATES_OVERLAP' });
      await createOverride(team, { from: '2026-11-14', to: '2026-11-15' }).expect(201);
    });

    it('lists the rates that are not over yet, in date order', async () => {
      const team = await createTeam(db);
      for (const nights of [
        { from: '2026-12-01', to: '2026-12-03' },
        { from: '2026-10-20', to: '2026-10-24' },
        // Its last night was yesterday.
        { from: '2026-10-24', to: '2026-10-27' },
        { from: '2026-10-27', to: '2026-10-28' },
      ]) {
        await createOverride(team, nights).expect(201);
      }

      const response = await api()
        .get(`/v1/host/properties/${team.propertyId}/rate-overrides`)
        .set('Cookie', team.owner.cookie)
        .expect(200);

      const { rateOverrides } = rateOverrideListResponseSchema.parse(response.body);
      expect(rateOverrides.map((override) => override.nights.from)).toEqual([
        '2026-10-27',
        '2026-12-01',
      ]);
    });

    it("deletes a rate, and answers 404 for one that is gone or another property's", async () => {
      const team = await createTeam(db);
      const other = await createTeam(db);
      const created = await createOverride(team, { from: '2026-11-11', to: '2026-11-12' });
      const { id } = rateOverrideResponseSchema.parse(created.body);
      const path = (propertyId: string) => `/v1/host/properties/${propertyId}/rate-overrides/${id}`;

      await api().delete(path(other.propertyId)).set('Cookie', other.owner.cookie).expect(404);
      await api().delete(path(team.propertyId)).set('Cookie', team.owner.cookie).expect(204);
      await api().delete(path(team.propertyId)).set('Cookie', team.owner.cookie).expect(404);
    });

    it("answers 404 for another property's room type", async () => {
      const team = await createTeam(db);
      const other = await createTeam(db);

      await createOverride(
        { ...team, unitTypeId: other.unitTypeId },
        { from: '2026-11-11', to: '2026-11-12' },
      ).expect(404);
    });
  });
});
