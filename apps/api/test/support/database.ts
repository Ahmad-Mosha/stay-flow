import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

/** Runs `work` with a plain single-connection Kysely (no plugins), then closes it. */
export async function withMigrationConnection<T>(
  databaseUrl: string,
  work: (db: Kysely<unknown>) => Promise<T>,
): Promise<T> {
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString: databaseUrl, max: 1 }),
    }),
  });
  try {
    return await work(db);
  } finally {
    await db.destroy();
  }
}

/**
 * Creates an empty database next to the shared test database, runs `work` against it, and
 * drops it afterwards. For tests that need a schema history of their own.
 */
export async function withTemporaryDatabase<T>(
  databaseUrl: string,
  work: (db: Kysely<unknown>) => Promise<T>,
): Promise<T> {
  const name = `scratch_${randomUUID().replaceAll('-', '')}`;
  await withMigrationConnection(databaseUrl, async (admin) => {
    await sql`create database ${sql.id(name)}`.execute(admin);
  });

  const scratchUrl = new URL(databaseUrl);
  scratchUrl.pathname = `/${name}`;
  try {
    return await withMigrationConnection(scratchUrl.toString(), work);
  } finally {
    await withMigrationConnection(databaseUrl, async (admin) => {
      await sql`drop database ${sql.id(name)} with (force)`.execute(admin);
    });
  }
}
