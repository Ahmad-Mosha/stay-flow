import type { Temporal } from 'temporal-polyfill';

export interface StayRules {
  readonly minNights: number;
  readonly maxNights: number;
  readonly bookingWindowDays: number;
  readonly freeCancellationHours: number;
}

export interface Property {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
  readonly currency: string;
  readonly checkInTime: Temporal.PlainTime;
  readonly checkOutTime: Temporal.PlainTime;
  readonly stayRules: StayRules;
}
