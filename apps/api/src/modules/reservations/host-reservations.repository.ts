import { Inject, Injectable } from '@nestjs/common';
import { type Selectable, sql } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { z } from 'zod';
import { DATABASE, type Database } from '../../platform/database/database.js';
import type { Reservations } from '../../platform/database/database.generated.js';
import { toDateRange } from '../../platform/database/date-range.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import type { Actor, Reservation, ReservationStatus } from './reservation.js';
import { toReservation } from './reservations.repository.js';

export interface StoredReservation extends Reservation {
  readonly createdAt: Temporal.Instant;
}

export interface ReservationFilter {
  /** Without it, every status but those of holds that never became bookings. */
  readonly statuses?: readonly ReservationStatus[] | undefined;
  /** Stays with a night on or after this date. */
  readonly from?: Temporal.PlainDate | undefined;
  /** Stays with a night before this date. */
  readonly to?: Temporal.PlainDate | undefined;
  /** A reference, or part of the guest's name or email. */
  readonly search?: string | undefined;
}

/**
 * Where a page of the list ends. `createdAt` is ISO text to the microsecond, as PostgreSQL keeps
 * it. A JS Date keeps only milliseconds, and a position rounded down would skip rows.
 */
export interface ListPosition {
  readonly createdAt: string;
  readonly id: string;
}

export interface ReservationPage {
  readonly reservations: StoredReservation[];
  /** Where the next page starts, or null on the last page. */
  readonly next: ListPosition | null;
}

/** One step in a reservation's history. */
export interface ReservationEvent {
  readonly fromStatus: ReservationStatus | null;
  readonly toStatus: ReservationStatus;
  readonly actor: Actor;
  readonly userId: string | null;
  readonly note: string | null;
  readonly occurredAt: Temporal.Instant;
}

export interface BookedNights {
  readonly nightsSold: number;
  readonly revenueMinor: number;
}

const NEVER_BOOKED = ['expired', 'released'] as const;

const actorSchema = z.enum(['guest', 'host', 'system']);

/** Every query here is scoped to one property. */
@Injectable()
export class HostReservationsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * A page of the property's reservations, newest first, after `after`. Keyset pagination: the
   * page starts where the last one ended, so rows added meanwhile neither repeat nor shift it.
   */
  async list(
    propertyId: string,
    filter: ReservationFilter,
    limit: number,
    after?: ListPosition,
  ): Promise<ReservationPage> {
    let query = this.reservationsOf(propertyId).select(
      sql<string>`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
        'position',
      ),
    );
    query =
      filter.statuses === undefined
        ? query.where('status', 'not in', NEVER_BOOKED)
        : query.where('status', 'in', filter.statuses);
    if (filter.from !== undefined) {
      query = query.where(sql<boolean>`upper(nights) > ${filter.from.toString()}::date`);
    }
    if (filter.to !== undefined) {
      query = query.where(sql<boolean>`lower(nights) < ${filter.to.toString()}::date`);
    }
    const { search } = filter;
    if (search !== undefined) {
      const pattern = `%${escapeLike(search)}%`;
      query = query.where((eb) =>
        eb.or([
          eb('reference', '=', search.toUpperCase()),
          eb('guestName', 'ilike', pattern),
          eb('guestEmail', 'ilike', pattern),
        ]),
      );
    }
    if (after !== undefined) {
      query = query.where(
        sql<boolean>`(created_at, id) < (${after.createdAt}::timestamptz, ${after.id}::uuid)`,
      );
    }

    // One row more than the page says whether another page follows.
    const rows = await query
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .limit(limit + 1)
      .execute();
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      reservations: page.map(toStoredReservation),
      next:
        rows.length > limit && last !== undefined
          ? { createdAt: last.position, id: last.id }
          : null,
    };
  }

  async findByIds(propertyId: string, ids: readonly string[]): Promise<StoredReservation[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.reservationsOf(propertyId).where('id', 'in', ids).execute();
    return rows.map(toStoredReservation);
  }

  /** Stays that start on `date`: due in, already in, or marked as not coming. */
  async arrivingOn(propertyId: string, date: Temporal.PlainDate): Promise<StoredReservation[]> {
    const rows = await this.reservationsOf(propertyId)
      .where(sql<boolean>`lower(nights) = ${date.toString()}::date`)
      .where('status', 'in', ['confirmed', 'checked_in', 'no_show'])
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return rows.map(toStoredReservation);
  }

  /** Stays that end on `date`: due out, or already gone. */
  async departingOn(propertyId: string, date: Temporal.PlainDate): Promise<StoredReservation[]> {
    const rows = await this.reservationsOf(propertyId)
      .where(sql<boolean>`upper(nights) = ${date.toString()}::date`)
      .where('status', 'in', ['checked_in', 'checked_out'])
      .orderBy('createdAt')
      .orderBy('id')
      .execute();
    return rows.map(toStoredReservation);
  }

  /** Guests checked in now, those leaving soonest first. */
  async inHouse(propertyId: string): Promise<StoredReservation[]> {
    const rows = await this.reservationsOf(propertyId)
      .where('status', '=', 'checked_in')
      .orderBy(sql`upper(nights)`)
      .orderBy('id')
      .execute();
    return rows.map(toStoredReservation);
  }

  /** The reservation's history, oldest first. */
  async listEvents(reservationId: string): Promise<ReservationEvent[]> {
    const rows = await this.db
      .selectFrom('reservationEvents')
      .select(['fromStatus', 'toStatus', 'actor', 'userId', 'note', 'occurredAt'])
      .where('reservationId', '=', reservationId)
      .orderBy('occurredAt')
      .orderBy('id')
      .execute();
    return rows.map((row) => ({
      ...row,
      actor: actorSchema.parse(row.actor),
      occurredAt: Temporal.Instant.fromEpochMilliseconds(row.occurredAt.getTime()),
    }));
  }

  /** The nights of `span` that booked stays take, and their prices when they were booked. */
  async bookedNights(propertyId: string, span: DateSpan): Promise<BookedNights> {
    const range = toDateRange(span);
    const { rows } = await sql<BookedNights>`
      SELECT count(*) AS nights_sold,
             coalesce(sum((night ->> 'rateMinor')::bigint), 0)::bigint AS revenue_minor
      FROM reservations r
      CROSS JOIN LATERAL jsonb_array_elements(r.price_snapshot -> 'nightlyRates') AS night
      WHERE r.property_id = ${propertyId}
        AND r.status IN ('confirmed', 'checked_in', 'checked_out')
        AND r.nights && ${range}::daterange
        AND (night ->> 'date')::date <@ ${range}::daterange
    `.execute(this.db);
    return rows[0] ?? { nightsSold: 0, revenueMinor: 0 };
  }

  private reservationsOf(propertyId: string) {
    return this.db.selectFrom('reservations').selectAll().where('propertyId', '=', propertyId);
  }
}

function toStoredReservation(row: Selectable<Reservations>): StoredReservation {
  return {
    ...toReservation(row),
    createdAt: Temporal.Instant.fromEpochMilliseconds(row.createdAt.getTime()),
  };
}

/** Makes `%`, `_` and `\` in a search match themselves in a LIKE pattern. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
