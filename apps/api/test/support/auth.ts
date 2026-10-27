import { randomInt, randomUUID } from 'node:crypto';
import request from 'supertest';

type Target = Parameters<typeof request>[0];

export const PASSWORD = 'a long and private passphrase';

export function uniqueEmail(): string {
  return `host-${randomUUID().slice(0, 8)}@example.com`;
}

/** An address for one simulated client, so rate limits in one test do not reach another. */
export function newClientIp(): string {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

export function signUp(
  target: Target,
  body: { name?: string; email?: string; password?: string } = {},
  clientIp: string = newClientIp(),
) {
  return request(target)
    .post('/v1/auth/sign-up')
    .set('X-Forwarded-For', clientIp)
    .send({ name: 'Nour Hassan', email: uniqueEmail(), password: PASSWORD, ...body });
}

export function signIn(
  target: Target,
  credentials: { email: string; password: string },
  clientIp: string = newClientIp(),
) {
  return request(target)
    .post('/v1/auth/sign-in')
    .set('X-Forwarded-For', clientIp)
    .send(credentials);
}

export function me(target: Target, cookie?: string) {
  const call = request(target).get('/v1/auth/me');
  return cookie === undefined ? call : call.set('Cookie', cookie);
}

interface HttpResponse {
  readonly headers: Record<string, unknown>;
}

/** The raw Set-Cookie line for the session cookie, if the response set one. */
export function setSessionCookieOf(response: HttpResponse): string | undefined {
  const lines = response.headers['set-cookie'];
  return Array.isArray(lines)
    ? lines.find((line): line is string => typeof line === 'string' && line.startsWith('session='))
    : undefined;
}

/** The `session=<token>` pair to send back in a Cookie header. */
export function sessionCookieOf(response: HttpResponse): string {
  const pair = setSessionCookieOf(response)?.split(';', 1)[0];
  if (pair === undefined) {
    throw new Error('The response set no session cookie');
  }
  return pair;
}
