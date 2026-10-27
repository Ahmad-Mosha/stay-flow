import { setTimeout as sleep } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { teamResponseSchema } from '@stay-flow/contracts';
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { createSignedInUser, createTeam, roleOf, setRole } from './support/access.js';
import { uniqueEmail } from './support/auth.js';
import { connectTestDatabase } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

describe('team', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const membersPath = (propertyId: string) => `/v1/host/properties/${propertyId}/members`;

  it('lists the team in the order people joined', async () => {
    const { propertyId, frontDesk } = await createTeam(db);

    const response = await request(app.getHttpServer())
      .get(membersPath(propertyId))
      .set('Cookie', frontDesk.cookie)
      .expect(200);

    const { members } = teamResponseSchema.parse(response.body);
    expect(members.map((member) => member.role)).toEqual(['owner', 'manager', 'front_desk']);
  });

  it('adds someone by their account email, which gives them access', async () => {
    const { propertyId, owner } = await createTeam(db);
    const newcomer = await createSignedInUser(db, 'Salma');

    const response = await request(app.getHttpServer())
      .post(membersPath(propertyId))
      .set('Cookie', owner.cookie)
      .send({ email: newcomer.email.toUpperCase(), role: 'manager' })
      .expect(201);

    expect(response.body).toMatchObject({ userId: newcomer.id, name: 'Salma', role: 'manager' });
    await request(app.getHttpServer())
      .get(`/v1/host/properties/${propertyId}`)
      .set('Cookie', newcomer.cookie)
      .expect(200);
  });

  it('answers 422 for an email without an account, and 409 for a member', async () => {
    const { propertyId, owner, manager } = await createTeam(db);
    const add = (email: string) =>
      request(app.getHttpServer())
        .post(membersPath(propertyId))
        .set('Cookie', owner.cookie)
        .send({ email, role: 'front_desk' });

    const unknown = await add(uniqueEmail()).expect(422);
    const member = await add(manager.email).expect(409);

    expect(unknown.body).toMatchObject({ code: 'NO_ACCOUNT' });
    expect(member.body).toMatchObject({ code: 'ALREADY_MEMBER' });
  });

  it('takes away access from someone removed from the team', async () => {
    const { propertyId, owner, manager } = await createTeam(db);

    await request(app.getHttpServer())
      .delete(`${membersPath(propertyId)}/${manager.id}`)
      .set('Cookie', owner.cookie)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/v1/host/properties/${propertyId}`)
      .set('Cookie', manager.cookie)
      .expect(404);
  });

  describe('every property keeps an owner', () => {
    it('stops the last owner from stepping down or leaving', async () => {
      const { propertyId, owner } = await createTeam(db);
      const ownMembership = `${membersPath(propertyId)}/${owner.id}`;

      const demoted = await request(app.getHttpServer())
        .patch(ownMembership)
        .set('Cookie', owner.cookie)
        .send({ role: 'manager' })
        .expect(409);
      const removed = await request(app.getHttpServer())
        .delete(ownMembership)
        .set('Cookie', owner.cookie)
        .expect(409);

      expect(demoted.body).toMatchObject({ code: 'LAST_OWNER' });
      expect(removed.body).toMatchObject({ code: 'LAST_OWNER' });
      expect(await roleOf(db, propertyId, owner.id)).toBe('owner');
    });

    it('lets an owner step down once someone else owns the property', async () => {
      const { propertyId, owner, manager } = await createTeam(db);
      const promote = request(app.getHttpServer())
        .patch(`${membersPath(propertyId)}/${manager.id}`)
        .set('Cookie', owner.cookie)
        .send({ role: 'owner' });
      await promote.expect(200);

      await request(app.getHttpServer())
        .patch(`${membersPath(propertyId)}/${owner.id}`)
        .set('Cookie', owner.cookie)
        .send({ role: 'manager' })
        .expect(200);
    });

    it('lets only one of two owners step down when both try at once', async () => {
      const { propertyId, owner, manager } = await createTeam(db);
      await setRole(db, propertyId, manager.id, 'owner');

      // Each transaction still sees the other person as an owner.
      const first = await db.startTransaction().execute();
      const second = await db.startTransaction().execute();
      await setRole(first, propertyId, owner.id, 'manager');
      const secondStepDown = setRole(second, propertyId, manager.id, 'manager').then(
        () => 'stepped down',
        (error: unknown) => error,
      );
      await sleep(100);
      await first.commit().execute();

      expect(await secondStepDown).toMatchObject({ constraint: 'property_members_keep_an_owner' });
      await second.rollback().execute();
      const owners = await db
        .selectFrom('propertyMembers')
        .select(sql<number>`count(*)::int`.as('count'))
        .where('propertyId', '=', propertyId)
        .where('role', '=', 'owner')
        .executeTakeFirstOrThrow();
      expect(owners.count).toBe(1);
    });
  });

  it('rejects a role that does not exist', async () => {
    const { propertyId, owner, manager } = await createTeam(db);

    await request(app.getHttpServer())
      .patch(`${membersPath(propertyId)}/${manager.id}`)
      .set('Cookie', owner.cookie)
      .send({ role: 'admin' })
      .expect(400);
  });
});
