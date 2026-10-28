import { type DynamicModule, Module } from '@nestjs/common';
import { Metrics } from './metrics.js';
import { METRICS_PORT, MetricsServer } from './metrics-server.js';

@Module({})
export class MetricsModule {
  /** Serves the metrics on `port`. Without one, they are kept in the process, as tests need. */
  static forRoot(port: number | undefined): DynamicModule {
    return {
      module: MetricsModule,
      global: true,
      providers: [Metrics, { provide: METRICS_PORT, useValue: port }, MetricsServer],
      exports: [Metrics],
    };
  }
}
