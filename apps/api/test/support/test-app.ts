import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { Temporal } from 'temporal-polyfill';
import { inject } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { loadConfig } from '../../src/config/config.js';
import { Clock, FixedClock } from '../../src/platform/time/clock.js';
import { contractCheck } from './contract-check.js';

interface TestAppOptions {
  /** Overrides single environment variables. */
  readonly env?: Record<string, string>;
  /** Freezes the application clock at this instant. */
  readonly now?: Temporal.Instant;
}

/** Boots the real application, set up like main.ts. */
export async function createTestApp({
  env = {},
  now,
}: TestAppOptions = {}): Promise<NestExpressApplication> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: inject('databaseUrl'),
    // Lets a test act as several clients by sending X-Forwarded-For.
    TRUST_PROXY_HOPS: '1',
    ...env,
  });

  const builder = Test.createTestingModule({ imports: [AppModule.forRoot(config)] });
  if (now !== undefined) {
    builder.overrideProvider(Clock).useValue(new FixedClock(now));
  }
  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  // Every response a test gets is also held to the OpenAPI document; see contract-setup.ts.
  app.use(contractCheck);
  configureApp(app);
  await app.init();
  return app;
}
