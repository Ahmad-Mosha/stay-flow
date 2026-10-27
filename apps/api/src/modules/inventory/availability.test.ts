import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan } from '../../platform/time/date-span.js';
import { calendarNights, offersFor } from './availability.js';

const date = (value: string) => Temporal.PlainDate.from(value);
const span = (start: string, end: string) => dateSpan(date(start), date(end));

const unitType = (id: string, name: string, baseRateMinor: number) => ({
  id,
  slug: id,
  name,
  description: '',
  maxGuests: 2,
  baseRateMinor,
  freeUnits: 1,
});

describe('offersFor', () => {
  it('sorts by total price, then by name', () => {
    const offers = offersFor(
      span('2026-12-01', '2026-12-03'),
      [unitType('c', 'Garden', 300), unitType('b', 'Studio', 200), unitType('a', 'Attic', 200)],
      new Map(),
    );

    expect(offers.map((offer) => [offer.name, offer.totalMinor])).toEqual([
      ['Attic', 400],
      ['Studio', 400],
      ['Garden', 600],
    ]);
  });
});

describe('calendarNights', () => {
  const free = (night: string, unitTypeId: string, baseRateMinor: number, freeUnits = 1) => ({
    night: date(night),
    unitTypeId,
    baseRateMinor,
    freeUnits,
  });

  it('is unavailable before today and when no room is free', () => {
    const nights = calendarNights(
      span('2026-10-27', '2026-10-30'),
      [free('2026-10-27', 'a', 100), free('2026-10-28', 'a', 100), free('2026-10-29', 'a', 100, 0)],
      new Map(),
      date('2026-10-28'),
    );

    expect(nights.map((night) => [night.date.toString(), night.available])).toEqual([
      ['2026-10-27', false],
      ['2026-10-28', true],
      ['2026-10-29', false],
    ]);
  });

  it('starts from the cheapest free room type, overrides included', () => {
    const overrides = new Map([
      ['a', [{ nights: span('2026-12-18', '2026-12-19'), rateMinor: 50 }]],
    ]);

    const nights = calendarNights(
      span('2026-12-17', '2026-12-19'),
      [
        free('2026-12-17', 'a', 300),
        free('2026-12-17', 'b', 200),
        free('2026-12-18', 'a', 300),
        free('2026-12-18', 'b', 200),
      ],
      overrides,
      date('2026-10-28'),
    );

    expect(nights.map((night) => night.fromRateMinor)).toEqual([200, 50]);
  });
});
