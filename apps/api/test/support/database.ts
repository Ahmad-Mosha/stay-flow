import { randomUUID } from 'node:crypto';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

/** Runs `work` on a single plain connection (no plugins), then closes it. */
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

/** Runs `work` against a fresh empty database, dropped afterwards. */
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
