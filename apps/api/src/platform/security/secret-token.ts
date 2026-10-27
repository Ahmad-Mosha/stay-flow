import { createHash, randomBytes } from 'node:crypto';

/** A new bearer secret, such as a session token: 256 random bits, handed out and never stored. */
export function newSecretToken(): string {
  return randomBytes(32).toString('base64url');
}

/** What the database keeps instead of the token. A fast hash is enough for 256 random bits. */
export function hashSecretToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}
