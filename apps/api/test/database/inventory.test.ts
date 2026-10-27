import { afterAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/platform/database/database.js';
import { PgErrorCode } from '../../src/platform/database/pg-errors.js';
import {
  connectTestDatabase,
  createInventory,
  expectDatabaseError,
  uniqueSlug,
} from '../support/fixtures.js';

describe('inventory', () => {
  const db: Database = connectTestDatabase();

  afterAll(async () => {
    await db.destroy();
  });

  const property = (timeZone: string) =>
    db
      .insertInto('properties')
      .values({ slug: uniqueSlug('tz'), name: 'Guesthouse', timeZone, currency: 'EGP' })
      .returning(['id', 'createdAt', 'updatedAt'])
      .executeTakeFirstOrThrow();

  it('accepts IANA time zones and rejects unknown ones', async () => {
    await expect(property('Africa/Cairo')).resolves.toBeDefined();

    await expectDatabaseError(property('Mars/Olympus_Mons'), { code: PgErrorCode.CheckViolation });
  });

  it('refreshes updated_at on every update', async () => {
    const created = await property('Africa/Cairo');

    const updated = await db
      .updateTable('properties')
      .set({ name: 'Renamed Guesthouse' })
      .where('id', '=', created.id)
      .returning('updatedAt')
      .executeTakeFirstOrThrow();

    expect(updated.updatedAt.getTime()).toBeGreaterThan(created.createdAt.getTime());
  });

  it('keeps a room and its room type in the same property', async () => {
    const own = await createInventory(db);
    const other = await createInventory(db);

    await expectDatabaseError(
      db
        .insertInto('units')
        .values({ propertyId: own.propertyId, unitTypeId: other.unitTypeId, name: '999' })
        .execute(),
      { code: PgErrorCode.ForeignKeyViolation },
    );
  });

  it('rejects overlapping rate overrides for one room type', async () => {
    const { unitTypeId } = await createInventory(db);
    const override = (nights: string) =>
      db
        .insertInto('rateOverrides')
        .values({ unitTypeId, nights, rateMinor: 310_000, label: 'Holidays' })
        .execute();

    await override('[2026-12-18,2027-01-05)');

    await expectDatabaseError(override('[2027-01-01,2027-01-10)'), {
      code: PgErrorCode.ExclusionViolation,
      constraint: 'rate_overrides_no_overlap',
    });
    await expect(override('[2027-01-05,2027-01-10)')).resolves.toBeDefined();
  });
});
