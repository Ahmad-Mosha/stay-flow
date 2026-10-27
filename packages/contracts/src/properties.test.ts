import { describe, expect, it } from 'vitest';
import { updatePropertyRequestSchema } from './properties.js';

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
