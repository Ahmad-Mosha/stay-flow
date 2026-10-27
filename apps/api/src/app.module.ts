import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config/config.js';
import { AppConfigModule } from './config/config.module.js';
import { AccessModule } from './modules/access/access.module.js';
import { FrontdeskModule } from './modules/frontdesk/frontdesk.module.js';
import { GuestAccessModule } from './modules/guest-access/guest-access.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { PropertiesModule } from './modules/properties/properties.module.js';
import { ReservationsModule } from './modules/reservations/reservations.module.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ErrorsModule } from './platform/errors/errors.module.js';
import { HealthModule } from './platform/health/health.module.js';
import { IdempotencyModule } from './platform/idempotency/idempotency.module.js';
import { LoggingModule } from './platform/logging/logging.module.js';
import { RateLimitModule } from './platform/rate-limit/rate-limit.module.js';
import { SecurityModule } from './platform/security/security.module.js';
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
        IdempotencyModule,
        RateLimitModule,
        SecurityModule,
        HealthModule,
        IdentityModule,
        AccessModule,
        GuestAccessModule,
        PropertiesModule,
        InventoryModule,
        ReservationsModule,
        FrontdeskModule,
      ],
    };
  }
}
