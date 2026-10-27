import { Temporal } from 'temporal-polyfill';
import { priceStay } from '../modules/inventory/pricing.js';
import type { Database } from '../platform/database/database.js';
import type { ReservationStatus } from '../platform/database/database.generated.js';
import { toDateRange } from '../platform/database/date-range.js';
import { type DateSpan, dateSpan } from '../platform/time/date-span.js';
import {
  type DemoStay,
  type DemoUnitType,
  demoBlocks,
  demoProperty,
  demoStays,
  demoUnitTypes,
  holidaySeason,
} from './demo-property.js';

type Actor = 'guest' | 'host' | 'system';

interface SeededUnit {
  readonly id: string;
  readonly unitTypeId: string;
  readonly type: DemoUnitType;
}

interface SeedContext {
  readonly propertyId: string;
  readonly today: Temporal.PlainDate;
  readonly now: Temporal.Instant;
  readonly holidays: DateSpan;
  readonly units: ReadonlyMap<string, SeededUnit>;
}

interface TimelineEvent {
  readonly status: ReservationStatus;
  readonly actor: Actor;
  readonly at: Temporal.Instant;
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

/** Statuses that give the room back. */
const releasesRoom = new Set<ReservationStatus>(['expired', 'released', 'cancelled', 'no_show']);

export type SeedResult = 'seeded' | 'already-seeded';

/** Adds the demo guesthouse, with stays placed around `now`. Does nothing if it already exists. */
export async function seedDemoProperty(db: Database, now: Temporal.Instant): Promise<SeedResult> {
  return db.transaction().execute(async (trx) => {
    const existing = await trx
      .selectFrom('properties')
      .select('id')
      .where('slug', '=', demoProperty.slug)
      .executeTakeFirst();
    if (existing !== undefined) {
      return 'already-seeded';
    }

    const property = await trx
      .insertInto('properties')
      .values(demoProperty)
      .returning('id')
      .executeTakeFirstOrThrow();

    const today = now.toZonedDateTimeISO(demoProperty.timeZone).toPlainDate();
    const holidays = nextHolidaySeason(today);
    const units = await insertInventory(trx, property.id, holidays);
    const context: SeedContext = { propertyId: property.id, today, now, holidays, units };

    for (const [index, stay] of demoStays.entries()) {
      await insertStay(trx, context, stay, index);
    }
    for (const block of demoBlocks) {
      const firstNight = today.add({ days: block.from });
      await trx
        .insertInto('occupancies')
        .values({
          propertyId: property.id,
          unitId: unitNamed(units, block.unit).id,
          nights: toDateRange(dateSpan(firstNight, firstNight.add({ days: block.nights }))),
          blockReason: block.reason,
        })
        .execute();
    }
    return 'seeded';
  });
}

async function insertInventory(
  db: Database,
  propertyId: string,
  holidays: DateSpan,
): Promise<Map<string, SeededUnit>> {
  const units = new Map<string, SeededUnit>();

  for (const type of demoUnitTypes) {
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
        nights: toDateRange(holidays),
        rateMinor: type.holidayRateMinor,
        label: holidaySeason.label,
      })
      .execute();

    const rows = await db
      .insertInto('units')
      .values(type.units.map((name) => ({ propertyId, unitTypeId, name })))
      .returning(['id', 'name'])
      .execute();
    for (const row of rows) {
      units.set(row.name, { id: row.id, unitTypeId, type });
    }
  }
  return units;
}

