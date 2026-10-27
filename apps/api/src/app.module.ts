import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config/config.js';
import { AppConfigModule } from './config/config.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PropertiesModule } from './modules/properties/properties.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ErrorsModule } from './platform/errors/errors.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { TimeModule } from './platform/time/time.module.js';

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
        TimeModule,
        HealthModule,
        PropertiesModule,
        InventoryModule,
      ],
    };
  }
}
