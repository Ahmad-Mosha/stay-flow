import { describe, expect, it } from 'vitest';
import {
  hostCancelRequestSchema,
  reservationListQuerySchema,
  roomCalendarQuerySchema,
} from './frontdesk.js';

describe('reservationListQuerySchema', () => {
  it('reads a comma-separated status list and defaults the page size', () => {
    expect(reservationListQuerySchema.parse({ status: 'confirmed,checked_in' })).toEqual({
      status: ['confirmed', 'checked_in'],
      limit: 25,
    });
  });

  it('rejects an unknown status', () => {
    expect(reservationListQuerySchema.safeParse({ status: 'confirmed,paid' }).success).toBe(false);
  });

  it('reads the limit from the query string and caps it at 100', () => {
    expect(reservationListQuerySchema.parse({ limit: '100' }).limit).toBe(100);
    expect(reservationListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(reservationListQuerySchema.safeParse({ limit: 'ten' }).success).toBe(false);
  });

  it('rejects dates out of order', () => {
    const result = reservationListQuerySchema.safeParse({ from: '2026-12-10', to: '2026-12-10' });

    expect(result.error?.issues).toMatchObject([{ path: ['to'] }]);
  });
});

describe('roomCalendarQuerySchema', () => {
  it('shows at most 62 nights', () => {
    expect(
      roomCalendarQuerySchema.safeParse({ from: '2026-12-01', to: '2027-02-01' }).success,
    ).toBe(true);
    expect(
      roomCalendarQuerySchema.safeParse({ from: '2026-12-01', to: '2027-02-02' }).success,
    ).toBe(false);
  });
});

describe('hostCancelRequestSchema', () => {
  it('applies the policy unless the fee is waived', () => {
    expect(hostCancelRequestSchema.parse({ reason: 'Flight cancelled' })).toEqual({
      reason: 'Flight cancelled',
      waiveFee: false,
    });
  });

  it('needs a reason', () => {
    expect(hostCancelRequestSchema.safeParse({ reason: '  ' }).success).toBe(false);
  });
});
