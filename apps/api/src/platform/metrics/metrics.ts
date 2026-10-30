import { Injectable } from '@nestjs/common';
import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

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

  readonly holdsPlaced = new Counter({
    name: 'stayflow_holds_placed_total',
    help: 'Holds placed: a room kept for a guest while they confirm. The top of the booking funnel.',
    registers: [this.registry],
  });

  /** Counted once the transaction that made the change commits. Hold expiry has its own counter. */
  readonly reservationStatusChanges = new Counter({
    name: 'stayflow_reservation_status_changes_total',
    help: 'Reservations moved to a new status, by that status and by who moved them: guest, host or system.',
    labelNames: ['status', 'actor'] as const,
    registers: [this.registry],
  });

  readonly bookingConflicts = new Counter({
    name: 'stayflow_booking_conflicts_total',
    help: 'Bookings that went for a room another booking took at the same moment. The database refused the overlap, and they moved on to the next room.',
    registers: [this.registry],
  });

  readonly holdsSoldOut = new Counter({
    name: 'stayflow_holds_sold_out_total',
    help: 'Holds refused because every room of the type was taken for the dates.',
    registers: [this.registry],
  });

  /** Counted once the transaction that expired them commits, as a rollback undoes the expiry. */
  readonly holdsExpired = new Counter({
    name: 'stayflow_holds_expired_total',
    help: 'Holds that ran out before the guest confirmed.',
    registers: [this.registry],
  });

  readonly outboxDeliveries = new Counter({
    name: 'stayflow_outbox_deliveries_total',
    help: 'Outbox delivery attempts, by event type and outcome: delivered, retried, or dead.',
    labelNames: ['type', 'outcome'] as const,
    registers: [this.registry],
  });

  // The job's label is `name`: Prometheus gives every scraped series a `job` label of its own.
  readonly jobDuration = new Histogram({
    name: 'stayflow_job_duration_seconds',
    help: 'Time each run of a worker job took, by job name and outcome.',
    labelNames: ['name', 'outcome'] as const,
    buckets: [0.01, 0.05, 0.25, 1, 5, 15, 60, 300],
    registers: [this.registry],
  });

  readonly jobLastSuccess = new Gauge({
    name: 'stayflow_job_last_success_timestamp_seconds',
    help: 'When each worker job last finished a run without failing. One that falls behind its interval is failing or stuck.',
    labelNames: ['name'] as const,
    registers: [this.registry],
  });

  constructor() {
    // CPU, memory, event loop delay and garbage collection of the process.
    collectDefaultMetrics({ register: this.registry });
  }
}
