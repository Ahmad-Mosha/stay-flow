import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan, nightsOf, spanContains } from './date-span.js';

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
});
