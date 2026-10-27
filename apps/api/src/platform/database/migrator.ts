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

export class MigrationFailedError extends Error {
  override readonly name = 'MigrationFailedError';
}

/** Forward-only .sql migrations, applied in file name order. */
class SqlFileMigrationProvider implements MigrationProvider {
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

/** Runs pending migrations in one transaction under an advisory lock: all or nothing. */
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
