import { describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/format';
import { weeksCalendar } from '@/test/fixtures';
import {
  freeRooms,
  placementOf,
  shiftWindow,
  windowFor,
  windowFromSearch,
  windowLabel,
  windowOf,
} from './tape';

describe('windowFor', () => {
  it('shows three weeks of nights from the anchor', () => {
    const range = windowFor('3w', '2026-10-26');

    expect(range).toMatchObject({ from: '2026-10-26', to: '2026-11-16' });
    expect(range.days).toHaveLength(21);
    expect(range.days.at(-1)).toBe('2026-11-15');
  });

  it('shows a whole month from its first night, however long the month is', () => {
    expect(windowFor('month', '2026-10-29')).toMatchObject({
      from: '2026-10-01',
      to: '2026-11-01',
    });
    expect(windowFor('month', '2027-02-14').days).toHaveLength(28);
  });
});

describe('windowFromSearch', () => {
  const today = '2026-10-29';

  it('opens three weeks from three nights before today by default', () => {
    expect(windowFromSearch({}, today)).toMatchObject({ view: '3w', from: '2026-10-26' });
  });

  it('follows the address, and ignores what it cannot read', () => {
    expect(windowFromSearch({ view: 'month' }, today)).toMatchObject({ from: '2026-10-01' });
    expect(windowFromSearch({ view: '2w', from: '2026-12-01' }, today)).toMatchObject({
      from: '2026-12-01',
      to: '2026-12-15',
    });
    expect(windowFromSearch({ view: 'year', from: '2026-02-30' }, today)).toMatchObject({
      view: '3w',
      from: '2026-10-26',
    });
  });
});

describe('shiftWindow', () => {
  it('steps a week at a time, or a month', () => {
    expect(shiftWindow(windowFor('3w', '2026-10-26'), 1).from).toBe('2026-11-02');
    const september = shiftWindow(windowFor('month', '2026-10-01'), -1);
    expect(september).toMatchObject({ from: '2026-09-01', to: '2026-10-01' });
    expect(september.days).toHaveLength(30);
  });
});

describe('placementOf', () => {
  const range = windowFor('3w', '2026-10-26');

  it('runs a stay from midday on its first day to midday on the day it ends', () => {
    expect(placementOf({ from: '2026-10-29', to: '2026-11-01' }, range)).toEqual({
      start: 3.5,
      end: 6.5,
      clippedStart: false,
      clippedEnd: false,
    });
  });

  it('cuts a stay off at the edges of the window', () => {
    expect(placementOf({ from: '2026-10-20', to: '2026-10-28' }, range)).toEqual({
      start: 0,
      end: 2.5,
      clippedStart: true,
      clippedEnd: false,
    });
    expect(placementOf({ from: '2026-11-14', to: '2026-11-20' }, range)).toMatchObject({
      end: 21,
      clippedEnd: true,
    });
  });

  it('leaves out stays outside the window', () => {
    expect(placementOf({ from: '2026-11-20', to: '2026-11-22' }, range)).toBeNull();
    expect(placementOf({ from: '2026-10-20', to: '2026-10-25' }, range)).toBeNull();
  });
});

describe('freeRooms', () => {
  it('counts the rooms no stay or block takes on each night', () => {
    const free = freeRooms(weeksCalendar, windowOf(weeksCalendar.nights, '3w'));

    // 26 Oct: Omar in 102. 29 Oct: Sara in 102. 2 Nov: 104 blocked. 6 Nov: all free.
    expect([free[0], free[3], free[7], free[11]]).toEqual([2, 2, 2, 3]);
  });
});

describe('windowLabel', () => {
  it('names the first and last nights', () => {
    expect(
      windowLabel(windowFor('3w', '2026-10-26'), (date) => formatDate(date, 'dayShortMonth')),
    ).toBe('26 Oct – 15 Nov 2026');
  });
});
