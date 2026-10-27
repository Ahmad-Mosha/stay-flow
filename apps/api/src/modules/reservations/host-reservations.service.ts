import { Injectable } from '@nestjs/common';
import type { Temporal } from 'temporal-polyfill';
import { AppError } from '../../platform/errors/app-error.js';
import { Clock } from '../../platform/time/clock.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { HostInventoryService } from '../inventory/host-inventory.service.js';
import type { Unit, UnitType } from '../inventory/inventory.service.js';
import { PropertiesService } from '../properties/properties.service.js';
import { type Refund, refundOf } from './cancellation-policy.js';
import {
  type BookedNights,
  HostReservationsRepository,
  type ReservationEvent,
  type ReservationFilter,
  type StoredReservation,
} from './host-reservations.repository.js';
import { decodeCursor, encodeCursor } from './list-cursor.js';

export type { BookedNights, ReservationEvent, ReservationFilter };

/** A reservation with its room type's name and its room, as staff see it. */
export interface HostReservation extends StoredReservation {
  readonly unitType: Pick<UnitType, 'id' | 'name'>;
  readonly unit: Unit | null;
}

/** One reservation in full: what it refunds and everything that happened to it. */
export interface HostReservationDetail extends HostReservation {
  readonly refund: Refund | null;
  readonly events: readonly ReservationEvent[];
}

export interface ReservationListPage {
  readonly reservations: HostReservation[];
  /** Pass it back to get the next page. Null on the last page. */
  readonly nextCursor: string | null;
}

export interface PageRequest {
  readonly limit: number;
  readonly cursor?: string | undefined;
}

/** The property's reservations as its staff look them up. */
@Injectable()
export class HostReservationsService {
  constructor(
    private readonly reservations: HostReservationsRepository,
    private readonly inventory: HostInventoryService,
    private readonly properties: PropertiesService,
    private readonly clock: Clock,
  ) {}

  async get(propertyId: string, id: string): Promise<HostReservationDetail> {
    const [reservation] = await this.findByIds(propertyId, [id]);
    if (reservation === undefined) {
      throw new AppError('NOT_FOUND', 'This property has no reservation with this id.');
    }
    const [property, events] = await Promise.all([
      this.properties.getById(propertyId),
      this.reservations.listEvents(id),
    ]);
    return {
      ...reservation,
      refund: refundOf(reservation, property.timeZone, this.clock.now()),
      events,
    };
  }

  async list(
    propertyId: string,
    filter: ReservationFilter,
    page: PageRequest,
  ): Promise<ReservationListPage> {
    const after = page.cursor === undefined ? undefined : decodeCursor(page.cursor);
    const { reservations, next } = await this.reservations.list(
      propertyId,
      filter,
      page.limit,
      after,
    );
    return {
      reservations: await this.describe(propertyId, reservations),
      nextCursor: next === null ? null : encodeCursor(next),
    };
  }

  async findByIds(propertyId: string, ids: readonly string[]): Promise<HostReservation[]> {
    return this.describe(propertyId, await this.reservations.findByIds(propertyId, ids));
  }

  async arrivingOn(propertyId: string, date: Temporal.PlainDate): Promise<HostReservation[]> {
    return this.describe(propertyId, await this.reservations.arrivingOn(propertyId, date));
  }

  async departingOn(propertyId: string, date: Temporal.PlainDate): Promise<HostReservation[]> {
    return this.describe(propertyId, await this.reservations.departingOn(propertyId, date));
  }

  async inHouse(propertyId: string): Promise<HostReservation[]> {
    return this.describe(propertyId, await this.reservations.inHouse(propertyId));
  }

  async bookedNights(propertyId: string, span: DateSpan): Promise<BookedNights> {
    return this.reservations.bookedNights(propertyId, span);
  }

  /** Adds what the inventory module keeps: the room type's name and the room. */
  private async describe(
    propertyId: string,
    reservations: readonly StoredReservation[],
  ): Promise<HostReservation[]> {
    if (reservations.length === 0) {
      return [];
    }
    const [unitTypes, rooms] = await Promise.all([
      this.inventory.listUnitTypes(propertyId),
      this.inventory.roomsOf(
        propertyId,
        reservations.map((reservation) => reservation.id),
      ),
    ]);
    const unitTypeNames = new Map(unitTypes.map((unitType) => [unitType.id, unitType.name]));
    return reservations.map((reservation) => {
      const name = unitTypeNames.get(reservation.unitTypeId);
      if (name === undefined) {
        throw new Error(`Room type ${reservation.unitTypeId} is not one of the property's`);
      }
      return {
        ...reservation,
        unitType: { id: reservation.unitTypeId, name },
        unit: rooms.get(reservation.id) ?? null,
      };
    });
  }
}
