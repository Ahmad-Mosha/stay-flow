import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const deriveKey = promisify(argon2);

interface Cost {
  /** Memory in KiB. */
  readonly memory: number;
  readonly passes: number;
  readonly parallelism: number;
}

/** OWASP's baseline for argon2id: 19 MiB, 2 passes, 1 lane. About 150 ms on one core. */
const COST: Cost = { memory: 19_456, passes: 2, parallelism: 1 };
const SALT_BYTES = 16;
const KEY_BYTES = 32;

// The PHC string format that argon2 libraries in every language read and write.
const PHC_PATTERN =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

interface PasswordHash {
  readonly cost: Cost;
  readonly salt: Buffer;
  readonly key: Buffer;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, COST, KEY_BYTES);
  const { memory, passes, parallelism } = COST;
  return `$argon2id$v=19$m=${memory},t=${passes},p=${parallelism}$${base64(salt)}$${base64(key)}`;
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  const stored = parse(passwordHash);
  const key = await derive(password, stored.salt, stored.cost, stored.key.length);
  return timingSafeEqual(key, stored.key);
}

/** Whether the hash used other cost settings than today's, so it should be redone at sign-in. */
export function needsRehash(passwordHash: string): boolean {
  const { cost } = parse(passwordHash);
  return (
    cost.memory !== COST.memory ||
    cost.passes !== COST.passes ||
    cost.parallelism !== COST.parallelism
  );
}

async function derive(password: string, salt: Buffer, cost: Cost, length: number): Promise<Buffer> {
  // Runs on the libuv thread pool, so the event loop keeps serving other requests meanwhile.
  return deriveKey('argon2id', { message: password, nonce: salt, tagLength: length, ...cost });
}

function parse(passwordHash: string): PasswordHash {
  const match = PHC_PATTERN.exec(passwordHash);
  if (match === null) {
    throw new Error('Unsupported password hash format');
  }
  const [, memory, passes, parallelism, salt, key] = match;
  return {
    cost: { memory: Number(memory), passes: Number(passes), parallelism: Number(parallelism) },
    salt: Buffer.from(salt ?? '', 'base64'),
    key: Buffer.from(key ?? '', 'base64'),
  };
}

// PHC strings use base64 without padding.
function base64(bytes: Buffer): string {
  return bytes.toString('base64').replace(/=+$/, '');
}
