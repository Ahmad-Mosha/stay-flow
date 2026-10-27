import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, inject } from 'vitest';
import { createDatabase, type Database } from '../../src/platform/database/database.js';
import type { ReservationStatus } from '../../src/platform/database/database.generated.js';

const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function connectTestDatabase(): Database {
  return createDatabase(
    { url: inject('databaseUrl'), poolMax: 5, statementTimeoutMs: 5_000 },
    { applicationName: 'stay-flow-test', onPoolError: () => undefined },
  );
}

export function uniqueSlug(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

export function randomReference(): string {
  return Array.from({ length: 8 }, () => REFERENCE_ALPHABET[randomInt(32)]).join('');
}

/** A property with one room type and two rooms. */
export async function createInventory(db: Database) {
  const property = await db
    .insertInto('properties')
    .values({
      slug: uniqueSlug('property'),
      name: 'Test Guesthouse',
      timeZone: 'Africa/Cairo',
      currency: 'EGP',
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const unitType = await db
    .insertInto('unitTypes')
    .values({
      propertyId: property.id,
      slug: 'double',
      name: 'Double',
      maxGuests: 2,
      baseRateMinor: 240_000,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  const [first, second] = await db
    .insertInto('units')
    .values(
      ['101', '102'].map((name) => ({ propertyId: property.id, unitTypeId: unitType.id, name })),
    )
    .returning('id')
    .execute();
  if (first === undefined || second === undefined) {
    throw new Error('Expected two units');
  }

  return {
    propertyId: property.id,
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
}

export async function createReservation(db: Database, input: ReservationInput) {
  return db
    .insertInto('reservations')
    .values({
      propertyId: input.propertyId,
      unitTypeId: input.unitTypeId,
      reference: input.reference ?? randomReference(),
      status: input.status ?? 'confirmed',
      nights: input.nights,
      guests: 2,
      guestName: 'Test Guest',
      guestEmail: 'guest@example.com',
      currency: 'EGP',
      totalMinor: 720_000,
      priceSnapshot: { nightlyRates: [] },
      policySnapshot: { freeCancellationHours: 48 },
      holdExpiresAt: input.holdExpiresAt ?? null,
    })
    .returning('id')
    .executeTakeFirstOrThrow();
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
