import { type DynamicModule, Module } from '@nestjs/common';
import type { AppConfig } from './env.js';

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Makes the already-validated config injectable everywhere. Config is parsed by the
 * caller (main.ts or a test), so tests pass explicit values instead of mutating process.env.
 */
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
