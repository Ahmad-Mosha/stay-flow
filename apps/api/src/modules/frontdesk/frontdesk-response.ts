import type {
  CalendarBarResponse,
  RoomCalendarResponse,
  TodayResponse,
} from '@stay-flow/contracts';
import { toNights } from '../../platform/time/nights.js';
import { toHostReservationResponse } from '../reservations/reservation-response.js';
import type { CalendarBar, RoomCalendar, Today } from './frontdesk.service.js';

export function toRoomCalendarResponse(calendar: RoomCalendar): RoomCalendarResponse {
  return {
    nights: toNights(calendar.nights),
    unitTypes: calendar.unitTypes.map((unitType) => ({
      id: unitType.id,
      name: unitType.name,
      units: unitType.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        bars: unit.bars.map(toBarResponse),
      })),
    })),
  };
}

function toBarResponse(bar: CalendarBar): CalendarBarResponse {
  return bar.kind === 'stay'
    ? {
        kind: 'stay',
        nights: toNights(bar.nights),
        reservation: toHostReservationResponse(bar.reservation),
      }
    : { kind: 'block', id: bar.id, nights: toNights(bar.nights), reason: bar.reason };
}

export function toTodayResponse(today: Today): TodayResponse {
  const { thisMonth } = today;
  return {
    date: today.date.toString(),
    arrivals: today.arrivals.map(toHostReservationResponse),
    departures: today.departures.map(toHostReservationResponse),
    inHouse: today.inHouse.map(toHostReservationResponse),
    tonight: { ...today.tonight },
    thisMonth: {
      month: thisMonth.month.toString(),
      nightsSold: thisMonth.nightsSold,
      currency: thisMonth.currency,
      revenueMinor: thisMonth.revenueMinor,
    },
  };
}
