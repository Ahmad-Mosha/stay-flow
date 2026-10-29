import { parseDate } from '@internationalized/date';
import type { HostReservationResponse, RoomCalendarResponse } from '@stay-flow/contracts';

/** What a room is doing tonight, as the front desk thinks of it. */
export type RoomState =
  | { kind: 'free' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'held'; reservation: HostReservationResponse; expiresAt: number }
  | { kind: 'in_house'; reservation: HostReservationResponse }
  | { kind: 'arriving'; reservation: HostReservationResponse }
  /** Booked from an earlier night, and the guest has still not checked in. */
  | { kind: 'not_arrived'; reservation: HostReservationResponse };

export interface RoomTonight {
  id: string;
  name: string;
  unitType: string;
  state: RoomState;
}

/** The room calendar's range for the one night that starts on `date`. */
export function tonightRange(date: string): { from: string; to: string } {
  return { from: date, to: parseDate(date).add({ days: 1 }).toString() };
}

/** Each room's state for the night of `date`, from a room calendar that covers that night. */
export function roomsTonight(calendar: RoomCalendarResponse, date: string): RoomTonight[] {
  return calendar.unitTypes.flatMap((unitType) =>
    unitType.units.map((unit) => {
      const bar = unit.bars.find(({ nights }) => nights.from <= date && date < nights.to);
      return { id: unit.id, name: unit.name, unitType: unitType.name, state: stateOf(bar, date) };
    }),
  );
}

type Bar = RoomCalendarResponse['unitTypes'][number]['units'][number]['bars'][number];

function stateOf(bar: Bar | undefined, date: string): RoomState {
  if (!bar) return { kind: 'free' };
  if (bar.kind === 'block') return { kind: 'blocked', reason: bar.reason };
  const { reservation } = bar;
  switch (reservation.status) {
    case 'held':
      return {
        kind: 'held',
        reservation,
        expiresAt: Date.parse(reservation.holdExpiresAt ?? reservation.createdAt),
      };
    case 'checked_in':
      return { kind: 'in_house', reservation };
    case 'confirmed':
      return reservation.checkIn === date
        ? { kind: 'arriving', reservation }
        : { kind: 'not_arrived', reservation };
    default:
      // A stay that has ended holds no room: the calendar does not show one tonight.
      return { kind: 'free' };
  }
}

/** Whole minutes left on a hold, never 0 while it is still running. */
export function minutesLeft(expiresAt: number, now: number): number {
  return Math.max(Math.ceil((expiresAt - now - 1000) / 60_000), 1);
}
