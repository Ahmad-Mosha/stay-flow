import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { createSignedInUser, createTeam } from './support/access.js';
import { connectTestDatabase, uniqueSlug } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

const ACTORS = ['anonymous', 'outsider', 'front_desk', 'manager', 'owner'] as const;

type Actor = (typeof ACTORS)[number];
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface Scene {
  readonly propertyId: string;
  /** The member that PATCH and DELETE act on. */
  readonly targetUserId: string;
  /** Someone with an account who is not on the team yet. */
  readonly newcomerEmail: string;
  readonly cookies: Record<Exclude<Actor, 'anonymous'>, string>;
}

interface Endpoint {
  readonly method: Method;
  /** The route as the router registers it. */
  readonly route: string;
  readonly body?: (scene: Scene) => object;
  readonly expected: Record<Actor, number>;
}

/** Any signed-in user may call it. */
function forAnyHost(status: number): Record<Actor, number> {
  return { anonymous: 401, outsider: status, front_desk: status, manager: status, owner: status };
}

/** Only members in `roles` may call it; other members get 403, outsiders a 404. */
function forRoles(roles: readonly Actor[], status: number): Record<Actor, number> {
  return {
    anonymous: 401,
    outsider: 404,
    front_desk: roles.includes('front_desk') ? status : 403,
    manager: roles.includes('manager') ? status : 403,
    owner: roles.includes('owner') ? status : 403,
  };
}

const EVERY_ROLE = ['front_desk', 'manager', 'owner'] as const;

// The expected answers, written out by hand rather than read from the policy, so a wrong
// policy entry fails here.
const endpoints: Endpoint[] = [
  { method: 'GET', route: '/v1/host/properties', expected: forAnyHost(200) },
  {
    method: 'POST',
    route: '/v1/host/properties',
    body: () => ({
      slug: uniqueSlug('new'),
      name: 'New Guesthouse',
      timeZone: 'Africa/Cairo',
      currency: 'EGP',
    }),
    expected: forAnyHost(201),
  },
  {
    method: 'GET',
    route: '/v1/host/properties/:propertyId',
    expected: forRoles(EVERY_ROLE, 200),
  },
  {
    method: 'GET',
    route: '/v1/host/properties/:propertyId/members',
    expected: forRoles(EVERY_ROLE, 200),
  },
  {
    method: 'POST',
    route: '/v1/host/properties/:propertyId/members',
    body: (scene) => ({ email: scene.newcomerEmail, role: 'front_desk' }),
    expected: forRoles(['owner'], 201),
  },
  {
    method: 'PATCH',
    route: '/v1/host/properties/:propertyId/members/:userId',
    body: () => ({ role: 'manager' }),
    expected: forRoles(['owner'], 200),
  },
  {
    method: 'DELETE',
    route: '/v1/host/properties/:propertyId/members/:userId',
    expected: forRoles(['owner'], 204),
  },
];

describe('host authorization', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  async function createScene(): Promise<Scene> {
    const team = await createTeam(db);
    const [outsider, target, newcomer] = await Promise.all([
      createTeam(db).then(({ owner }) => owner),
      createSignedInUser(db, 'Target'),
      createSignedInUser(db, 'Newcomer'),
    ]);
    await db
      .insertInto('propertyMembers')
      .values({ propertyId: team.propertyId, userId: target.id, role: 'front_desk' })
      .execute();
    return {
      propertyId: team.propertyId,
      targetUserId: target.id,
      newcomerEmail: newcomer.email,
      cookies: {
        outsider: outsider.cookie,
        front_desk: team.frontDesk.cookie,
        manager: team.manager.cookie,
        owner: team.owner.cookie,
      },
    };
  }

  function call(method: Method, path: string) {
    const agent = request(app.getHttpServer());
    switch (method) {
      case 'GET':
        return agent.get(path);
      case 'POST':
        return agent.post(path);
      case 'PATCH':
        return agent.patch(path);
      case 'DELETE':
        return agent.delete(path);
    }
  }

  describe.each(endpoints)('$method $route', (endpoint) => {
    it.each(ACTORS)('as %s', async (actor) => {
      const scene = await createScene();
      const path = endpoint.route
        .replace(':propertyId', scene.propertyId)
        .replace(':userId', scene.targetUserId);

      let pending = call(endpoint.method, path);
      if (actor !== 'anonymous') {
        pending = pending.set('Cookie', scene.cookies[actor]);
      }
      const response = await pending.send(endpoint.body?.(scene));

      expect(response.status).toBe(endpoint.expected[actor]);
    });
  });

  it('covers every host route', () => {
    expect(hostRoutes(app).sort()).toEqual(
      endpoints.map((endpoint) => `${endpoint.method} ${endpoint.route}`).sort(),
    );
  });

  it('answers 404 for a property id that is not a UUID', async () => {
    const { owner } = await createTeam(db);

    await request(app.getHttpServer())
      .get('/v1/host/properties/not-an-id')
      .set('Cookie', owner.cookie)
      .expect(404);
  });
});

interface RouterLayer {
  readonly route?: { readonly path: string; readonly methods: Record<string, boolean> };
}

/** Every `METHOD /path` the app serves under /v1/host. */
function hostRoutes(app: NestExpressApplication): string[] {
  // Express does not type `methods` on its routes.
  const { router } = app.getHttpAdapter().getInstance() as unknown as {
    router: { stack: RouterLayer[] };
  };
  return router.stack.flatMap(({ route }) =>
    route?.path.startsWith('/v1/host') === true
      ? Object.keys(route.methods).map((method) => `${method.toUpperCase()} ${route.path}`)
      : [],
  );
}
