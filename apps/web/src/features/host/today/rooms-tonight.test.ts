import type { RoomCalendarResponse } from '@stay-flow/contracts';
import { describe, expect, it } from 'vitest';
import { aHostReservation, tonightCalendar } from '@/test/fixtures';
import { minutesLeft, roomsTonight, tonightRange } from './rooms-tonight';

function oneRoom(bars: RoomCalendarResponse['unitTypes'][number]['units'][number]['bars']) {
  return {
    nights: { from: '2026-10-29', to: '2026-10-30' },
    unitTypes: [{ id: 't', name: 'Garden Double', units: [{ id: 'u', name: '101', bars }] }],
  };
}

describe('roomsTonight', () => {
  it('names what each room is doing tonight', () => {
    expect(
      roomsTonight(tonightCalendar, '2026-10-29').map(({ name, state }) => [name, state.kind]),
    ).toEqual([
      ['102', 'arriving'],
      ['103', 'held'],
      ['104', 'free'],
    ]);
  });

  it('tells a guest in house from one who has not arrived since an earlier night', () => {
    const stay = { from: '2026-10-27', to: '2026-10-31' };
    const inHouse = oneRoom([
      { kind: 'stay', nights: stay, reservation: aHostReservation({ status: 'checked_in' }) },
    ]);
    const late = oneRoom([
      { kind: 'stay', nights: stay, reservation: aHostReservation({ checkIn: '2026-10-27' }) },
    ]);

    expect(roomsTonight(inHouse, '2026-10-29')[0]?.state.kind).toBe('in_house');
    expect(roomsTonight(late, '2026-10-29')[0]?.state.kind).toBe('not_arrived');
  });

  it('keeps a block’s reason, and ignores a bar that ends before tonight', () => {
    const calendar = oneRoom([
      {
        kind: 'stay',
        nights: { from: '2026-10-26', to: '2026-10-29' },
        reservation: aHostReservation(),
      },
      {
        kind: 'block',
        id: 'b',
        nights: { from: '2026-10-29', to: '2026-11-02' },
        reason: 'Repairs',
      },
    ]);

    expect(roomsTonight(calendar, '2026-10-29')[0]?.state).toEqual({
      kind: 'blocked',
      reason: 'Repairs',
    });
  });
});

describe('tonightRange', () => {
  it('covers the one night from the date, across a month end', () => {
    expect(tonightRange('2026-10-31')).toEqual({ from: '2026-10-31', to: '2026-11-01' });
  });
});

describe('minutesLeft', () => {
  const expiresAt = Date.parse('2026-10-29T09:10:00Z');

  it('rounds up to whole minutes, and never says 0 while the hold runs', () => {
    expect(minutesLeft(expiresAt, Date.parse('2026-10-29T09:00:00Z'))).toBe(10);
    expect(minutesLeft(expiresAt, Date.parse('2026-10-29T09:04:30Z'))).toBe(6);
    expect(minutesLeft(expiresAt, Date.parse('2026-10-29T09:09:59Z'))).toBe(1);
    expect(minutesLeft(expiresAt, Date.parse('2026-10-29T09:11:00Z'))).toBe(1);
  });
});
