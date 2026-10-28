import { Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';

/**
 * Every metric the API and the worker export, in one place. Each application has a registry of
 * its own, so tests can boot several in one process.
 */
@Injectable()
export class Metrics {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Time to serve an HTTP request. Labelled by route pattern, not URL, to keep series few.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  constructor() {
    // CPU, memory, event loop delay and garbage collection of the process.
    collectDefaultMetrics({ register: this.registry });
  }
}
