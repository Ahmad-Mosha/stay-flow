import { createHash, randomBytes } from 'node:crypto';

/** A new session token: 256 random bits, given to the browser and never stored. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database keeps instead of the token. A fast hash is enough for 256 random bits. */
export function hashSessionToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
