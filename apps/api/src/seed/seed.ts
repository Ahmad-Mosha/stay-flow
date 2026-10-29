import { Temporal } from 'temporal-polyfill';
import { loadConfig } from '../config/config.js';
import { createDatabase } from '../platform/database/database.js';
import { demoHost, demoTeam } from './demo-property.js';
import { seedDemoHost } from './seed-demo-host.js';
import { seedDemoProperty } from './seed-demo-property.js';

// `pnpm db:seed`: adds the demo property and its host to a migrated database.
const config = loadConfig();
// A public demo runs in production and asks for the demo data on purpose; nothing else gets it.
if (config.env === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
  throw new Error(
    'Refusing to seed demo data into a production database. A public demo sets SEED_DEMO_DATA=true.',
  );
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
  await seedDemoHost(db);
  console.info(`Sign in to the host dashboard as ${demoHost.email} / ${demoHost.password}`);
  console.info(`Or try another role: ${demoTeam.map(({ email }) => email).join(', ')}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
