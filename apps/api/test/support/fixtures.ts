import { randomUUID } from 'node:crypto';
import type { Insertable } from 'kysely';
import pg from 'pg';
import { expect, inject } from 'vitest';
import { newReference } from '../../src/modules/reservations/reservation-reference.js';
import { createDatabase, type Database } from '../../src/platform/database/database.js';
import { fromDateRange } from '../../src/platform/database/date-range.js';
import { nightsOf } from '../../src/platform/time/date-span.js';
import type {
  Properties,
  ReservationStatus,
} from '../../src/platform/database/database.generated.js';

export function connectTestDatabase(): Database {
  return createDatabase(
    { url: inject('databaseUrl'), poolMax: 5, statementTimeoutMs: 5_000 },
    { applicationName: 'stay-flow-test', onPoolError: () => undefined },
  );
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

/** A property with one room type, "double", and two rooms, 101 and 102. */
export async function createInventory(
  db: Database,
  property: Partial<Insertable<Properties>> = {},
) {
  const { id: propertyId, slug } = await db
    .insertInto('properties')
    .values({
      slug: uniqueSlug('property'),
      name: 'Test Guesthouse',
      timeZone: 'Africa/Cairo',
      currency: 'EGP',
      ...property,
    })
    .returning(['id', 'slug'])
    .executeTakeFirstOrThrow();

  const unitType = await db
    .insertInto('unitTypes')
    .values({
      propertyId,
      slug: 'double',
      name: 'Double',
      maxGuests: 2,
      baseRateMinor: 240_000,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const [first, second] = await db
    .insertInto('units')
    .values(['101', '102'].map((name) => ({ propertyId, unitTypeId: unitType.id, name })))
    .returning('id')
    .execute();
  if (first === undefined || second === undefined) {
    throw new Error('Expected two units');
  }

  return {
    propertyId,
    slug,
    unitTypeId: unitType.id,
    unitIds: [first.id, second.id] as const,
  };
}

interface ReservationInput {
  readonly propertyId: string;
  readonly unitTypeId: string;
  readonly nights: string;
  readonly status?: ReservationStatus;
  readonly holdExpiresAt?: Date | null;
  readonly reference?: string;
  readonly guestName?: string;
  readonly guestEmail?: string;
  /** Booked at this price every night. Without it, the price snapshot lists no nights. */
  readonly nightlyRateMinor?: number;
  /** Such as `2026-10-20 09:00:00.123456+00`; now by default. */
  readonly createdAt?: string;
}

export async function createReservation(db: Database, input: ReservationInput) {
  const rate = input.nightlyRateMinor;
  const nightlyRates =
    rate === undefined
      ? []
      : nightsOf(fromDateRange(input.nights)).map((night) => ({
          date: night.toString(),
          rateMinor: rate,
        }));
  return db
    .insertInto('reservations')
    .values({
      propertyId: input.propertyId,
      unitTypeId: input.unitTypeId,
      reference: input.reference ?? newReference(),
      status: input.status ?? 'confirmed',
      nights: input.nights,
      guests: 2,
      guestName: input.guestName ?? 'Test Guest',
      guestEmail: input.guestEmail ?? 'guest@example.com',
      currency: 'EGP',
      totalMinor: rate === undefined ? 720_000 : rate * nightlyRates.length,
      priceSnapshot: { nightlyRates },
      policySnapshot: { freeCancellationHours: 48 },
      holdExpiresAt: input.holdExpiresAt ?? null,
      ...(input.createdAt === undefined ? {} : { createdAt: input.createdAt }),
    })
    .returning(['id', 'reference'])
    .executeTakeFirstOrThrow();
}

/** A reservation that takes a room for its nights, as a booking leaves it. */
export async function createStay(db: Database, input: ReservationInput & { unitId: string }) {
  const reservation = await createReservation(db, input);
  await occupy(db, {
    propertyId: input.propertyId,
    unitId: input.unitId,
    nights: input.nights,
    reservationId: reservation.id,
  });
  return reservation;
}

interface OccupancyInput {
  readonly propertyId: string;
  readonly unitId: string;
  readonly nights: string;
  readonly reservationId?: string | null;
  readonly blockReason?: string | null;
}

export async function occupy(db: Database, input: OccupancyInput) {
  return db
    .insertInto('occupancies')
    .values({
      propertyId: input.propertyId,
      unitId: input.unitId,
      nights: input.nights,
      reservationId: input.reservationId ?? null,
      blockReason: input.blockReason ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
}

/** Asserts that `operation` fails with the given SQLSTATE and, optionally, constraint name. */
export async function expectDatabaseError(
  operation: Promise<unknown>,
  expected: { readonly code: string; readonly constraint?: string },
): Promise<void> {
  const error: unknown = await operation.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(pg.DatabaseError);
  expect(error).toMatchObject(expected);
}
