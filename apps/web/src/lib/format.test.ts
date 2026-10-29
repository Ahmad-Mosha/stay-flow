import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatDate,
  formatDateSpan,
  formatDateTime,
  formatDayRange,
  formatMoney,
  formatStay,
  formatTime,
  plural,
  toMajor,
  toMinor,
  zoneLabel,
} from './format';

describe('format', () => {
  it('formats calendar dates without shifting them to a time zone', () => {
    expect(formatDate('2026-12-16')).toBe('Wed 16 Dec');
    expect(formatDate('2026-12-16', 'long')).toBe('Wednesday, 16 December 2026');
  });

  it('writes a stay inside one month and across months', () => {
    expect(formatStay('2026-12-16', '2026-12-20')).toBe('16 to 20 December');
    expect(formatStay('2026-12-28', '2027-01-03')).toBe('28 December to 3 January');
    expect(formatDayRange('2026-12-16', '2026-12-19')).toBe('16–19 Dec');
    expect(formatDayRange('2026-12-28', '2027-01-03')).toBe('28 Dec–3 Jan');
  });

  it('turns minor units into the amount people read', () => {
    expect(formatAmount(1_100_000, 'EGP')).toBe('11,000');
    expect(formatAmount(1_234_550, 'EGP')).toBe('12,345.50');
    expect(formatAmount(5_000, 'JPY')).toBe('5,000');
    expect(formatMoney(240_000, 'EGP')).toBe('2,400 EGP');
  });

  it('converts typed amounts to minor units and back', () => {
    expect(toMinor(2400, 'EGP')).toBe(240_000);
    expect(toMinor(19.99, 'EGP')).toBe(1999);
    expect(toMinor(5000, 'JPY')).toBe(5000);
    expect(toMajor(240_000, 'EGP')).toBe(2400);
  });

  it('adds the year to a date span only when it is not this one', () => {
    expect(formatDateSpan('2026-10-29', '2026-11-01', '2026')).toBe('29 Oct – 1 Nov');
    expect(formatDateSpan('2027-01-20', '2027-01-23', '2026')).toBe('20 Jan – 23 Jan 2027');
    expect(formatDateSpan('2026-12-18', '2027-01-04', '2026')).toBe('18 Dec 2026 – 4 Jan 2027');
  });

  it('shows times on the property clock', () => {
    expect(formatTime('2026-12-01T12:52:00Z', 'Africa/Cairo')).toBe('14:52');
    expect(formatDateTime('2026-12-14T12:00:00Z', 'Africa/Cairo')).toBe('Mon 14 Dec, 14:00');
    expect(zoneLabel('America/New_York')).toBe('New York time');
  });

  it('pluralises counts', () => {
    expect(plural(1, 'night')).toBe('1 night');
    expect(plural(4, 'night')).toBe('4 nights');
  });
});
