import { CamelCasePlugin, Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DatabaseConfig } from '../../config/config.js';
import type { DB } from './database.generated.js';

export type Database = Kysely<DB>;

export const DATABASE = Symbol('DATABASE');

interface DatabaseOptions {
  /** Shown in pg_stat_activity to tell the API's connections from the worker's. */
  readonly applicationName: string;
  /** Idle pooled connections can fail; an unhandled pool error would crash the process. */
  readonly onPoolError: (error: Error) => void;
}

export function createDatabase(config: DatabaseConfig, options: DatabaseOptions): Database {
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.poolMax,
    application_name: options.applicationName,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // Applied to every session: UTC rendering, a cap on slow queries, no abandoned transactions.
    options: [
      '-c TimeZone=UTC',
      `-c statement_timeout=${config.statementTimeoutMs}`,
      `-c idle_in_transaction_session_timeout=${config.statementTimeoutMs * 2}`,
    ].join(' '),
  });
  pool.on('error', options.onPoolError);

  return new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    plugins: [new CamelCasePlugin({ maintainNestedObjectKeys: true })],
  });
}
