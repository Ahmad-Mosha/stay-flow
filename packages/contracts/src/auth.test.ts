import { describe, expect, it } from 'vitest';
import { signInRequestSchema, signUpRequestSchema } from './auth.js';

describe('signUpRequestSchema', () => {
  const account = { name: ' Nour Hassan ', email: ' nour@example.com ' };

  it('trims the name and email but never the password', () => {
    expect(signUpRequestSchema.parse({ ...account, password: ' a long passphrase ' })).toEqual({
      name: 'Nour Hassan',
      email: 'nour@example.com',
      password: ' a long passphrase ',
    });
  });

  it('asks for a password of at least 15 characters', () => {
    const result = signUpRequestSchema.safeParse({ ...account, password: 'short-secret' });

    expect(result.error?.issues).toMatchObject([{ path: ['password'] }]);
  });
});

describe('signInRequestSchema', () => {
  it('accepts any password that is not empty', () => {
    expect(
      signInRequestSchema.safeParse({ email: 'nour@example.com', password: 'x' }).success,
    ).toBe(true);
    expect(signInRequestSchema.safeParse({ email: 'nour@example.com', password: '' }).success).toBe(
      false,
    );
  });
});
