import { Temporal } from 'temporal-polyfill';
import type { Reservation } from './reservation.js';

export interface Refund {
  /** Cancelling before this moment refunds everything. */
  readonly freeUntil: Temporal.Instant;
  readonly refundMinor: number;
  readonly feeMinor: number;
}

export type CancellableReservation = Pick<
  Reservation,
  'stay' | 'nightlyRates' | 'totalMinor' | 'policy'
>;

/** Cancelling before this moment refunds everything: `freeCancellationHours` before check-in time. */
export function freeCancellationUntil(
  { stay, policy }: Pick<Reservation, 'stay' | 'policy'>,
  timeZone: string,
): Temporal.Instant {
  const checkIn = stay.start.toZonedDateTime({
    timeZone,
    plainTime: Temporal.PlainTime.from(policy.checkInTime),
  });
  // Hours are exact time, so 48 hours stay 48 hours across a daylight-saving change.
  return checkIn.subtract({ hours: policy.freeCancellationHours }).toInstant();
}

/**
 * What cancelling at `at` pays back, by the terms the guest booked under. Free until
 * `freeCancellationHours` before check-in time on the first day; after that, the first night is
 * kept and the rest refunded.
 */
export function refundFor(
  reservation: CancellableReservation,
  timeZone: string,
  at: Temporal.Instant,
): Refund {
  const { totalMinor } = reservation;
  const freeUntil = freeCancellationUntil(reservation, timeZone);
  if (Temporal.Instant.compare(at, freeUntil) < 0) {
    return { freeUntil, refundMinor: totalMinor, feeMinor: 0 };
  }
  const firstNight = reservation.nightlyRates[0]?.rateMinor ?? totalMinor;
  const feeMinor = Math.min(firstNight, totalMinor);
  return { freeUntil, refundMinor: totalMinor - feeMinor, feeMinor };
}

/** The refund a cancellation gave, or would give now while the booking can be cancelled. */
export function refundOf(
  reservation: CancellableReservation & Pick<Reservation, 'status' | 'refundMinor'>,
  timeZone: string,
  now: Temporal.Instant,
): Refund | null {
  if (reservation.status === 'confirmed') {
    return refundFor(reservation, timeZone, now);
  }
  if (reservation.status === 'cancelled' && reservation.refundMinor !== null) {
    return {
      freeUntil: freeCancellationUntil(reservation, timeZone),
      refundMinor: reservation.refundMinor,
      feeMinor: reservation.totalMinor - reservation.refundMinor,
    };
  }
  return null;
}
