import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config/config.js';
import { APP_CONFIG, AppConfigModule } from './config/config.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { HoldSweeper } from './modules/reservations/hold-sweeper.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { IdempotencyModule } from './platform/idempotency/idempotency.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { OutboxModule } from './platform/outbox/outbox.module.js';
import { OutboxWorker } from './platform/outbox/outbox-worker.js';
import { RateLimitModule } from './platform/rate-limit/rate-limit.module.js';
import { SCHEDULED_JOBS, type ScheduledJob, Scheduler } from './platform/scheduling/scheduler.js';
import { TimeModule } from './platform/time/time.module.js';

/** Everything the worker does, and how often. */
function schedule(config: AppConfig, outbox: OutboxWorker, holds: HoldSweeper): ScheduledJob[] {
  return [
    {
      name: 'outbox',
      intervalMs: config.outbox.pollIntervalMs,
      run: (signal) => outbox.drain(signal),
    },
    {
      name: 'hold sweep',
      intervalMs: config.jobs.holdSweepIntervalMs,
      run: (signal) => holds.sweep(signal),
    },
  ];
}

/**
 * The worker process: delivers the outbox and runs the background jobs. It serves no HTTP and
 * shares only the database with the API.
 */
@Module({})
export class WorkerModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: WorkerModule,
      imports: [
        AppConfigModule.forRoot(config),
        LoggingModule,
        DatabaseModule,
        TimeModule,
        // The domain modules the jobs use need these, as in the API.
        IdempotencyModule,
        RateLimitModule,
        OutboxModule,
        ReservationsModule,
        NotificationsModule,
      ],
      providers: [
        OutboxWorker,
        {
          provide: SCHEDULED_JOBS,
          useFactory: schedule,
          inject: [APP_CONFIG, OutboxWorker, HoldSweeper],
        },
        Scheduler,
      ],
    };
  }
}
