import type { Insertable } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { priceStay, type RateOverride } from '../modules/inventory/pricing.js';
import { refundFor } from '../modules/reservations/cancellation-policy.js';
import type { Actor } from '../modules/reservations/reservation.js';
import { releasesRoom } from '../modules/reservations/reservation-lifecycle.js';
import type { Database } from '../platform/database/database.js';
import type {
  Occupancies,
  ReservationEvents,
  Reservations,
  ReservationStatus,
} from '../platform/database/database.generated.js';
import { fromDateRange, toDateRange } from '../platform/database/date-range.js';
import { type DateSpan, dateSpan } from '../platform/time/date-span.js';
import { historyMarkers, planHistory, type TakenDays } from './demo-history.js';
import type { DemoBlock, DemoHotel, DemoSeason, DemoStay } from './demo-property.js';

interface SeededUnit {
  readonly id: string;
  readonly unitTypeId: string;
  readonly baseRateMinor: number;
  readonly overrides: readonly RateOverride[];
}

interface SeedContext {
  readonly hotel: DemoHotel;
  readonly propertyId: string;
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.Instant;
  readonly season: DateSpan;
  readonly units: ReadonlyMap<string, SeededUnit>;
}

interface TimelineEvent {
  readonly status: ReservationStatus;
  readonly actor: Actor;
  readonly at: Temporal.Instant;
}

/** One stay's rows, before the reservation has an id to link the others to. */
interface StayRows {
  readonly reservation: Insertable<Reservations>;
  readonly occupancy: Omit<Insertable<Occupancies>, 'reservationId'>;
  readonly events: Omit<Insertable<ReservationEvents>, 'reservationId'>[];
}

const HELD: [ReservationStatus, Actor] = ['held', 'guest'];
const CONFIRMED: [ReservationStatus, Actor] = ['confirmed', 'guest'];
const CHECKED_IN: [ReservationStatus, Actor] = ['checked_in', 'host'];

/** The statuses a reservation passed through to reach its current one, and who moved it. */
const lifecycle: Record<ReservationStatus, readonly [ReservationStatus, Actor][]> = {
  held: [HELD],
  confirmed: [HELD, CONFIRMED],
  checked_in: [HELD, CONFIRMED, CHECKED_IN],
  checked_out: [HELD, CONFIRMED, CHECKED_IN, ['checked_out', 'host']],
  cancelled: [HELD, CONFIRMED, ['cancelled', 'guest']],
  no_show: [HELD, CONFIRMED, ['no_show', 'system']],
  expired: [HELD, ['expired', 'system']],
  released: [HELD, ['released', 'guest']],
};

// Rows per insert: well under PostgreSQL's 65,535 parameters, and few round trips.
const BATCH_SIZE = 250;

export type SeedResult = 'seeded' | 'already-seeded';

/** Adds the hotel, its rooms and rates, and its written-out stays. Does nothing if it exists. */
export async function seedHotel(
  db: Database,
  hotel: DemoHotel,
  now: Temporal.Instant,
): Promise<SeedResult> {
  return db.transaction().execute(async (trx) => {
    const existing = await findPropertyId(trx, hotel);
    if (existing !== undefined) {
      return 'already-seeded';
    }

    const property = await trx
      .insertInto('properties')
      .values(hotel.property)
      .returning('id')
      .executeTakeFirstOrThrow();
    await insertInventory(trx, property.id, hotel, nextSeason(hotel.season, todayAt(hotel, now)));

    const context = await loadContext(trx, hotel, property.id, now);
    await insertStays(trx, context, hotel.stays);
    await insertBlocks(trx, context, hotel.blocks);
    return 'seeded';
  });
}

/**
 * Fills the hotel's rooms with made-up stays across its history window, around the nights already
 * taken. Runs once per hotel, even on a later day.
 */
