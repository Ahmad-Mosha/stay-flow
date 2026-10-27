import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan, nightsOf } from '../../platform/time/date-span.js';
import { type CancellableReservation, refundFor, refundOf } from './cancellation-policy.js';

const CAIRO = 'Africa/Cairo';

/** Three nights from `checkIn`: 2 000.00, then 1 500.00 a night. */
function booking(checkIn: string, freeCancellationHours = 48): CancellableReservation {
  const start = Temporal.PlainDate.from(checkIn);
  const stay = dateSpan(start, start.add({ days: 3 }));
  const nightlyRates = nightsOf(stay).map((date, night) => ({
    date,
    rateMinor: night === 0 ? 200_000 : 150_000,
  }));
  return {
    stay,
    nightlyRates,
    totalMinor: 500_000,
    policy: { freeCancellationHours, checkInTime: '15:00', checkOutTime: '11:00' },
  };
}

const at = (instant: string) => Temporal.Instant.from(instant);

describe('refundFor', () => {
  it('refunds everything until the deadline', () => {
    // Check-in 15:00 Cairo (UTC+2) on 10 December, so free until 13:00 UTC on the 8th.
    const refund = refundFor(booking('2026-12-10'), CAIRO, at('2026-12-08T12:59:59Z'));

    expect(refund).toEqual({
      freeUntil: at('2026-12-08T13:00:00Z'),
      refundMinor: 500_000,
      feeMinor: 0,
    });
  });

  it('keeps the first night from the deadline on', () => {
    const refund = refundFor(booking('2026-12-10'), CAIRO, at('2026-12-08T13:00:00Z'));

    expect(refund).toMatchObject({ refundMinor: 300_000, feeMinor: 200_000 });
  });

  it('counts exact hours across a daylight-saving change', () => {
    // Egypt's clocks go back an hour at the end of 29 October 2026. Forty-eight hours before
    // 15:00 on the 31st is 16:00 on the 29th by the wall clock, not 15:00.
    const { freeUntil } = refundFor(booking('2026-10-31'), CAIRO, at('2026-10-01T00:00:00Z'));

    expect(freeUntil.toZonedDateTimeISO(CAIRO).toPlainDateTime().toString()).toBe(
      '2026-10-29T16:00:00',
    );
  });

  it("reads check-in time in the property's time zone", () => {
    const tokyo = refundFor(booking('2026-12-10', 0), 'Asia/Tokyo', at('2026-12-01T00:00:00Z'));
    const lisbon = refundFor(booking('2026-12-10', 0), 'Europe/Lisbon', at('2026-12-01T00:00:00Z'));

    expect(tokyo.freeUntil).toEqual(at('2026-12-10T06:00:00Z'));
    expect(lisbon.freeUntil).toEqual(at('2026-12-10T15:00:00Z'));
  });

  it('never keeps more than the total', () => {
    const free = { ...booking('2026-12-10'), totalMinor: 0, nightlyRates: [] };

    expect(refundFor(free, CAIRO, at('2026-12-10T12:00:00Z'))).toMatchObject({
      refundMinor: 0,
      feeMinor: 0,
    });
  });
});

describe('refundOf', () => {
  const now = at('2026-12-09T09:00:00Z');

  it('quotes cancelling now while the booking is confirmed', () => {
    const quote = refundOf(
      { ...booking('2026-12-10'), status: 'confirmed', refundMinor: null },
      CAIRO,
      now,
    );

    expect(quote).toMatchObject({ refundMinor: 300_000, feeMinor: 200_000 });
  });

  it('shows what was refunded once cancelled, whenever it is asked', () => {
    const refund = refundOf(
      { ...booking('2026-12-10'), status: 'cancelled', refundMinor: 500_000 },
      CAIRO,
      now,
    );

    expect(refund).toEqual({
      freeUntil: at('2026-12-08T13:00:00Z'),
      refundMinor: 500_000,
      feeMinor: 0,
    });
  });

  it('has nothing to say about other statuses', () => {
    for (const status of ['held', 'checked_in', 'checked_out', 'no_show'] as const) {
      expect(refundOf({ ...booking('2026-12-10'), status, refundMinor: null }, CAIRO, now)).toBe(
        null,
      );
    }
  });
});
