import { Injectable } from '@nestjs/common';
import type { Temporal } from 'temporal-polyfill';
import { type DateSpan, dateSpan } from '../../platform/time/date-span.js';
import { HostInventoryService, type Occupancy } from '../inventory/host-inventory.service.js';
import type { Block, Unit } from '../inventory/inventory.service.js';
import { PropertiesService } from '../properties/properties.service.js';
import {
  type BookedNights,
  type HostReservation,
  HostReservationsService,
} from '../reservations/host-reservations.service.js';

/** A stay or a block on a room's row of the calendar. */
export type CalendarBar =
  | { readonly kind: 'stay'; readonly nights: DateSpan; readonly reservation: HostReservation }
  | ({ readonly kind: 'block' } & Block);

export interface CalendarRoom extends Unit {
  readonly bars: readonly CalendarBar[];
}

/** Rooms down the side, grouped by type; nights across the top. */
export interface RoomCalendar {
  readonly nights: DateSpan;
  readonly unitTypes: readonly {
    readonly id: string;
    readonly name: string;
    readonly units: readonly CalendarRoom[];
  }[];
}

export interface RoomCount {
  readonly rooms: number;
  readonly sold: number;
  readonly held: number;
  readonly blocked: number;
  readonly free: number;
}

export interface Today {
  readonly date: Temporal.PlainDate;
  readonly arrivals: readonly HostReservation[];
  readonly departures: readonly HostReservation[];
  readonly inHouse: readonly HostReservation[];
  readonly tonight: RoomCount;
  readonly thisMonth: BookedNights & {
    readonly month: Temporal.PlainYearMonth;
    readonly currency: string;
  };
}

/** What the front desk looks at: the room calendar and the day's work. */
@Injectable()
export class FrontdeskService {
  constructor(
    private readonly properties: PropertiesService,
    private readonly inventory: HostInventoryService,
    private readonly reservations: HostReservationsService,
  ) {}

  /** Every room, with the stays and blocks that take any night of `span`. */
  async calendar(propertyId: string, span: DateSpan): Promise<RoomCalendar> {
    const [unitTypes, occupancies] = await Promise.all([
      this.inventory.listUnitTypes(propertyId),
      this.inventory.listOccupancies(propertyId, span),
    ]);
    const stays = await this.reservations.findByIds(
      propertyId,
      occupancies.flatMap((occupancy) =>
        occupancy.kind === 'stay' ? [occupancy.reservationId] : [],
      ),
    );
    const staysById = new Map(stays.map((stay) => [stay.id, stay]));

    const barsByUnit = new Map<string, CalendarBar[]>();
    for (const occupancy of occupancies) {
      const bars = barsByUnit.get(occupancy.unitId) ?? [];
      bars.push(toBar(occupancy, staysById));
      barsByUnit.set(occupancy.unitId, bars);
    }
    return {
      nights: span,
      unitTypes: unitTypes.map((unitType) => ({
        id: unitType.id,
        name: unitType.name,
        units: unitType.units.map((unit) => ({ ...unit, bars: barsByUnit.get(unit.id) ?? [] })),
      })),
    };
  }

  /** Today where the property is: who comes and goes, who is in, and how full the rooms are. */
  async today(propertyId: string): Promise<Today> {
    const property = await this.properties.getById(propertyId);
    const date = this.properties.today(property);
    const monthStart = date.with({ day: 1 });

    const [arrivals, departures, inHouse, tonight, booked] = await Promise.all([
      this.reservations.arrivingOn(propertyId, date),
      this.reservations.departingOn(propertyId, date),
      this.reservations.inHouse(propertyId),
      this.calendar(propertyId, dateSpan(date, date.add({ days: 1 }))),
      this.reservations.bookedNights(
        propertyId,
        dateSpan(monthStart, monthStart.add({ months: 1 })),
      ),
    ]);
    return {
      date,
      arrivals,
      departures,
      inHouse,
      tonight: countRooms(tonight),
      thisMonth: { month: date.toPlainYearMonth(), currency: property.currency, ...booked },
    };
  }
}

function toBar(occupancy: Occupancy, stays: ReadonlyMap<string, HostReservation>): CalendarBar {
  if (occupancy.kind === 'block') {
    return occupancy;
  }
  const reservation = stays.get(occupancy.reservationId);
  if (reservation === undefined) {
    throw new Error(`Reservation ${occupancy.reservationId} of a stay was not found`);
  }
  return { kind: 'stay', nights: occupancy.nights, reservation };
}

/** A one-night calendar has at most one bar per room, since no two may share a night. */
function countRooms(tonight: RoomCalendar): RoomCount {
  const rooms = tonight.unitTypes.flatMap((unitType) => unitType.units);
  const bars = rooms.flatMap((room) => room.bars);
  const held = bars.filter((bar) => bar.kind === 'stay' && bar.reservation.status === 'held');
  const blocked = bars.filter((bar) => bar.kind === 'block');
  return {
    rooms: rooms.length,
    sold: bars.length - held.length - blocked.length,
    held: held.length,
    blocked: blocked.length,
    free: rooms.length - bars.length,
  };
}
