import { Temporal } from 'temporal-polyfill';
import { loadConfig } from '../config/config.js';
import { createDatabase } from '../platform/database/database.js';
import { demoHotels } from './demo-hotels.js';
import { darNubia, demoHost, demoTeam } from './demo-property.js';
import { seedDemoHost } from './seed-demo-host.js';
import { seedHistory, seedHotel } from './seed-hotel.js';

// `pnpm db:seed`: adds the demo hotels and their host to a migrated database. Runs again safely.
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
  const now = Temporal.Now.instant();
  // Dar Nubia first: the host opens the hotel they joined first.
  for (const hotel of [darNubia, ...demoHotels]) {
    const { name, slug } = hotel.property;
    const property = await seedHotel(db, hotel, now);
    await seedDemoHost(db, slug);
    const history = await seedHistory(db, hotel, now);
    console.info(
      `${name}: ${property === 'seeded' ? 'added' : 'already there'}, ` +
        `${history === 'seeded' ? 'stays added' : 'stays already there'} (/stay/${slug})`,
    );
  }
  console.info(`Sign in to the host dashboard as ${demoHost.email} / ${demoHost.password}`);
  console.info(`Or try another role: ${demoTeam.map(({ email }) => email).join(', ')}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await db.destroy();
}
