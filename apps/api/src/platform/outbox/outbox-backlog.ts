import { Injectable } from '@nestjs/common';
import { Gauge } from 'prom-client';
import { Metrics } from '../metrics/metrics.js';
import { OutboxRepository } from './outbox.repository.js';

/**
 * Reports how far behind the outbox is, read from the table at each scrape. The lag grows when
 * the worker falls behind or the mail server keeps turning emails away. The worker reports it;
 * while the worker is down, Prometheus sees its target down instead.
 */
@Injectable()
export class OutboxBacklog {
  readonly events: Gauge<'state'>;
  readonly lag: Gauge;

  constructor(metrics: Metrics, outbox: OutboxRepository) {
    this.events = new Gauge({
      name: 'stayflow_outbox_events',
      help: 'Outbox events not delivered yet: pending, including those waiting to retry, or dead.',
      labelNames: ['state'] as const,
      registers: [metrics.registry],
      async collect() {
        const { pending, dead } = await outbox.backlog();
        this.set({ state: 'pending' }, pending);
        this.set({ state: 'dead' }, dead);
      },
    });
    this.lag = new Gauge({
      name: 'stayflow_outbox_lag_seconds',
      help: 'How long the oldest pending outbox event has waited.',
      registers: [metrics.registry],
      async collect() {
        this.set((await outbox.backlog()).lagSeconds);
      },
    });
  }
}
