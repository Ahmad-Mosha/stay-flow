import { Injectable } from '@nestjs/common';
import { type Selectable, sql, type UpdateQueryBuilder, type Updateable } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import type { Database, Transaction } from '../../platform/database/database.js';
import type { DB, Reservations } from '../../platform/database/database.generated.js';
import { fromDateRange, toDateRange } from '../../platform/database/date-range.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import type { StayPrice } from '../inventory/pricing.js';
import { canTransition, HOLD_MINUTES } from './reservation-lifecycle.js';
import { newReference } from './reservation-reference.js';
import type {
  Actor,
  Guest,
  PolicySnapshot,
  Reservation,
  ReservationStatus,
} from './reservation.js';

export interface NewHold {
  readonly propertyId: string;
  readonly unitTypeId: string;
  readonly stay: DateSpan;
  readonly guests: number;
  readonly currency: string;
  readonly price: StayPrice;
  readonly policy: PolicySnapshot;
}

/** Due holds to expire: the oldest few, or those of one room type that overlap a stay. */
export type DueHolds =
  { readonly limit: number } | { readonly unitTypeId: string; readonly overlapping: DateSpan };

/** One step of the lifecycle, and who took it. */
export interface Move {
  readonly from: ReservationStatus;
  readonly to: ReservationStatus;
  readonly actor: Actor;
  /** The staff member, for a host's move. */
  readonly userId?: string | undefined;
  readonly note?: string | undefined;
}

type ReservationUpdate = UpdateQueryBuilder<DB, 'reservations', 'reservations', unknown>;

const priceSnapshotSchema = z.object({
  nightlyRates: z.array(z.object({ date: z.iso.date(), rateMinor: z.int() })),
});

const policySnapshotSchema = z.object({
  freeCancellationHours: z.int(),
  checkInTime: z.string(),
  checkOutTime: z.string(),
});

const MAX_REFERENCE_DRAWS = 5;

