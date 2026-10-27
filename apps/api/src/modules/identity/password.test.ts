import { describe, expect, it } from 'vitest';
import { hashPassword, needsRehash, verifyPassword } from './password.js';

const password = 'correct horse battery staple';

describe('password hashing', () => {
  it('writes an argon2id PHC string with a fresh salt each time', async () => {
    const [first, second] = await Promise.all([hashPassword(password), hashPassword(password)]);

    expect(first).toMatch(
      /^\$argon2id\$v=19\$m=19456,t=2,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/,
    );
    expect(first).not.toBe(second);
  });

  it('verifies the right password and rejects any other', async () => {
    const hash = await hashPassword(password);

    expect(await verifyPassword(hash, password)).toBe(true);
    expect(await verifyPassword(hash, 'correct horse battery stapler')).toBe(false);
  });

  it('reads hashes from other argon2 libraries, and asks to redo ones with older settings', async () => {
    // Both made by Python's argon2-cffi for this password.
    const current =
      '$argon2id$v=19$m=19456,t=2,p=1$T5yTg3zeZMcxvSsW8wFxbQ$E66ljl8GXhtA9ru4+VP/HKUGApRHc/SN/nkFiP1ZlzI';
    const older =
      '$argon2id$v=19$m=8192,t=3,p=1$uWBIjzvUZuMJx3jwcDveNQ$X/ENkJsVxGj5/ut+bwKVhfcUlRLnKp3ReuBddO3fO/Y';

    expect(await verifyPassword(current, password)).toBe(true);
    expect(await verifyPassword(older, password)).toBe(true);
    expect(needsRehash(current)).toBe(false);
    expect(needsRehash(older)).toBe(true);
  });
});
