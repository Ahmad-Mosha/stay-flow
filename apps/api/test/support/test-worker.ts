import type { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import type { Temporal } from 'temporal-polyfill';
import { inject } from 'vitest';
import { loadConfig } from '../../src/config/config.js';
import { OutboxWorker } from '../../src/platform/outbox/outbox-worker.js';
import { Clock, FixedClock } from '../../src/platform/time/clock.js';
import { WorkerModule } from '../../src/worker.module.js';

interface TestWorkerOptions {
  readonly smtpUrl: string;
  /** Overrides single environment variables. */
  readonly env?: Record<string, string>;
  /** Freezes the application clock at this instant. */
  readonly now?: Temporal.Instant;
}

export interface TestWorker {
  readonly app: INestApplicationContext;
  readonly outbox: OutboxWorker;
}

/** Boots the worker in this process with its loop off: tests call `outbox.drain()` themselves. */
export async function createTestWorker({
  smtpUrl,
  env = {},
  now,
}: TestWorkerOptions): Promise<TestWorker> {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: inject('databaseUrl'),
    SMTP_URL: smtpUrl,
    WEB_URL: 'https://stayflow.test',
    OUTBOX_POLL_INTERVAL_MS: '0',
    HOLD_SWEEP_INTERVAL_MS: '0',
    ...env,
  });

  const builder = Test.createTestingModule({ imports: [WorkerModule.forRoot(config)] });
  if (now !== undefined) {
    builder.overrideProvider(Clock).useValue(new FixedClock(now));
  }
  const app = await builder.compile();
  app.useLogger(app.get(Logger));
  await app.init();
  return { app, outbox: app.get(OutboxWorker) };
}
