import type { NestExpressApplication } from '@nestjs/platform-express';
import { availabilityResponseSchema, blockResponseSchema } from '@stay-flow/contracts';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { createTeam } from './support/access.js';
import {
  decemberHold,
  lapseHold,
  placeHold,
  reservationIdOf,
  roomOf,
  statusOf,
} from './support/booking.js';
import { connectTestDatabase, createReservation, occupy } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// Tonight is 27 October 2026 in Cairo.
const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

const december = { from: decemberHold.checkIn, to: decemberHold.checkOut };

type Team = Awaited<ReturnType<typeof createTeam>>;

describe('blocks', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const block = (team: Team, unitId: string, nights: { from: string; to: string } = december) =>
    request(app.getHttpServer())
      .post(`/v1/host/properties/${team.propertyId}/blocks`)
      .set('Cookie', team.frontDesk.cookie)
      .send({ unitId, nights, reason: 'Repainting' });

  const unblock = (team: Team, blockId: string) =>
    request(app.getHttpServer())
      .delete(`/v1/host/properties/${team.propertyId}/blocks/${blockId}`)
      .set('Cookie', team.frontDesk.cookie);

  async function freeRoomsInDecember(slug: string): Promise<number | undefined> {
    const response = await request(app.getHttpServer())
      .get(`/v1/properties/${slug}/availability`)
      .query({ checkIn: december.from, checkOut: december.to, guests: '2' })
      .expect(200);
    return availabilityResponseSchema.parse(response.body).unitTypes[0]?.freeUnits;
  }

  describe('POST /v1/host/properties/:propertyId/blocks', () => {
    it('takes the room off sale for those nights', async () => {
      const team = await createTeam(db);

      const response = await block(team, team.unitIds[0]).expect(201);

      expect(blockResponseSchema.parse(response.body)).toMatchObject({
        unitId: team.unitIds[0],
        nights: december,
        reason: 'Repainting',
      });
      expect(await freeRoomsInDecember(team.slug)).toBe(1);
    });

    it('answers 409 UNIT_TAKEN when a stay or another block has one of the nights', async () => {
      const team = await createTeam(db);
      const { id: reservationId } = await createReservation(db, {
        ...team,
        nights: '[2026-12-19,2026-12-22)',
      });
      await occupy(db, {
        ...team,
        unitId: team.unitIds[0],
        nights: '[2026-12-19,2026-12-22)',
        reservationId,
      });
      await block(team, team.unitIds[1]).expect(201);

      const overStay = await block(team, team.unitIds[0]).expect(409);
      const overBlock = await block(team, team.unitIds[1], {
        from: '2026-12-10',
        to: '2026-12-17',
      }).expect(409);

      expect(overStay.body).toMatchObject({
        code: 'UNIT_TAKEN',
        detail: 'Room 101 is not free on all of these nights.',
      });
      expect(overBlock.body).toMatchObject({ code: 'UNIT_TAKEN' });
    });

    it('expires a hold that ran out instead of failing on it', async () => {
      const team = await createTeam(db);
      const holdId = reservationIdOf(await placeHold(app.getHttpServer(), team.slug).expect(201));
      const room = await roomOf(db, holdId);
      await lapseHold(db, holdId);

      await block(team, room ?? '').expect(201);

      expect(await statusOf(db, holdId)).toBe('expired');
      expect(await roomOf(db, holdId)).toBeUndefined();
    });

    it('answers 422 BLOCK_IN_PAST for a block that starts before tonight', async () => {
      const team = await createTeam(db);

      const response = await block(team, team.unitIds[0], {
        from: '2026-10-26',
        to: '2026-10-28',
      }).expect(422);

      expect(response.body).toMatchObject({ code: 'BLOCK_IN_PAST' });
      await block(team, team.unitIds[0], { from: '2026-10-27', to: '2026-10-28' }).expect(201);
    });

    it("answers 404 for another property's room", async () => {
      const team = await createTeam(db);
      const other = await createTeam(db);

      await block(team, other.unitIds[0]).expect(404);
    });
  });

  describe('DELETE /v1/host/properties/:propertyId/blocks/:blockId', () => {
    it('puts the room back on sale, and does nothing the second time', async () => {
      const team = await createTeam(db);
      const { id } = blockResponseSchema.parse((await block(team, team.unitIds[0])).body);

      await unblock(team, id).expect(204);
      await unblock(team, id).expect(204);

      expect(await freeRoomsInDecember(team.slug)).toBe(2);
    });

    it("answers 404 for another property's block or a stay's occupancy", async () => {
      const team = await createTeam(db);
      const other = await createTeam(db);
      const { id } = blockResponseSchema.parse((await block(other, other.unitIds[0])).body);
      const { id: reservationId } = await createReservation(db, {
        ...team,
        nights: '[2026-12-01,2026-12-03)',
      });
      const stay = await occupy(db, {
        ...team,
        unitId: team.unitIds[0],
        nights: '[2026-12-01,2026-12-03)',
        reservationId,
      });

      await unblock(team, id).expect(404);
      await unblock(team, stay.id).expect(404);
    });
  });
});
