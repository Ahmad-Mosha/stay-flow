import { describe, expect, it } from 'vitest';
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatDayRange,
  formatMoney,
  formatStay,
  formatTime,
  plural,
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
