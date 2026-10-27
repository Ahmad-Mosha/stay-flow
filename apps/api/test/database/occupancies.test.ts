import { sql } from 'kysely';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Database } from '../../src/platform/database/database.js';
import { PgErrorCode } from '../../src/platform/database/pg-errors.js';
import {
  connectTestDatabase,
  createInventory,
  createReservation,
  expectDatabaseError,
  occupy,
} from '../support/fixtures.js';

describe('occupancies', () => {
  const db: Database = connectTestDatabase();
  let inventory: Awaited<ReturnType<typeof createInventory>>;
  let room: string;

  beforeEach(async () => {
    inventory = await createInventory(db);
    room = inventory.unitIds[0];
  });

  afterAll(async () => {
    await db.destroy();
  });

  const block = (unitId: string, nights: string) =>
    occupy(db, { propertyId: inventory.propertyId, unitId, nights, blockReason: 'Maintenance' });

  it('rejects two active stays in one room that share a night', async () => {
    await block(room, '[2026-12-01,2026-12-04)');

    await expectDatabaseError(block(room, '[2026-12-03,2026-12-05)'), {
      code: PgErrorCode.ExclusionViolation,
      constraint: 'occupancies_no_overlap',
    });
  });

  it('allows a check-in on the day of the previous check-out', async () => {
    await block(room, '[2026-12-01,2026-12-04)');

    await expect(block(room, '[2026-12-04,2026-12-06)')).resolves.toBeDefined();
  });

  it('allows the same nights in a different room', async () => {
    await block(room, '[2026-12-01,2026-12-04)');

    await expect(block(inventory.unitIds[1], '[2026-12-01,2026-12-04)')).resolves.toBeDefined();
  });

  it('frees the nights once an occupancy is released', async () => {
    const first = await block(room, '[2026-12-01,2026-12-04)');
    await db
      .updateTable('occupancies')
      .set({ releasedAt: sql<Date>`now()` })
      .where('id', '=', first.id)
      .execute();

    await expect(block(room, '[2026-12-02,2026-12-03)')).resolves.toBeDefined();
  });

  it('rejects empty and unbounded night ranges', async () => {
    await expectDatabaseError(block(room, '[2026-12-04,2026-12-04)'), {
      code: PgErrorCode.CheckViolation,
    });
    await expectDatabaseError(block(room, '[2026-12-04,)'), { code: PgErrorCode.CheckViolation });
  });

  it('must belong to exactly one of a reservation or a block', async () => {
    const reservation = await createReservation(db, {
      ...inventory,
      nights: '[2026-12-01,2026-12-04)',
    });

    await expectDatabaseError(
      occupy(db, {
        propertyId: inventory.propertyId,
        unitId: room,
        nights: '[2026-12-01,2026-12-04)',
      }),
      { code: PgErrorCode.CheckViolation, constraint: 'occupancies_reservation_or_block' },
    );
    await expectDatabaseError(
      occupy(db, {
        propertyId: inventory.propertyId,
        unitId: room,
        nights: '[2026-12-01,2026-12-04)',
        reservationId: reservation.id,
        blockReason: 'Maintenance',
      }),
      { code: PgErrorCode.CheckViolation, constraint: 'occupancies_reservation_or_block' },
    );
  });

  it('gives a reservation at most one active room', async () => {
    const reservation = await createReservation(db, {
      ...inventory,
      nights: '[2026-12-01,2026-12-04)',
    });
    const stay = { propertyId: inventory.propertyId, nights: '[2026-12-01,2026-12-04)' };
    await occupy(db, { ...stay, unitId: room, reservationId: reservation.id });

    await expectDatabaseError(
      occupy(db, { ...stay, unitId: inventory.unitIds[1], reservationId: reservation.id }),
      { code: PgErrorCode.UniqueViolation, constraint: 'occupancies_one_active_per_reservation' },
    );
  });

  it('cannot put a reservation in a room of another property', async () => {
    const other = await createInventory(db);
    const reservation = await createReservation(db, {
      ...other,
      nights: '[2026-12-01,2026-12-04)',
    });

    await expectDatabaseError(
      occupy(db, {
        propertyId: inventory.propertyId,
        unitId: room,
        nights: '[2026-12-01,2026-12-04)',
        reservationId: reservation.id,
      }),
      { code: PgErrorCode.ForeignKeyViolation },
    );
  });
});
