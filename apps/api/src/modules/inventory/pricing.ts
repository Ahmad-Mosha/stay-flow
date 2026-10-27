import type { Temporal } from 'temporal-polyfill';
import { type DateSpan, nightsOf, spanContains } from '../../platform/time/date-span.js';

export interface RateOverride {
  readonly nights: DateSpan;
  readonly rateMinor: number;
}

export interface NightlyRate {
  readonly date: Temporal.PlainDate;
  readonly rateMinor: number;
}

export interface StayPrice {
  readonly nightlyRates: readonly NightlyRate[];
  readonly totalMinor: number;
}

/** Prices each night at its override, or the base rate. Overrides never overlap (a DB constraint). */
export function priceStay(
  stay: DateSpan,
  baseRateMinor: number,
  overrides: readonly RateOverride[],
): StayPrice {
  const nightlyRates = nightsOf(stay).map((date) => ({
    date,
    rateMinor:
      overrides.find((override) => spanContains(override.nights, date))?.rateMinor ?? baseRateMinor,
  }));
  const totalMinor = nightlyRates.reduce((total, night) => total + night.rateMinor, 0);
  return { nightlyRates, totalMinor };
}
