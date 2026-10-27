import { Temporal } from 'temporal-polyfill';
import { loadConfig } from '../config/config.js';
import { createDatabase } from '../platform/database/database.js';
import { seedDemoProperty } from './seed-demo-property.js';

// `pnpm db:seed`: adds the demo property to a migrated database.
const config = loadConfig();
if (config.env === 'production') {
  throw new Error('Refusing to seed demo data into a production database.');
}

const db = createDatabase(config.database, {
  applicationName: 'stay-flow-seed',
  onPoolError: (error) => {
    console.error(error);
  },
});

try {
  const result = await seedDemoProperty(db, Temporal.Now.instant());
  console.info(
    result === 'seeded' ? 'Seeded the demo property.' : 'The demo property is already seeded.',
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