@Injectable()
export class ReservationsRepository {
  async findById(trx: Transaction, id: string): Promise<Reservation | undefined> {
    const row = await trx
      .selectFrom('reservations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? undefined : toReservation(row);
  }

  async findInProperty(
    trx: Transaction,
    propertyId: string,
    id: string,
  ): Promise<Reservation | undefined> {
    const row = await trx
      .selectFrom('reservations')
      .selectAll()
      .where('propertyId', '=', propertyId)
      .where('id', '=', id)
      .executeTakeFirst();
    return row === undefined ? undefined : toReservation(row);
  }

  /** Inserts a reservation on hold for HOLD_MINUTES, by the database clock, and its first event. */
  async insertHold(trx: Transaction, hold: NewHold): Promise<Reservation> {
    for (let draw = 1; draw <= MAX_REFERENCE_DRAWS; draw++) {
      const row = await trx
        .insertInto('reservations')
        .values({
          propertyId: hold.propertyId,
          unitTypeId: hold.unitTypeId,
          reference: newReference(),
          status: 'held',
          nights: toDateRange(hold.stay),
          guests: hold.guests,
          currency: hold.currency,
          totalMinor: hold.price.totalMinor,
          priceSnapshot: {
            nightlyRates: hold.price.nightlyRates.map((night) => ({
              date: night.date.toString(),
              rateMinor: night.rateMinor,
            })),
          },
          policySnapshot: { ...hold.policy },
          holdExpiresAt: sql<Date>`now() + make_interval(mins => ${HOLD_MINUTES})`,
        })
        // Two random references can clash, rarely: draw another one.
        .onConflict((conflict) => conflict.column('reference').doNothing())
        .returningAll()
        .executeTakeFirst();
      if (row !== undefined) {
        await recordEvents(trx, [row.id], { from: null, to: 'held', actor: 'guest' });
        return toReservation(row);
      }
    }
    throw new Error('Could not draw an unused reservation reference');
  }

  /** Confirms a hold that has not expired. False when it is gone, expired or no longer held. */
  async confirm(trx: Transaction, id: string, guest: Guest): Promise<boolean> {
    const moved = await move(
      trx,
      { from: 'held', to: 'confirmed', actor: 'guest' },
      (update) => update.where('id', '=', id).where('holdExpiresAt', '>', sql<Date>`now()`),
      { guestName: guest.name, guestEmail: guest.email },
    );
    return moved.length > 0;
  }

  /** Ends a hold the guest no longer wants. False when it is gone or no longer held. */
  async release(trx: Transaction, id: string): Promise<boolean> {
    const moved = await move(trx, { from: 'held', to: 'released', actor: 'guest' }, (update) =>
      update.where('id', '=', id),
    );
    return moved.length > 0;
  }

  /**
   * Moves the property's reservation one step on, with `changes`, if it is still in `move.from`.
   * False when it is not: it is gone, or another request moved it first.
   */
  async advance(
    trx: Transaction,
    propertyId: string,
    id: string,
    step: Move,
    changes: Updateable<Reservations> = {},
  ): Promise<boolean> {
    const moved = await move(
      trx,
      step,
      (update) => update.where('id', '=', id).where('propertyId', '=', propertyId),
      changes,
    );
    return moved.length > 0;
  }

  /**
   * Confirmed bookings whose guest never came: the night audit after their arrival day has passed
   * on the property's clock. The audit runs `auditHour` hours after midnight. Oldest first.
   */
  async findMissedArrivals(
    db: Database,
    at: Temporal.Instant,
    auditHour: number,
    limit: number,
  ): Promise<{ id: string; propertyId: string }[]> {
    // No time zone is more than 14 hours ahead of UTC, so no property's date is later than this.
    // It bounds the index scan to arrivals up to today, not every future booking.
    const latestDate = at.toZonedDateTimeISO('UTC').add({ hours: 14 }).toPlainDate();
    return db
      .selectFrom('reservations as r')
      .innerJoin('properties as p', 'p.id', 'r.propertyId')
      .select(['r.id', 'r.propertyId'])
      .where('r.status', '=', 'confirmed')
      .where(sql<boolean>`lower(r.nights) < ${latestDate.toString()}::date`)
      .where(
        sql<boolean>`lower(r.nights) < (
          (${new Date(at.epochMilliseconds)}::timestamptz AT TIME ZONE p.time_zone)
          - make_interval(hours => ${auditHour})
        )::date`,
      )
      .orderBy(sql`lower(r.nights)`)
      .orderBy('r.id')
      .limit(limit)
      .execute();
  }

  /**
   * Expires due holds and returns their ids. Rows another transaction has locked are skipped:
   * it is already confirming, releasing or expiring them.
   */
  async expireDueHolds(trx: Transaction, holds: DueHolds): Promise<string[]> {
    let due = trx
      .selectFrom('reservations')
      .select('id')
      .where('status', '=', 'held')
      .where('holdExpiresAt', '<=', sql<Date>`now()`);
    due =
      'limit' in holds
        ? due.orderBy('holdExpiresAt').limit(holds.limit)
        : due
            .where('unitTypeId', '=', holds.unitTypeId)
            .where(sql<boolean>`nights && ${toDateRange(holds.overlapping)}::daterange`);

    return move(trx, { from: 'held', to: 'expired', actor: 'system' }, (update) =>
      update.where('id', 'in', due.forUpdate().skipLocked()),
    );
  }
}

/**
 * Moves the reservations `pick` selects from `from` to `to` in one guarded update, and records
 * an event for each. A row that another transaction moved first fails the guard and is left out.
 */
async function move(
  trx: Transaction,
  step: Move,
  pick: (update: ReservationUpdate) => ReservationUpdate,
  changes: Updateable<Reservations> = {},
): Promise<string[]> {
  const { from, to } = step;
  if (!canTransition(from, to)) {
    throw new Error(`A reservation cannot go from ${from} to ${to}`);
  }
  const rows = await pick(
    trx
      .updateTable('reservations')
      .set({ ...changes, status: to })
      .where('status', '=', from),
  )
    .returning('id')
    .execute();
  const ids = rows.map((row) => row.id);
  await recordEvents(trx, ids, step);
  return ids;
}

async function recordEvents(
  trx: Transaction,
  reservationIds: readonly string[],
  {
    from,
    to,
    actor,
    userId,
    note,
  }: Omit<Move, 'from'> & { readonly from: ReservationStatus | null },
): Promise<void> {
  if (reservationIds.length === 0) {
    return;
  }
  await trx
    .insertInto('reservationEvents')
    .values(
      reservationIds.map((reservationId) => ({
        reservationId,
        fromStatus: from,
        toStatus: to,
        actor,
        userId: userId ?? null,
        note: note ?? null,
      })),
    )
    .execute();
}

export function toReservation(row: Selectable<Reservations>): Reservation {
  const { nightlyRates } = priceSnapshotSchema.parse(row.priceSnapshot);
  const policy: PolicySnapshot = policySnapshotSchema.parse(row.policySnapshot);
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    propertyId: row.propertyId,
    unitTypeId: row.unitTypeId,
    stay: fromDateRange(row.nights),
    guests: row.guests,
    currency: row.currency,
    nightlyRates: nightlyRates.map((night) => ({
      date: Temporal.PlainDate.from(night.date),
      rateMinor: night.rateMinor,
    })),
    totalMinor: row.totalMinor,
    policy,
    refundMinor: row.refundMinor,
    holdExpiresAt:
      row.holdExpiresAt === null
        ? null
        : Temporal.Instant.fromEpochMilliseconds(row.holdExpiresAt.getTime()),
    guest:
      row.guestName === null || row.guestEmail === null
        ? null
        : { name: row.guestName, email: row.guestEmail },
  };
}
