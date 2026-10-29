import { describe, expect, it } from 'vitest';
import { createPropertyRequestSchema, updatePropertyRequestSchema } from './properties.js';

describe('createPropertyRequestSchema', () => {
  const property = {
    slug: 'nile-loft',
    name: 'Nile Loft',
    timeZone: 'Africa/Cairo',
    currency: 'EGP',
  };

  it('takes a new property', () => {
    expect(createPropertyRequestSchema.parse(property)).toEqual(property);
  });

  it('keeps the slugs of the dashboard pages for the dashboard', () => {
    const result = createPropertyRequestSchema.safeParse({ ...property, slug: 'new' });

    expect(result.error?.issues).toMatchObject([{ path: ['slug'] }]);
  });
});

describe('updatePropertyRequestSchema', () => {
  it('takes any subset of the settings', () => {
    expect(updatePropertyRequestSchema.parse({ stayRules: { minNights: 2 } })).toEqual({
      stayRules: { minNights: 2 },
    });
  });

  it('rejects a body that changes nothing', () => {
    for (const body of [{}, { stayRules: {} }]) {
      expect(updatePropertyRequestSchema.safeParse(body).success).toBe(false);
    }
  });

  it('rejects a longest stay shorter than the shortest', () => {
    const result = updatePropertyRequestSchema.safeParse({
      stayRules: { minNights: 3, maxNights: 2 },
    });

    expect(result.error?.issues).toMatchObject([{ path: ['stayRules', 'maxNights'] }]);
  });
});
