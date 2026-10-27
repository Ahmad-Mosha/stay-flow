import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { loadConfig } from '../../config/config.js';
import { migrateToLatest } from './migrator.js';

// `pnpm db:migrate`. Uses its own connection without the API's statement timeout.
const config = loadConfig();
const db = new Kysely<unknown>({
  dialect: new PostgresDialect({
    pool: new pg.Pool({
      connectionString: config.database.url,
      max: 1,
      application_name: 'stay-flow-migrate',
    }),
  }),
});

try {
  const results = await migrateToLatest(db);
  if (results.length === 0) {
    console.info('Database schema is already up to date.');
  }
  for (const result of results) {
    console.info(`Applied ${result.migrationName}`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
