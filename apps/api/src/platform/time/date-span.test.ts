import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan, nightCount, nightsOf, spanContains } from './date-span.js';

const date = (value: string) => Temporal.PlainDate.from(value);

describe('dateSpan', () => {
  it('rejects a span that does not move forward', () => {
    expect(() => dateSpan(date('2026-12-04'), date('2026-12-04'))).toThrow(RangeError);
    expect(() => dateSpan(date('2026-12-04'), date('2026-12-01'))).toThrow(RangeError);
  });

  it('includes the start date and excludes the end date', () => {
    const span = dateSpan(date('2026-12-01'), date('2026-12-04'));

    expect(spanContains(span, date('2026-12-01'))).toBe(true);
    expect(spanContains(span, date('2026-12-03'))).toBe(true);
    expect(spanContains(span, date('2026-12-04'))).toBe(false);
  });

  it('lists every night of a stay, across a month end', () => {
    const nights = nightsOf(dateSpan(date('2026-12-30'), date('2027-01-02')));

    expect(nights.map(String)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
  });

  it('counts nights by calendar date, so a daylight-saving change adds no night', () => {
    // Europe/London moves its clocks forward on 2026-03-29.
    expect(nightCount(dateSpan(date('2026-03-28'), date('2026-03-31')))).toBe(3);
    expect(nightCount(dateSpan(date('2026-12-30'), date('2027-01-02')))).toBe(3);
  });
});
