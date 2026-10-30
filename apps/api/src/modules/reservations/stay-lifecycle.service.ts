import { Inject, Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database, type Transaction } from '../../platform/database/database.js';
import { AppError } from '../../platform/errors/app-error.js';
import { Metrics } from '../../platform/metrics/metrics.js';
import { OutboxService } from '../../platform/outbox/outbox.service.js';
import { Clock } from '../../platform/time/clock.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { PropertiesService } from '../properties/properties.service.js';
import { refundFor } from './cancellation-policy.js';
import { reservationCancelled } from './outbox-events.js';
import type { Actor, Reservation, ReservationStatus } from './reservation.js';
import { type Move, ReservationsRepository } from './reservations.repository.js';

/** Who took a step: a guest, the system, or a staff member. */
export interface StepBy {
  readonly actor: Actor;
  /** The staff member, when the host takes the step. */
  readonly userId?: string | undefined;
}

export interface Cancellation extends StepBy {
  readonly reason?: string | undefined;
  /** Refund everything, whatever the policy says. */
  readonly waiveFee?: boolean | undefined;
  /** The refund the canceller was shown. Cancels nothing if the refund is now different. */
  readonly expectedRefundMinor?: number | undefined;
}

const stepNames: Partial<Record<ReservationStatus, string>> = {
  checked_in: 'checked in',
  checked_out: 'checked out',
  no_show: 'marked as a no-show',
  cancelled: 'cancelled',
};

/**
 * Moves a booking through its stay: check-in, check-out, no-show and cancellation. A step that
 * was already taken changes nothing, so a retry, or two staff doing the same thing, is harmless.
 */
