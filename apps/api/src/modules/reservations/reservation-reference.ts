import { randomInt } from 'node:crypto';

// Crockford's base32: no I, L, O or U, so a reference reads well over the phone.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LENGTH = 8;

/** A random booking reference such as `K7M2X9PQ`: 40 bits, about a trillion values. */
export function newReference(): string {
  return Array.from({ length: LENGTH }, () => ALPHABET.charAt(randomInt(ALPHABET.length))).join('');
}
