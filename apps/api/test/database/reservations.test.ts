import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/platform/database/database.js';
import { PgErrorCode } from '../../src/platform/database/pg-errors.js';
import {
  connectTestDatabase,
  createInventory,
  createReservation,
  expectDatabaseError,
} from '../support/fixtures.js';

describe('reservations', () => {
  const db: Database = connectTestDatabase();
  let inventory: Awaited<ReturnType<typeof createInventory>>;

  beforeAll(async () => {
    inventory = await createInventory(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  const stay = (overrides: Partial<Parameters<typeof createReservation>[1]> = {}) =>
    createReservation(db, { ...inventory, nights: '[2026-12-01,2026-12-04)', ...overrides });

  it('requires a hold expiry while the reservation is held', async () => {
    await expectDatabaseError(stay({ status: 'held', holdExpiresAt: null }), {
      code: PgErrorCode.CheckViolation,
      constraint: 'reservations_hold_expiry',
    });

    await expect(stay({ status: 'held', holdExpiresAt: new Date() })).resolves.toBeDefined();
  });

  it('only accepts references in the unambiguous alphabet', async () => {
    await expectDatabaseError(stay({ reference: 'ABCD1IL0' }), {
      code: PgErrorCode.CheckViolation,
    });
  });

  it('rejects a duplicate reference', async () => {
    const reference = 'X7K9M2PQ';
    await stay({ reference });

    await expectDatabaseError(stay({ reference }), { code: PgErrorCode.UniqueViolation });
  });

  it('cannot book a room type of another property', async () => {
    const other = await createInventory(db);

    await expectDatabaseError(stay({ unitTypeId: other.unitTypeId }), {
      code: PgErrorCode.ForeignKeyViolation,
    });
  });
});

describe('reservation events', () => {
  const db: Database = connectTestDatabase();

  afterAll(async () => {
    await db.destroy();
  });

  it('are append-only', async () => {
    const inventory = await createInventory(db);
    const reservation = await createReservation(db, {
      ...inventory,
      nights: '[2026-12-01,2026-12-04)',
    });
    const event = await db
      .insertInto('reservationEvents')
      .values({ reservationId: reservation.id, toStatus: 'confirmed', actor: 'guest' })
      .returning('id')
      .executeTakeFirstOrThrow();

    await expectDatabaseError(
      db
        .updateTable('reservationEvents')
        .set({ note: 'edited' })
        .where('id', '=', event.id)
        .execute(),
      { code: PgErrorCode.RestrictViolation },
    );
    await expectDatabaseError(
      db.deleteFrom('reservationEvents').where('id', '=', event.id).execute(),
      { code: PgErrorCode.RestrictViolation },
    );
  });
});