@Injectable()
export class StayLifecycleService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly outbox: OutboxService,
    private readonly properties: PropertiesService,
    private readonly inventory: InventoryService,
    private readonly reservations: ReservationsRepository,
    private readonly metrics: Metrics,
  ) {}

  /** From the day of arrival until the last night. */
  async checkIn(propertyId: string, id: string, by: StepBy): Promise<void> {
    const today = await this.todayAt(propertyId);
    const moved = await this.db.transaction().execute(async (trx) => {
      const reservation = await this.get(trx, propertyId, id);
      return this.advance(
        trx,
        propertyId,
        reservation,
        { from: 'confirmed', to: 'checked_in', ...by },
        () => {
          assertArrivalDue(reservation, today);
          assertStayNotOver(reservation, today);
        },
      );
    });
    this.count(moved, 'checked_in', by);
  }

  /** Any time after check-in. A guest who leaves early gives the room back from tonight. */
  async checkOut(propertyId: string, id: string, by: StepBy): Promise<void> {
    const today = await this.todayAt(propertyId);
    const moved = await this.db.transaction().execute(async (trx) => {
      const reservation = await this.get(trx, propertyId, id);
      const step: Move = { from: 'checked_in', to: 'checked_out', ...by };
      const advanced = await this.advance(trx, propertyId, reservation, step);
      if (advanced) {
        await this.inventory.endStay(trx, id, today);
      }
      return advanced;
    });
    this.count(moved, 'checked_out', by);
  }

  /** From the day of arrival, for a guest who never came. Gives the room back. */
  async markNoShow(propertyId: string, id: string, by: StepBy): Promise<void> {
    const today = await this.todayAt(propertyId);
    const moved = await this.db.transaction().execute(async (trx) => {
      const reservation = await this.get(trx, propertyId, id);
      const step: Move = { from: 'confirmed', to: 'no_show', ...by };
      const advanced = await this.advance(trx, propertyId, reservation, step, () => {
        assertArrivalDue(reservation, today);
      });
      if (advanced) {
        await this.inventory.releaseUnits(trx, [id]);
      }
      return advanced;
    });
    this.count(moved, 'no_show', by);
  }

  /**
   * Until the last night. The refund follows the policy the guest booked under, worked out at
   * this moment, and the room goes back on sale.
   */
  async cancel(propertyId: string, id: string, cancellation: Cancellation): Promise<void> {
    const property = await this.properties.getById(propertyId);
    const today = this.properties.today(property);
    const now = this.clock.now();
    const moved = await this.db.transaction().execute(async (trx) => {
      const reservation = await this.get(trx, propertyId, id);
      const refundMinor =
        cancellation.waiveFee === true
          ? reservation.totalMinor
          : refundFor(reservation, property.timeZone, now).refundMinor;
      const step: Move = {
        from: 'confirmed',
        to: 'cancelled',
        actor: cancellation.actor,
        userId: cancellation.userId,
        note: cancellation.reason,
      };
      const advanced = await this.advance(
        trx,
        propertyId,
        reservation,
        step,
        () => {
          assertStayNotOver(reservation, today);
          assertRefundAsExpected(refundMinor, cancellation.expectedRefundMinor);
        },
        { refundMinor },
      );
      if (advanced) {
        await this.inventory.releaseUnits(trx, [id]);
        await this.outbox.enqueue(trx, reservationCancelled(id, cancellation.actor));
      }
      return advanced;
    });
    this.count(moved, 'cancelled', cancellation);
  }

  /**
   * Takes the step, after `check`, and says whether it did. False when the reservation was
   * already where the step leads. Throws INVALID_TRANSITION from any other status.
   */
  private async advance(
    trx: Transaction,
    propertyId: string,
    reservation: Reservation,
    step: Move,
    check: () => void = () => undefined,
    changes: { refundMinor?: number } = {},
  ): Promise<boolean> {
    if (reservation.status === step.to) {
      return false;
    }
    if (reservation.status !== step.from) {
      throw cannotTake(step, reservation.status);
    }
    check();
    if (await this.reservations.advance(trx, propertyId, reservation.id, step, changes)) {
      return true;
    }
    // Another request moved it between our read and our update.
    const { status } = await this.get(trx, propertyId, reservation.id);
    if (status === step.to) {
      return false;
    }
    throw cannotTake(step, status);
  }

  /** Called after the transaction commits, so a step that rolled back is never counted. */
  private count(moved: boolean, status: ReservationStatus, { actor }: StepBy): void {
    if (moved) {
      this.metrics.reservationStatusChanges.inc({ status, actor });
    }
  }

  private async get(trx: Transaction, propertyId: string, id: string): Promise<Reservation> {
    const reservation = await this.reservations.findInProperty(trx, propertyId, id);
    if (reservation === undefined) {
      throw new AppError('NOT_FOUND', 'This property has no reservation with this id.');
    }
    return reservation;
  }

  private async todayAt(propertyId: string): Promise<Temporal.PlainDate> {
    return this.properties.today(await this.properties.getById(propertyId));
  }
}

function assertArrivalDue({ stay }: Reservation, today: Temporal.PlainDate): void {
  if (Temporal.PlainDate.compare(today, stay.start) < 0) {
    throw new AppError('ARRIVAL_NOT_DUE', `The guest is due on ${stay.start.toString()}.`);
  }
}

function assertStayNotOver({ stay }: Reservation, today: Temporal.PlainDate): void {
  if (Temporal.PlainDate.compare(today, stay.end) >= 0) {
    throw new AppError('STAY_ENDED', `This stay ended on ${stay.end.toString()}.`);
  }
}

function assertRefundAsExpected(refundMinor: number, expected: number | undefined): void {
  if (expected !== undefined && refundMinor !== expected) {
    throw new AppError(
      'REFUND_CHANGED',
      'The refund for cancelling has changed since it was shown. Check the new amount first.',
    );
  }
}

function cannotTake(step: Move, status: ReservationStatus): AppError {
  return new AppError(
    'INVALID_TRANSITION',
    `This reservation is ${status.replaceAll('_', ' ')}, so it cannot be ${stepNames[step.to] ?? step.to}.`,
  );
}
