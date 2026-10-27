import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AppConfigModule } from './config/app-config.module.js';
import type { AppConfig } from './config/env.js';
import { DatabaseModule } from './platform/database/database.module.js';
import { ProblemDetailsFilter } from './platform/errors/problem-details.filter.js';
import { HealthController } from './platform/health/health.controller.js';
import { LoggingModule } from './platform/logging/logging.module.js';

@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [AppConfigModule.forRoot(config), LoggingModule, DatabaseModule],
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
    };
  }
}
