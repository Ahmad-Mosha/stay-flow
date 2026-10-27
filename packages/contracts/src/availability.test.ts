import { describe, expect, it } from 'vitest';
import { availabilityQuerySchema } from './availability.js';

describe('availabilityQuerySchema', () => {
  it('parses a stay from query string text', () => {
    expect(
      availabilityQuerySchema.parse({ checkIn: '2026-12-01', checkOut: '2026-12-04', guests: '2' }),
    ).toEqual({ checkIn: '2026-12-01', checkOut: '2026-12-04', guests: 2 });
  });

  it('rejects a check-out that is not after the check-in', () => {
    const result = availabilityQuerySchema.safeParse({
      checkIn: '2026-12-04',
      checkOut: '2026-12-04',
      guests: '2',
    });

    expect(result.error?.issues).toMatchObject([{ path: ['checkOut'] }]);
  });
});
