import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sql } from 'kysely';
import { afterEach, beforeEach, describe, expect, inject, it } from 'vitest';
import { MigrationFailedError, migrateToLatest } from '../src/platform/database/migrator.js';
import { withMigrationConnection, withTemporaryDatabase } from './support/database.js';

describe('database migrations', () => {
  it('installed btree_gist, which the booking exclusion constraints depend on', async () => {
    const extensions = await withMigrationConnection(inject('databaseUrl'), async (db) => {
      const result = await sql<{ extname: string }>`
        select extname from pg_extension where extname = 'btree_gist'
      `.execute(db);
      return result.rows;
    });

    expect(extensions).toEqual([{ extname: 'btree_gist' }]);
  });

  it('is a no-op when the schema is already up to date', async () => {
    const results = await withMigrationConnection(inject('databaseUrl'), migrateToLatest);

    expect(results).toEqual([]);
  });
});

describe('a failing migration', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'stay-flow-migrations-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('rolls back the whole batch, leaving no partial schema behind', async () => {
    await writeFile(path.join(directory, '0001_create.sql'), 'create table guests (id int);');
    await writeFile(path.join(directory, '0002_broken.sql'), 'select * from no_such_table;');

    await withTemporaryDatabase(inject('databaseUrl'), async (db) => {
      const error: unknown = await migrateToLatest(db, directory).catch(
        (caught: unknown) => caught,
      );

      expect(error).toBeInstanceOf(MigrationFailedError);
      expect(error).toHaveProperty('message', 'Migration 0002_broken failed');

      const tables = await sql<{ tablename: string }>`
        select tablename from pg_tables where tablename = 'guests'
      `.execute(db);
      expect(tables.rows).toEqual([]);
    });
  });
});
