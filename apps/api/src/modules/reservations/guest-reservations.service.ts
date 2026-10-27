import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, type Transaction } from '../../platform/database/database.js';
import { Clock } from '../../platform/time/clock.js';
import { GuestAccessService, type GuestLink } from '../guest-access/guest-access.service.js';
import { InventoryService, type UnitType } from '../inventory/inventory.service.js';
import { PropertiesService } from '../properties/properties.service.js';
import type { Property } from '../properties/property.js';
import { type Refund, refundOf } from './cancellation-policy.js';
import type { Reservation } from './reservation.js';
import { ReservationsRepository } from './reservations.repository.js';
import { StayLifecycleService } from './stay-lifecycle.service.js';

/** A booking as its guest sees it through the manage-booking link. */
export interface GuestReservation {
  readonly reservation: Reservation;
  readonly property: Property;
  readonly unitType: UnitType;
  /** What cancelling now would refund, or what was refunded. */
  readonly refund: Refund | null;
}

export interface GuestCancellation {
  readonly expectedRefundMinor: number;
  readonly reason?: string | undefined;
}

/** What a guest can do with their booking, without an account. */
@Injectable()
export class GuestReservationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly properties: PropertiesService,
    private readonly inventory: InventoryService,
    private readonly guestAccess: GuestAccessService,
    private readonly lifecycle: StayLifecycleService,
    private readonly reservations: ReservationsRepository,
  ) {}

  /** A new manage-booking link, for the emails sent to the guest. */
  async issueLink(id: string): Promise<GuestLink> {
    const reservation = await this.find(id);
    if (reservation.guest === null) {
      throw new Error(`Reservation ${id} has no guest to send a link to`);
    }
    return this.guestAccess.issue(reservation);
  }

  async get(id: string): Promise<GuestReservation> {
    const { reservation, unitType } = await this.db.transaction().execute(async (trx) => {
      const reservation = await this.findIn(trx, id);
      return {
        reservation,
        unitType: await this.inventory.getUnitTypeById(trx, reservation.unitTypeId),
      };
    });
    const property = await this.properties.getById(reservation.propertyId);
    return {
      reservation,
      property,
      unitType,
      refund: refundOf(reservation, property.timeZone, this.clock.now()),
    };
  }

  /** Cancels under the booked policy. The guest never gets the fee waived. */
  async cancel(id: string, cancellation: GuestCancellation): Promise<void> {
    const { propertyId } = await this.find(id);
    await this.lifecycle.cancel(propertyId, id, {
      actor: 'guest',
      reason: cancellation.reason,
      expectedRefundMinor: cancellation.expectedRefundMinor,
    });
  }

  private async find(id: string): Promise<Reservation> {
    return this.db.transaction().execute(async (trx) => this.findIn(trx, id));
  }

  /** Links point only at reservations that exist, so a missing one is a bug. */
  private async findIn(trx: Transaction, id: string): Promise<Reservation> {
    const reservation = await this.reservations.findById(trx, id);
    if (reservation === undefined) {
      throw new Error(`Reservation ${id} does not exist`);
    }
    return reservation;
  }
}
