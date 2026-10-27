import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config/config.js';
import { AppConfigModule } from './config/config.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { IdempotencyModule } from './platform/idempotency/idempotency.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { OutboxModule } from './platform/outbox/outbox.module.js';
import { OutboxWorker } from './platform/outbox/outbox-worker.js';
import { RateLimitModule } from './platform/rate-limit/rate-limit.module.js';
import { TimeModule } from './platform/time/time.module.js';

/** The worker process: delivers the outbox. It serves no HTTP and shares only the database. */
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
        // The domain modules the handlers use need these, as in the API.
        IdempotencyModule,
        RateLimitModule,
        OutboxModule,
        NotificationsModule,
      ],
      providers: [OutboxWorker],
    };
  }
}