async function insertStay(
  db: Database,
  context: SeedContext,
  stay: DemoStay,
  index: number,
): Promise<void> {
  const unit = unitNamed(context.units, stay.unit);
  const anchor = stay.anchor === 'holidays' ? context.holidays.start : context.today;
  const firstNight = anchor.add({ days: stay.from });
  const nights = dateSpan(firstNight, firstNight.add({ days: stay.nights }));
  const price = priceStay(nights, unit.type.baseRateMinor, [
    { nights: context.holidays, rateMinor: unit.type.holidayRateMinor },
  ]);

  const timeline = timelineOf(stay.status, nights, context.now, index);
  const booked = timeline[0];
  const latest = timeline.at(-1);
  if (booked === undefined || latest === undefined) {
    throw new Error(`No lifecycle for status ${stay.status}`);
  }

  const reservation = await db
    .insertInto('reservations')
    .values({
      propertyId: context.propertyId,
      unitTypeId: unit.unitTypeId,
      reference: stay.reference,
      status: stay.status,
      nights: toDateRange(nights),
      guests: stay.guests,
      guestName: stay.guestName,
      guestEmail: demoEmail(stay.guestName),
      currency: demoProperty.currency,
      totalMinor: price.totalMinor,
      priceSnapshot: {
        nightlyRates: price.nightlyRates.map((night) => ({
          date: night.date.toString(),
          rateMinor: night.rateMinor,
        })),
      },
      policySnapshot: {
        freeCancellationHours: demoProperty.freeCancellationHours,
        checkInTime: demoProperty.checkInTime,
        checkOutTime: demoProperty.checkOutTime,
      },
      holdExpiresAt: toDate(booked.at.add({ minutes: 10 })),
      createdAt: toDate(booked.at),
      updatedAt: toDate(latest.at),
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  await db
    .insertInto('occupancies')
    .values({
      propertyId: context.propertyId,
      unitId: unit.id,
      nights: toDateRange(nights),
      reservationId: reservation.id,
      releasedAt: releasesRoom.has(stay.status) ? toDate(latest.at) : null,
      createdAt: toDate(booked.at),
    })
    .execute();

  await db
    .insertInto('reservationEvents')
    .values(
      timeline.map((event, position) => ({
        reservationId: reservation.id,
        fromStatus: timeline[position - 1]?.status ?? null,
        toStatus: event.status,
        actor: event.actor,
        occurredAt: toDate(event.at),
      })),
    )
    .execute();
}

/** Plausible times for each step: booked about 12 days ahead, checked in after arrival, and so on. */
function timelineOf(
  status: ReservationStatus,
  nights: DateSpan,
  now: Temporal.Instant,
  index: number,
): TimelineEvent[] {
  const { timeZone, checkInTime, checkOutTime } = demoProperty;
  const checkIn = nights.start.toZonedDateTime({ timeZone, plainTime: checkInTime }).toInstant();
  const checkOut = nights.end.toZonedDateTime({ timeZone, plainTime: checkOutTime }).toInstant();
  const bookedAt = earliest(checkIn.subtract({ hours: 12 * 24 }), now.subtract({ hours: 48 }))
    // Spread the bookings out so they don't share a timestamp.
    .subtract({ minutes: 41 * index });

  const at: Record<ReservationStatus, Temporal.Instant> = {
    held: bookedAt,
    released: bookedAt.add({ minutes: 3 }),
    confirmed: bookedAt.add({ minutes: 4 }),
    expired: bookedAt.add({ minutes: 10 }),
    cancelled: bookedAt.add({ hours: 26 }),
    checked_in: checkIn.add({ minutes: 35 }),
    checked_out: checkOut.subtract({ minutes: 20 }),
    no_show: nights.start
      .add({ days: 1 })
      .toZonedDateTime({ timeZone, plainTime: '00:05' })
      .toInstant(),
  };
  return lifecycle[status].map(([step, actor]) => ({ status: step, actor, at: at[step] }));
}

/** The next winter holidays that start at least a week from today. */
function nextHolidaySeason(today: Temporal.PlainDate): DateSpan {
  let start = Temporal.PlainDate.from({
    year: today.year,
    month: holidaySeason.month,
    day: holidaySeason.day,
  });
  if (Temporal.PlainDate.compare(start, today.add({ days: 7 })) < 0) {
    start = start.add({ years: 1 });
  }
  return dateSpan(start, start.add({ days: holidaySeason.nights }));
}

function unitNamed(units: ReadonlyMap<string, SeededUnit>, name: string): SeededUnit {
  const unit = units.get(name);
  if (unit === undefined) {
    throw new Error(`Demo data refers to unknown unit ${name}`);
  }
  return unit;
}

function demoEmail(guestName: string): string {
  return `${guestName.toLowerCase().replaceAll(/[^a-z]+/g, '.')}@example.com`;
}

function earliest(a: Temporal.Instant, b: Temporal.Instant): Temporal.Instant {
  return Temporal.Instant.compare(a, b) <= 0 ? a : b;
}

function toDate(instant: Temporal.Instant): Date {
  return new Date(instant.epochMilliseconds);
}