export async function seedHistory(
  db: Database,
  hotel: DemoHotel,
  now: Temporal.Instant,
): Promise<SeedResult> {
  return db.transaction().execute(async (trx) => {
    const propertyId = await findPropertyId(trx, hotel);
    if (propertyId === undefined) {
      throw new Error(`Seed ${hotel.property.slug} before its history`);
    }
    const seeded = await trx
      .selectFrom('reservations')
      .select('id')
      .where('reference', 'in', historyMarkers(hotel))
      .executeTakeFirst();
    if (seeded !== undefined) {
      return 'already-seeded';
    }

    const context = await loadContext(trx, hotel, propertyId, now);
    const references = await trx.selectFrom('reservations').select('reference').execute();
    const plan = planHistory(
      hotel,
      await takenDays(trx, context),
      new Set(references.map((row) => row.reference)),
    );
    await insertStays(trx, context, plan.stays);
    await insertBlocks(trx, context, plan.blocks);
    return 'seeded';
  });
}

async function findPropertyId(db: Database, hotel: DemoHotel): Promise<string | undefined> {
  const row = await db
    .selectFrom('properties')
    .select('id')
    .where('slug', '=', hotel.property.slug)
    .executeTakeFirst();
  return row?.id;
}

async function insertInventory(
  db: Database,
  propertyId: string,
  hotel: DemoHotel,
  season: DateSpan,
): Promise<void> {
  for (const type of hotel.unitTypes) {
    const { id: unitTypeId } = await db
      .insertInto('unitTypes')
      .values({
        propertyId,
        slug: type.slug,
        name: type.name,
        description: type.description,
        maxGuests: type.maxGuests,
        baseRateMinor: type.baseRateMinor,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    await db
      .insertInto('rateOverrides')
      .values({
        unitTypeId,
        nights: toDateRange(season),
        rateMinor: type.seasonRateMinor,
        label: hotel.season.label,
      })
      .execute();

    await db
      .insertInto('units')
      .values(type.units.map((name) => ({ propertyId, unitTypeId, name })))
      .execute();
  }
}

/** The hotel's rooms with the rates they have in the database now, which price every stay. */
async function loadContext(
  db: Database,
  hotel: DemoHotel,
  propertyId: string,
  now: Temporal.Instant,
): Promise<SeedContext> {
  const rows = await db
    .selectFrom('units')
    .innerJoin('unitTypes', 'unitTypes.id', 'units.unitTypeId')
    .select(['units.id', 'units.name', 'units.unitTypeId', 'unitTypes.baseRateMinor'])
    .where('units.propertyId', '=', propertyId)
    .execute();
  const overrides = await db
    .selectFrom('rateOverrides')
    .innerJoin('unitTypes', 'unitTypes.id', 'rateOverrides.unitTypeId')
    .select(['rateOverrides.unitTypeId', 'rateOverrides.nights', 'rateOverrides.rateMinor'])
    .where('unitTypes.propertyId', '=', propertyId)
    .execute();

  const units = new Map<string, SeededUnit>();
  for (const row of rows) {
    units.set(row.name, {
      id: row.id,
      unitTypeId: row.unitTypeId,
      baseRateMinor: row.baseRateMinor,
      overrides: overrides
        .filter((override) => override.unitTypeId === row.unitTypeId)
        .map((override) => ({
          nights: fromDateRange(override.nights),
          rateMinor: override.rateMinor,
        })),
    });
  }

  const today = todayAt(hotel, now);
  return { hotel, propertyId, today, now, season: nextSeason(hotel.season, today), units };
}

/** The nights each room is already held for, by a stay or a block, in days from today. */
async function takenDays(db: Database, context: SeedContext): Promise<TakenDays> {
  const rows = await db
    .selectFrom('occupancies')
    .innerJoin('units', 'units.id', 'occupancies.unitId')
    .select(['units.name', 'occupancies.nights'])
    .where('occupancies.propertyId', '=', context.propertyId)
    .where('occupancies.releasedAt', 'is', null)
    .execute();

  const taken = new Map<string, (readonly [number, number])[]>();
  for (const row of rows) {
    const nights = fromDateRange(row.nights);
    const days = [
      daysFrom(context.today, nights.start),
      daysFrom(context.today, nights.end),
    ] as const;
    taken.set(row.name, [...(taken.get(row.name) ?? []), days]);
  }
  return taken;
}

async function insertStays(
  db: Database,
  context: SeedContext,
  stays: readonly DemoStay[],
): Promise<void> {
  const rows = stays.map((stay, index) => stayRows(context, stay, index));

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const inserted = await db
      .insertInto('reservations')
      .values(batch.map((row) => row.reservation))
      .returning(['id', 'reference'])
      .execute();
    const idOf = new Map(inserted.map((row) => [row.reference, row.id]));
    const reservationId = (row: StayRows) => {
      const id = idOf.get(row.reservation.reference);
      if (id === undefined) throw new Error(`Reservation ${row.reservation.reference} not saved`);
      return id;
    };

    await db
      .insertInto('occupancies')
      .values(batch.map((row) => ({ ...row.occupancy, reservationId: reservationId(row) })))
      .execute();
    await db
      .insertInto('reservationEvents')
      .values(
        batch.flatMap((row) =>
          row.events.map((event) => ({ ...event, reservationId: reservationId(row) })),
        ),
      )
      .execute();
  }
}

async function insertBlocks(
  db: Database,
  context: SeedContext,
  blocks: readonly DemoBlock[],
): Promise<void> {
  if (blocks.length === 0) {
    return;
  }
  await db
    .insertInto('occupancies')
    .values(
      blocks.map((block) => {
        const firstNight = context.today.add({ days: block.from });
        return {
          propertyId: context.propertyId,
          unitId: unitNamed(context, block.unit).id,
          nights: toDateRange(dateSpan(firstNight, firstNight.add({ days: block.nights }))),
          blockReason: block.reason,
        };
      }),
    )
    .execute();
}

function stayRows(context: SeedContext, stay: DemoStay, index: number): StayRows {
  const { property } = context.hotel;
  const unit = unitNamed(context, stay.unit);
  const anchor = stay.anchor === 'season' ? context.season.start : context.today;
  const firstNight = anchor.add({ days: stay.from });
  const nights = dateSpan(firstNight, firstNight.add({ days: stay.nights }));
  const price = priceStay(nights, unit.baseRateMinor, unit.overrides);

  const policy = {
    freeCancellationHours: property.freeCancellationHours,
    checkInTime: property.checkInTime,
    checkOutTime: property.checkOutTime,
  };
  const timeline = timelineOf(context, stay, nights, index);
  const booked = timeline[0];
  const latest = timeline.at(-1);
  if (booked === undefined || latest === undefined) {
    throw new Error(`No lifecycle for status ${stay.status}`);
  }

  return {
    reservation: {
      propertyId: context.propertyId,
      unitTypeId: unit.unitTypeId,
      reference: stay.reference,
      status: stay.status,
      nights: toDateRange(nights),
      guests: stay.guests,
      guestName: stay.guestName,
      guestEmail: demoEmail(stay.guestName),
      currency: property.currency,
      totalMinor: price.totalMinor,
      priceSnapshot: {
        nightlyRates: price.nightlyRates.map((night) => ({
          date: night.date.toString(),
          rateMinor: night.rateMinor,
        })),
      },
      policySnapshot: policy,
      // What the policy refunded at the moment the guest cancelled.
      refundMinor:
        stay.status === 'cancelled'
          ? refundFor(
              {
                stay: nights,
                nightlyRates: price.nightlyRates,
                totalMinor: price.totalMinor,
                policy,
              },
              property.timeZone,
              latest.at,
            ).refundMinor
          : null,
      holdExpiresAt: toDate(booked.at.add({ minutes: 10 })),
      createdAt: toDate(booked.at),
      updatedAt: toDate(latest.at),
    },
    occupancy: {
      propertyId: context.propertyId,
      unitId: unit.id,
      nights: toDateRange(nights),
      releasedAt: releasesRoom(stay.status) ? toDate(latest.at) : null,
      createdAt: toDate(booked.at),
    },
    events: timeline.map((event, position) => ({
      fromStatus: timeline[position - 1]?.status ?? null,
      toStatus: event.status,
      actor: event.actor,
      occurredAt: toDate(event.at),
    })),
  };
}

/** Plausible times for each step: booked ahead of arrival, checked in after it, and so on. */
function timelineOf(
  context: SeedContext,
  stay: DemoStay,
  nights: DateSpan,
  index: number,
): TimelineEvent[] {
  const { now } = context;
  const { timeZone, checkInTime, checkOutTime } = context.hotel.property;
  const checkIn = nights.start.toZonedDateTime({ timeZone, plainTime: checkInTime }).toInstant();
  const checkOut = nights.end.toZonedDateTime({ timeZone, plainTime: checkOutTime }).toInstant();
  const bookedAt = (
    stay.bookedDaysAhead === undefined
      ? earliest(checkIn.subtract({ hours: 12 * 24 }), now.subtract({ hours: 48 }))
      : earliest(checkIn.subtract({ hours: 24 * stay.bookedDaysAhead }), now.subtract({ hours: 3 }))
  )
    // Spread the bookings out so they don't share a timestamp.
    .subtract({ minutes: 41 * (index % 100) });
  // A day after booking, or halfway to arrival if that comes sooner: never after now.
  const halfwayToArrival = earliest(checkIn, now).since(bookedAt).total('milliseconds') / 2;
  const cancelledAt = earliest(
    bookedAt.add({ hours: 26 }),
    bookedAt.add({ milliseconds: Math.round(halfwayToArrival) }),
  );

  const at: Record<ReservationStatus, Temporal.Instant> = {
    held: bookedAt,
    released: bookedAt.add({ minutes: 3 }),
    confirmed: bookedAt.add({ minutes: 4 }),
    expired: bookedAt.add({ minutes: 10 }),
    cancelled: cancelledAt,
    checked_in: checkIn.add({ minutes: 35 }),
    checked_out: checkOut.subtract({ minutes: 20 }),
    no_show: nights.start
      .add({ days: 1 })
      .toZonedDateTime({ timeZone, plainTime: '00:05' })
      .toInstant(),
  };
  return lifecycle[stay.status].map(([step, actor]) => ({ status: step, actor, at: at[step] }));
}

/** The season's next nights that start at least a week from today. */
function nextSeason(season: DemoSeason, today: Temporal.PlainDate): DateSpan {
  let start = Temporal.PlainDate.from({ year: today.year, month: season.month, day: season.day });
  if (Temporal.PlainDate.compare(start, today.add({ days: 7 })) < 0) {
    start = start.add({ years: 1 });
  }
  return dateSpan(start, start.add({ days: season.nights }));
}

function todayAt(hotel: DemoHotel, now: Temporal.Instant): Temporal.PlainDate {
  return now.toZonedDateTimeISO(hotel.property.timeZone).toPlainDate();
}

function daysFrom(today: Temporal.PlainDate, date: Temporal.PlainDate): number {
  return today.until(date, { largestUnit: 'days' }).days;
}

function unitNamed(context: SeedContext, name: string): SeededUnit {
  const unit = context.units.get(name);
  if (unit === undefined) {
    throw new Error(`Demo data refers to unknown unit ${name}`);
  }
  return unit;
}

/** A made-up address from the guest's name: "Chloé Dubois" books as chloe.dubois@example.com. */
function demoEmail(guestName: string): string {
  const ascii = guestName.normalize('NFD').replaceAll(/\p{M}/gu, '');
  return `${ascii.toLowerCase().replaceAll(/[^a-z]+/g, '.')}@example.com`;
}

function earliest(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(a, b) <= 0 ? a : b;
}

function toDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}
