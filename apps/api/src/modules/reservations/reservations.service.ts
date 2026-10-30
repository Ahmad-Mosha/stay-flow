import { Inject, Injectable } from '@nestjs/common';
import type { ReservationResponse } from '@stay-flow/contracts';
import { DATABASE, type Database, type Transaction } from '../../platform/database/database.js';
import { AppError } from '../../platform/errors/app-error.js';
import { Metrics } from '../../platform/metrics/metrics.js';
import {
  IdempotencyService,
  type IdempotentResult,
} from '../../platform/idempotency/idempotency.service.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PropertiesService } from '../properties/properties.service.js';
import { reservationConfirmed } from './outbox-events.js';
import type { Guest, Reservation, ReservationStatus } from './reservation.js';
import { toReservationResponse } from './reservation-response.js';
import { type DueHolds, ReservationsRepository } from './reservations.repository.js';

export interface PlaceHold {
  /** The room type's slug. */
  readonly unitType: string;
  readonly stay: DateSpan;
  readonly guests: number;
}

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly idempotency: IdempotencyService,
    private readonly outbox: OutboxService,
    private readonly properties: PropertiesService,
    private readonly inventory: InventoryService,
    private readonly reservations: ReservationsRepository,
    private readonly metrics: Metrics,
  ) {}

  /** Holds the best-fitting free room of a type while the guest confirms. */
  async placeHold(
    slug: string,
    hold: PlaceHold,
    idempotencyKey: string,
  ): Promise<IdempotentResult<ReservationResponse>> {
    // A hold that ran out keeps its room until it is released: release the ones in the way.
    await this.releaseDueHolds(hold.stay, async (trx) => {
      const property = await this.properties.getBySlug(slug, trx);
      return (await this.inventory.getUnitType(trx, property.id, hold.unitType)).id;
    });
    const request = { scope: 'place-hold', key: idempotencyKey, payload: { slug, ...hold } };
    const result = await this.idempotency.run(request, async (trx) => {
      const property = await this.properties.getBySlug(slug, trx);
      this.properties.assertStayAllowed(property, hold.stay);
      const unitType = await this.inventory.getUnitType(trx, property.id, hold.unitType);
      if (hold.guests > unitType.maxGuests) {
        throw new AppError(
          'TOO_MANY_GUESTS',
          `${unitType.name} sleeps at most ${String(unitType.maxGuests)} guests.`,
        );
      }
      const price = await this.inventory.quote(trx, property.id, unitType, hold.stay);
      const reservation = await this.reservations.insertHold(trx, {
        propertyId: property.id,
        unitTypeId: unitType.id,
        stay: hold.stay,
        guests: hold.guests,
        currency: property.currency,
        price,
        policy: {
          freeCancellationHours: property.stayRules.freeCancellationHours,
          checkInTime: property.checkInTime.toString({ smallestUnit: 'minute' }),
          checkOutTime: property.checkOutTime.toString({ smallestUnit: 'minute' }),
        },
      });
      await this.inventory.allocateUnit(trx, {
        propertyId: property.id,
        unitTypeId: unitType.id,
        stay: hold.stay,
        reservationId: reservation.id,
      });
      return toReservationResponse(reservation, unitType);
    });
    if (!result.replayed) {
      this.metrics.holdsPlaced.inc();
    }
    return result;
  }

  /** Turns a live hold into a booking for the guest. */
  async confirm(
    id: string,
    guest: Guest,
    idempotencyKey: string,
  ): Promise<IdempotentResult<ReservationResponse>> {
    const request = {
      scope: 'confirm-reservation',
      key: idempotencyKey,
      payload: { id, ...guest },
    };
    const result = await this.idempotency.run(request, async (trx) => {
      if (!(await this.reservations.confirm(trx, id, guest))) {
        const { status } = await this.getById(trx, id);
        throw status === 'held' || status === 'expired'
          ? new AppError('HOLD_EXPIRED', 'This hold has expired. Place a new hold to book.')
          : notHeld(status);
      }
      await this.outbox.enqueue(trx, reservationConfirmed(id));
      const reservation = await this.getById(trx, id);
      const unitType = await this.inventory.getUnitTypeById(trx, reservation.unitTypeId);
      return toReservationResponse(reservation, unitType);
    });
    if (!result.replayed) {
      this.metrics.reservationStatusChanges.inc({ status: 'confirmed', actor: 'guest' });
    }
    return result;
  }

  /** Ends a hold early and frees its room. Releasing a hold that already ended does nothing. */
  async release(id: string): Promise<void> {
    const released = await this.db.transaction().execute(async (trx) => {
      if (await this.reservations.release(trx, id)) {
        await this.inventory.releaseUnits(trx, [id]);
        return true;
      }
      const { status } = await this.getById(trx, id);
      if (status !== 'released' && status !== 'expired') {
        throw notHeld(status);
      }
      return false;
    });
    if (released) {
      this.metrics.reservationStatusChanges.inc({ status: 'released', actor: 'guest' });
    }
  }

  /** Expires up to `limit` due holds, oldest first, and frees their rooms. Returns how many. */
  async expireDueHolds(limit: number): Promise<number> {
    const expired = await this.db.transaction().execute(async (trx) => this.expire(trx, { limit }));
    this.metrics.holdsExpired.inc(expired.length);
    return expired.length;
  }

  /**
   * Expires the due holds of a room type that overlap `nights`, so their rooms are free to take;
   * `unitTypeOf` finds the room type. It commits on its own, before the caller locks a room:
   * releasing a room and then locking one in a single transaction can deadlock with a writer that
   * locked that room first and is waiting for the release.
   */
  async releaseDueHolds(
    nights: DateSpan,
    unitTypeOf: (trx: Transaction) => Promise<string>,
  ): Promise<void> {
    const expired = await this.db
      .transaction()
      .execute(async (trx) =>
        this.expire(trx, { unitTypeId: await unitTypeOf(trx), overlapping: nights }),
      );
    this.metrics.holdsExpired.inc(expired.length);
  }

  private async expire(trx: Transaction, holds: DueHolds): Promise<string[]> {
    const expired = await this.reservations.expireDueHolds(trx, holds);
    await this.inventory.releaseUnits(trx, expired);
    return expired;
  }

  private async getById(trx: Transaction, id: string): Promise<Reservation> {
    const reservation = await this.reservations.findById(trx, id);
    if (reservation === undefined) {
      throw new AppError('NOT_FOUND', 'No reservation has this id.');
    }
    return reservation;
  }
}

function notHeld(status: ReservationStatus): AppError {
  return new AppError(
    'RESERVATION_NOT_HELD',
    `This reservation is ${status.replaceAll('_', ' ')}, not on hold.`,
  );
}
