import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG } from '../../config/app-config.module.js';
import type { AppConfig } from '../../config/env.js';
import { createDatabase, DATABASE, type Database } from './database.js';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Database => {
        const logger = new Logger('Database');
        return createDatabase(config.database, {
          applicationName: 'stay-flow-api',
          onPoolError: (error) => {
            logger.error({ err: error }, 'Idle database connection failed');
          },
        });
      },
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async onApplicationShutdown(): Promise<void> {
    // Closes every pooled connection so the process can exit cleanly on SIGTERM.
    await this.db.destroy();
  }
}
