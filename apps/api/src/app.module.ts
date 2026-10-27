import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config/config.js';
import { AppConfigModule } from './config/config.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ErrorsModule } from './platform/errors/errors.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        LoggingModule,
        DatabaseModule,
        ErrorsModule,
        HealthModule,
      ],
    };
  }
}
