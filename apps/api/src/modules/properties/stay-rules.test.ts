import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan } from '../../platform/time/date-span.js';
import { checkInWindow, checkStay } from './stay-rules.js';

const rules = { minNights: 2, maxNights: 7, bookingWindowDays: 60, freeCancellationHours: 48 };
const today = Temporal.PlainDate.from('2026-10-28');

const stay = (start: string, end: string) =>
  dateSpan(Temporal.PlainDate.from(start), Temporal.PlainDate.from(end));

const violationOf = (start: string, end: string) => checkStay(rules, stay(start, end), today)?.code;

describe('checkStay', () => {
  it('allows a stay that follows every rule', () => {
    expect(violationOf('2026-11-01', '2026-11-04')).toBeUndefined();
  });

  it('allows checking in today, but not yesterday', () => {
    expect(violationOf('2026-10-28', '2026-10-30')).toBeUndefined();
    expect(violationOf('2026-10-27', '2026-10-30')).toBe('CHECK_IN_PASSED');
  });

  it('allows checking in on the last day of the booking window, but not after it', () => {
    expect(violationOf('2026-12-27', '2026-12-29')).toBeUndefined();
    expect(violationOf('2026-12-28', '2026-12-30')).toBe('CHECK_IN_TOO_FAR');
  });

  it('enforces the minimum and maximum number of nights', () => {
    expect(violationOf('2026-11-01', '2026-11-02')).toBe('STAY_TOO_SHORT');
    expect(violationOf('2026-11-01', '2026-11-08')).toBeUndefined();
    expect(violationOf('2026-11-01', '2026-11-09')).toBe('STAY_TOO_LONG');
  });

  it('counts nights by date across a daylight-saving change', () => {
    const spring = Temporal.PlainDate.from('2026-03-20');

    // Europe/London moves its clocks forward on 2026-03-29; the stay is still 7 nights.
    expect(checkStay(rules, stay('2026-03-25', '2026-04-01'), spring)).toBeUndefined();
  });

  it('explains the broken rule in the detail', () => {
    expect(checkStay(rules, stay('2026-11-01', '2026-11-02'), today)?.detail).toBe(
      'Stays here are at least 2 nights.',
    );
  });
});

describe('checkInWindow', () => {
  it('runs from today to the end of the booking window', () => {
    const window = checkInWindow(rules, today);

    expect([window.earliest.toString(), window.latest.toString()]).toEqual([
      '2026-10-28',
      '2026-12-27',
    ]);
  });
});
