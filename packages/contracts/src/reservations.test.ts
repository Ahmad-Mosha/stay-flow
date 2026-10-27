import { describe, expect, it } from 'vitest';
import {
  confirmReservationRequestSchema,
  guestCancelRequestSchema,
  placeHoldRequestSchema,
} from './reservations.js';

describe('placeHoldRequestSchema', () => {
  const hold = { unitType: 'garden-double', checkIn: '2026-12-16', checkOut: '2026-12-20' };

  it('takes the guest count as a JSON number', () => {
    expect(placeHoldRequestSchema.safeParse({ ...hold, guests: 2 }).success).toBe(true);
    expect(placeHoldRequestSchema.safeParse({ ...hold, guests: '2' }).success).toBe(false);
  });

  it('rejects a check-out that is not after the check-in', () => {
    const result = placeHoldRequestSchema.safeParse({ ...hold, checkOut: '2026-12-16', guests: 2 });

    expect(result.error?.issues).toMatchObject([{ path: ['checkOut'] }]);
  });
});

describe('confirmReservationRequestSchema', () => {
  it('trims the guest details and checks the email', () => {
    expect(
      confirmReservationRequestSchema.parse({
        guestName: ' Nour ',
        guestEmail: ' nour@example.com ',
      }),
    ).toEqual({ guestName: 'Nour', guestEmail: 'nour@example.com' });
    expect(
      confirmReservationRequestSchema.safeParse({ guestName: 'Nour', guestEmail: 'nour' }).success,
    ).toBe(false);
  });
});

describe('guestCancelRequestSchema', () => {
  it('needs the refund the guest agreed to', () => {
    expect(guestCancelRequestSchema.parse({ expectedRefundMinor: 0 })).toEqual({
      expectedRefundMinor: 0,
    });
    expect(guestCancelRequestSchema.safeParse({}).success).toBe(false);
    expect(guestCancelRequestSchema.safeParse({ expectedRefundMinor: -1 }).success).toBe(false);
  });

  it('trims the reason', () => {
    expect(
      guestCancelRequestSchema.parse({ expectedRefundMinor: 100, reason: ' Plans changed ' }),
    ).toMatchObject({ reason: 'Plans changed' });
  });
});
