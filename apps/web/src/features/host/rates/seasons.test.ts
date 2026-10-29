import { describe, expect, it } from 'vitest';
import {
  coversTonight,
  formatChange,
  placeSeason,
  rateChange,
  rateChangeLabel,
  seasonWindow,
} from './seasons';

describe('seasons', () => {
  it('shows twelve months from the start of this one, with the year where it turns', () => {
    const window = seasonWindow('2026-10-29');

    expect(window.from).toBe('2026-10-01');
    expect(window.to).toBe('2027-10-01');
    expect(window.months).toHaveLength(12);
    expect(window.months[0]).toEqual({ start: '2026-10-01', label: 'Oct', year: '2026' });
    expect(window.months[1]).toEqual({ start: '2026-11-01', label: 'Nov', year: null });
    expect(window.months[3]).toEqual({ start: '2027-01-01', label: 'Jan', year: '2027' });
  });

  it('places a season by its nights, clipped to the chart', () => {
    const window = seasonWindow('2026-10-29');
    const total = 365;

    const holidays = placeSeason({ from: '2026-12-18', to: '2027-01-05' }, window);
    expect(holidays?.left).toBeCloseTo((78 / total) * 100);
    expect(holidays?.width).toBeCloseTo((18 / total) * 100);

    const started = placeSeason({ from: '2026-09-20', to: '2026-10-11' }, window);
    expect(started).toEqual({ left: 0, width: (10 / total) * 100 });

    expect(placeSeason({ from: '2026-09-01', to: '2026-10-01' }, window)).toBeNull();
    expect(placeSeason({ from: '2027-10-01', to: '2027-10-05' }, window)).toBeNull();
  });

  it('compares a seasonal rate with the base rate', () => {
    expect(rateChange(310_000, 240_000)).toBe(29);
    expect(rateChange(200_000, 240_000)).toBe(-17);
    expect(rateChange(240_000, 0)).toBe(0);
    expect(formatChange(29)).toBe('+29%');
    expect(formatChange(-17)).toBe('−17%');
    expect(rateChangeLabel(29)).toBe('+29% on base');
    expect(rateChangeLabel(0)).toBe('Same as base');
  });

  it('knows whether a season covers tonight', () => {
    const nights = { from: '2026-12-18', to: '2027-01-05' };
    expect(coversTonight(nights, '2026-12-17')).toBe(false);
    expect(coversTonight(nights, '2026-12-18')).toBe(true);
    expect(coversTonight(nights, '2027-01-04')).toBe(true);
    expect(coversTonight(nights, '2027-01-05')).toBe(false);
  });
});
