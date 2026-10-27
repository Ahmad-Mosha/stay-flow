import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './config.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

/** Provides an already-parsed config, so tests pass values instead of mutating process.env. */
@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
