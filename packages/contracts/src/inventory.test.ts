import { describe, expect, it } from 'vitest';
import { createUnitTypeRequestSchema, updateUnitTypeRequestSchema } from './inventory.js';

describe('createUnitTypeRequestSchema', () => {
  it('defaults the description to empty', () => {
    expect(
      createUnitTypeRequestSchema.parse({
        slug: 'family-suite',
        name: 'Family Suite',
        maxGuests: 4,
        baseRateMinor: 450_000,
      }),
    ).toMatchObject({ description: '' });
  });
});

describe('updateUnitTypeRequestSchema', () => {
  it('cannot change the slug', () => {
    expect(updateUnitTypeRequestSchema.parse({ slug: 'new', name: 'Suite' })).toEqual({
      name: 'Suite',
    });
  });

  it('rejects a body that changes nothing', () => {
    expect(updateUnitTypeRequestSchema.safeParse({ slug: 'new' }).success).toBe(false);
  });
});
