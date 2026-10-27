import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan } from '../time/date-span.js';
import { fromDateRange, toDateRange } from './date-range.js';

describe('daterange conversion', () => {
  it('round-trips a span through the PostgreSQL literal', () => {
    const span = dateSpan(
      Temporal.PlainDate.from('2026-12-01'),
      Temporal.PlainDate.from('2026-12-04'),
    );

    expect(toDateRange(span)).toBe('[2026-12-01,2026-12-04)');
    expect(fromDateRange('[2026-12-01,2026-12-04)')).toEqual(span);
  });

  it('rejects unbounded or empty ranges', () => {
    expect(() => fromDateRange('[2026-12-01,)')).toThrow(TypeError);
    expect(() => fromDateRange('empty')).toThrow(TypeError);
  });
});
