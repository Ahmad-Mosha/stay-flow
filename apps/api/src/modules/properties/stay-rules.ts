import { Temporal } from 'temporal-polyfill';
import type { ErrorCode } from '../../platform/errors/error-catalog.js';
import { type DateSpan, nightCount } from '../../platform/time/date-span.js';
import type { StayRules } from './property.js';

export interface CheckInWindow {
  readonly earliest: Temporal.PlainDate;
  readonly latest: Temporal.PlainDate;
}

export interface StayRuleViolation {
  readonly code: Extract<
    ErrorCode,
    'CHECK_IN_PASSED' | 'CHECK_IN_TOO_FAR' | 'STAY_TOO_SHORT' | 'STAY_TOO_LONG'
  >;
  readonly detail: string;
}

/** The check-in dates a guest may pick today, both included. `today` is local to the property. */
export function checkInWindow(rules: StayRules, today: Temporal.PlainDate): CheckInWindow {
  return { earliest: today, latest: today.add({ days: rules.bookingWindowDays }) };
}

/** The first rule a stay breaks, or undefined when it may be booked. */
export function checkStay(
  rules: StayRules,
  stay: DateSpan,
  today: Temporal.PlainDate,
): StayRuleViolation | undefined {
  const window = checkInWindow(rules, today);
  if (Temporal.PlainDate.compare(stay.start, window.earliest) < 0) {
    return {
      code: 'CHECK_IN_PASSED',
      detail: `Check-in ${stay.start.toString()} is before today (${today.toString()}) at this property.`,
    };
  }
  if (Temporal.PlainDate.compare(stay.start, window.latest) > 0) {
    return {
      code: 'CHECK_IN_TOO_FAR',
      detail: `Check-in can be at most ${rules.bookingWindowDays} days ahead, until ${window.latest.toString()}.`,
    };
  }

  const nights = nightCount(stay);
  if (nights < rules.minNights) {
    return { code: 'STAY_TOO_SHORT', detail: `Stays here are at least ${rules.minNights} nights.` };
  }
  if (nights > rules.maxNights) {
    return { code: 'STAY_TOO_LONG', detail: `Stays here are at most ${rules.maxNights} nights.` };
  }
  return undefined;
}
