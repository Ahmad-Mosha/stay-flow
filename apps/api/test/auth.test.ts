import { createHash } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { userResponseSchema } from '@stay-flow/contracts';
import { type RawBuilder, sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import {
  me,
  newClientIp,
  PASSWORD,
  sessionCookieOf,
  setSessionCookieOf,
  signIn,
  signUp,
  uniqueEmail,
} from './support/auth.js';
import { connectTestDatabase } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

const DAY_MS = 86_400_000;
const CLEARED = /Expires=Thu, 01 Jan 1970/;

describe('auth', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const server = () => app.getHttpServer();

  async function signedUp() {
    const email = uniqueEmail();
    const response = await signUp(server(), { email }).expect(201);
    return { email, cookie: sessionCookieOf(response) };
  }

  /** The sessions table stores the SHA-256 of the cookie's token. */
  function tokenHashOf(cookie: string): Buffer {
    return createHash('sha256').update(cookie.slice('session='.length)).digest();
  }

  async function moveSessionExpiry(cookie: string, expiresAt: RawBuilder<Date>): Promise<void> {
    await db
      .updateTable('sessions')
      .set({ createdAt: sql<Date>`now() - interval '60 days'`, expiresAt })
      .where('tokenHash', '=', tokenHashOf(cookie))
      .execute();
  }

  function cookieExpiry(response: { headers: Record<string, unknown> }): number {
    return Date.parse(/Expires=([^;]+)/.exec(setSessionCookieOf(response) ?? '')?.[1] ?? '');
  }

  describe('POST /v1/auth/sign-up', () => {
    it('creates the account and signs the host in for 30 days', async () => {
      const email = uniqueEmail();

      const response = await signUp(server(), { name: ' Nour Hassan ', email }).expect(201);

      expect(userResponseSchema.parse(response.body)).toMatchObject({ name: 'Nour Hassan', email });
      expect(setSessionCookieOf(response)).toMatch(/; Path=\/;.*; HttpOnly; SameSite=Lax$/);
      expect(cookieExpiry(response) - Date.now()).toBeGreaterThan(29 * DAY_MS);
      await me(server(), sessionCookieOf(response)).expect(200, response.body);
    });

    it('stores an argon2id hash and a hash of the token, never the secrets', async () => {
      const { email, cookie } = await signedUp();

      const user = await db
        .selectFrom('users')
        .select(['id', 'passwordHash'])
        .where('email', '=', email)
        .executeTakeFirstOrThrow();
      const session = await db
        .selectFrom('sessions')
        .select('userId')
        .where('tokenHash', '=', tokenHashOf(cookie))
        .executeTakeFirst();

      expect(user.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(session).toEqual({ userId: user.id });
    });

    it('answers 409 EMAIL_TAKEN for an email that has an account, in any case', async () => {
      const { email } = await signedUp();

      const response = await signUp(server(), { email: email.toUpperCase() }).expect(409);

      expect(response.body).toMatchObject({ code: 'EMAIL_TAKEN' });
    });

    it('creates one account when the same email signs up five times at once', async () => {
      const email = uniqueEmail();

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => signUp(server(), { email })),
      );

      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409, 409, 409, 409,
      ]);
      const { count } = await db
        .selectFrom('users')
        .select((eb) => eb.fn.countAll<number>().as('count'))
        .where('email', '=', email)
        .executeTakeFirstOrThrow();
      expect(count).toBe(1);
    });

    it('asks for a password of at least 15 characters', async () => {
      const response = await signUp(server(), { password: 'short-secret' }).expect(400);

      expect(response.body).toMatchObject({ errors: [{ pointer: '#/password' }] });
    });
  });

  describe('POST /v1/auth/sign-in', () => {
    it('signs in with the right password, whatever the email case', async () => {
      const { email } = await signedUp();

      const response = await signIn(server(), {
        email: email.toUpperCase(),
        password: PASSWORD,
      }).expect(200);

      expect(response.body).toMatchObject({ email });
      await me(server(), sessionCookieOf(response)).expect(200);
    });

    it('answers a wrong password and an unknown email the same way', async () => {
      const { email } = await signedUp();

      const wrongPassword = await signIn(server(), { email, password: 'not the passphrase' });
      const unknownEmail = await signIn(server(), { email: uniqueEmail(), password: PASSWORD });

      for (const response of [wrongPassword, unknownEmail]) {
        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({
          code: 'INVALID_CREDENTIALS',
          detail: 'The email or password is incorrect.',
        });
        expect(setSessionCookieOf(response)).toBeUndefined();
      }
    });

    it('ends the session the browser had before', async () => {
      const { email, cookie } = await signedUp();

      await request(server())
        .post('/v1/auth/sign-in')
        .set('X-Forwarded-For', newClientIp())
        .set('Cookie', cookie)
        .send({ email, password: PASSWORD })
        .expect(200);

      await me(server(), cookie).expect(401);
    });

    it('redoes a hash made with older cost settings', async () => {
      const email = uniqueEmail();
      // Made by Python's argon2-cffi with m=8192,t=3 for this password.
      const olderHash =
        '$argon2id$v=19$m=8192,t=3,p=1$uWBIjzvUZuMJx3jwcDveNQ$X/ENkJsVxGj5/ut+bwKVhfcUlRLnKp3ReuBddO3fO/Y';
      await db
        .insertInto('users')
        .values({ name: 'Early Host', email, passwordHash: olderHash })
        .execute();

      await signIn(server(), { email, password: 'correct horse battery staple' }).expect(200);

      const { passwordHash } = await db
        .selectFrom('users')
        .select('passwordHash')
        .where('email', '=', email)
        .executeTakeFirstOrThrow();
      expect(passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    });

    it('allows five attempts per client and email in 15 minutes', async () => {
      const { email } = await signedUp();
      const clientIp = newClientIp();
      for (let attempt = 1; attempt <= 5; attempt++) {
        await signIn(server(), { email, password: 'not the passphrase' }, clientIp).expect(401);
      }

      const blocked = await signIn(server(), { email, password: PASSWORD }, clientIp).expect(429);

      expect(blocked.body).toMatchObject({ code: 'RATE_LIMITED' });
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(890);
      // The owner, on another connection, is not locked out.
      await signIn(server(), { email, password: PASSWORD }, newClientIp()).expect(200);
    });
  });

  describe('POST /v1/auth/sign-out', () => {
    it('ends the session and clears the cookie', async () => {
      const { cookie } = await signedUp();

      const response = await request(server())
        .post('/v1/auth/sign-out')
        .set('Cookie', cookie)
        .expect(204);

      expect(setSessionCookieOf(response)).toMatch(CLEARED);
      await me(server(), cookie).expect(401);
      const session = await db
        .selectFrom('sessions')
        .select('id')
        .where('tokenHash', '=', tokenHashOf(cookie))
        .executeTakeFirst();
      expect(session).toBeUndefined();
    });

    it('succeeds without a session', async () => {
      await request(server()).post('/v1/auth/sign-out').expect(204);
    });
  });

  describe('GET /v1/auth/me', () => {
    it('answers 401 without a session cookie', async () => {
      const response = await me(server()).expect(401);

      expect(response.body).toMatchObject({ code: 'UNAUTHENTICATED' });
    });

    it('answers 401 for an unknown token, and clears the cookie', async () => {
      const response = await me(server(), 'session=not-a-real-token').expect(401);

      expect(setSessionCookieOf(response)).toMatch(CLEARED);
    });

    it('answers 401 once the session has expired', async () => {
      const { cookie } = await signedUp();
      await moveSessionExpiry(cookie, sql<Date>`now() - interval '1 minute'`);

      await me(server(), cookie).expect(401);
    });

    it('extends a session used in its second half', async () => {
      const { cookie } = await signedUp();
      await moveSessionExpiry(cookie, sql<Date>`now() + interval '10 days'`);

      const response = await me(server(), cookie).expect(200);

      expect(cookieExpiry(response) - Date.now()).toBeGreaterThan(29 * DAY_MS);
    });

    it('leaves a session in its first half as it is', async () => {
      const { cookie } = await signedUp();

      const response = await me(server(), cookie).expect(200);

      expect(setSessionCookieOf(response)).toBeUndefined();
    });
  });
});
