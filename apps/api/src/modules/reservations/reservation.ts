import type { Temporal } from 'temporal-polyfill';
import type { ReservationStatus } from '../../platform/database/database.generated.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import type { NightlyRate } from '../inventory/pricing.js';

export type { ReservationStatus };

/** Who moved a reservation to a new status. */
export type Actor = 'guest' | 'host' | 'system';

/** The terms a guest booked under, kept in case the property changes them later. */
export interface PolicySnapshot {
  readonly freeCancellationHours: number;
  /** Such as `15:00`, in the property's time zone. */
  readonly checkInTime: string;
  readonly checkOutTime: string;
}

export interface Guest {
  readonly name: string;
  readonly email: string;
}

export interface Reservation {
  readonly id: string;
  readonly reference: string;
  readonly status: ReservationStatus;
  readonly unitTypeId: string;
  readonly stay: DateSpan;
  readonly guests: number;
  readonly currency: string;
  /** The prices at the time of the hold, which the guest pays even if rates change later. */
  readonly nightlyRates: readonly NightlyRate[];
  readonly totalMinor: number;
  readonly policy: PolicySnapshot;
  /** Set when the reservation is cancelled. */
  readonly refundMinor: number | null;
  readonly holdExpiresAt: Temporal.Instant | null;
  /** Given when the guest confirms. */
  readonly guest: Guest | null;
}
