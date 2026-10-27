import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { type Kysely, sql } from 'kysely';
import {
  type Migration,
  type MigrationProvider,
  type MigrationResult,
  Migrator,
} from 'kysely/migration';

export const MIGRATIONS_DIR = path.join(import.meta.dirname, 'migrations');

/**
 * Migrations are plain, forward-only .sql files ordered by name (0001_..., 0002_...).
 * Keeping them in SQL means the DDL you review is exactly the DDL that runs.
 */
export class SqlFileMigrationProvider implements MigrationProvider {
  constructor(private readonly directory: string) {}

  async getMigrations(): Promise<Record<string, Migration>> {
    const files = (await readdir(this.directory)).filter((file) => file.endsWith('.sql')).sort();

    const migrations: Record<string, Migration> = {};
    for (const file of files) {
      const statements = await readFile(path.join(this.directory, file), 'utf8');
      migrations[path.basename(file, '.sql')] = {
        up: async (db) => {
          await sql.raw(statements).execute(db);
        },
      };
    }
    return migrations;
  }
}

export class MigrationFailedError extends Error {
  override readonly name = 'MigrationFailedError';
}

/**
 * Applies every pending migration. Kysely runs them in one transaction behind an advisory
 * lock, so two deploys migrating at once cannot interleave, and a failure leaves no partial schema.
 */
export async function migrateToLatest(
  db: Kysely<unknown>,
  directory: string = MIGRATIONS_DIR,
): Promise<readonly MigrationResult[]> {
  const migrator = new Migrator({ db, provider: new SqlFileMigrationProvider(directory) });
  const { error, results = [] } = await migrator.migrateToLatest();

  if (error !== undefined) {
    const failed = results.find((result) => result.status === 'Error');
    throw new MigrationFailedError(`Migration ${failed?.migrationName ?? '(unknown)'} failed`, {
      cause: error,
    });
  }
  return results;
}
