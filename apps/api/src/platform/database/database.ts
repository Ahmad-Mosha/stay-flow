import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DatabaseConfig } from '../../config/env.js';
import type { DB } from './database.generated.js';

export type Database = Kysely<DB>;

export const DATABASE = Symbol('DATABASE');

interface CreateDatabaseOptions {
  /** Shows up in pg_stat_activity, so you can tell the API's connections from the worker's. */
  readonly applicationName: string;
  /** An idle pooled connection can fail (database restart, network blip); unhandled, that crashes Node. */
  readonly onPoolError: (error: Error) => void;
}

export function createDatabase(config: DatabaseConfig, options: CreateDatabaseOptions): Database {
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.poolMax,
    application_name: options.applicationName,
    // Fail fast instead of queueing requests forever when the database is unreachable.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Session settings for every connection: timestamps rendered in UTC, a ceiling on runaway
    // queries, and no transaction left open (holding locks) by a crashed request.
    options: [
      '-c TimeZone=UTC',
      `-c statement_timeout=${config.statementTimeoutMs}`,
      `-c idle_in_transaction_session_timeout=${config.statementTimeoutMs * 2}`,
    ].join(' '),
  });
  pool.on('error', options.onPoolError);

  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    // snake_case in SQL, camelCase in TypeScript. Nested keys (jsonb documents) are left as stored.
    plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
  });
}
