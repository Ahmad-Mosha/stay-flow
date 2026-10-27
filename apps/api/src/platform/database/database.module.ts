import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
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
    await this.db.destroy();
  }
}
