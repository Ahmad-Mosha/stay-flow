import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan } from '../../platform/time/date-span.js';
import { priceStay } from './pricing.js';

const span = (start: string, end: string) =>
  dateSpan(Temporal.PlainDate.from(start), Temporal.PlainDate.from(end));

describe('priceStay', () => {
  it('charges the base rate for every night without an override', () => {
    const price = priceStay(span('2026-11-02', '2026-11-05'), 240_000, []);

    expect(price.totalMinor).toBe(720_000);
    expect(price.nightlyRates).toHaveLength(3);
  });

  it('uses the override for the nights it covers', () => {
    const winter = { nights: span('2026-12-18', '2027-01-05'), rateMinor: 310_000 };

    const price = priceStay(span('2026-12-16', '2026-12-20'), 240_000, [winter]);

    expect(price.nightlyRates.map((night) => [night.date.toString(), night.rateMinor])).toEqual([
      ['2026-12-16', 240_000],
      ['2026-12-17', 240_000],
      ['2026-12-18', 310_000],
      ['2026-12-19', 310_000],
    ]);
    expect(price.totalMinor).toBe(1_100_000);
  });

  it('treats the override end date as excluded', () => {
    const winter = { nights: span('2026-12-18', '2027-01-05'), rateMinor: 310_000 };

    const price = priceStay(span('2027-01-05', '2027-01-06'), 240_000, [winter]);

    expect(price.totalMinor).toBe(240_000);
  });
});
