import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Metrics } from '../metrics/metrics.js';

/** Work the worker repeats, such as delivering the outbox or expiring holds. */
export interface ScheduledJob {
  /** For the logs. */
  readonly name: string;
  /** The pause between the end of one run and the start of the next. 0 turns the job off. */
  readonly intervalMs: number;
  /** Once `signal` aborts, the run should stop at the next safe point, leaving nothing half done. */
  run(signal: AbortSignal): Promise<unknown>;
}

/** The jobs the scheduler runs. */
export const SCHEDULED_JOBS = Symbol('SCHEDULED_JOBS');

/**
 * Runs each job at startup and then after every pause, never two runs of a job at once. On
 * shutdown it starts no new run, aborts the runs in progress, and waits for them to stop.
 */
@Injectable()
export class Scheduler implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly shutdown = new AbortController();
  private readonly timers = new Set<NodeJS.Timeout>();
  private readonly runs = new Set<Promise<void>>();

  constructor(
    @Inject(SCHEDULED_JOBS) private readonly jobs: readonly ScheduledJob[],
    private readonly metrics: Metrics,
    // Not @InjectPinoLogger(): it only works for classes imported before the LoggerModule is.
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(Scheduler.name);
  }

  onApplicationBootstrap(): void {
    for (const job of this.jobs) {
      if (job.intervalMs > 0) {
        this.schedule(job, 0);
      }
    }
  }

  /** Runs before the database pool closes, so the runs in progress can finish their writes. */
  async beforeApplicationShutdown(): Promise<void> {
    this.shutdown.abort();
    for (const timer of this.timers) {
      clearTimeout(timer);
    }
    await Promise.all(this.runs);
  }

  // A timeout per run rather than an interval, so a slow run never overlaps the next.
  private schedule(job: ScheduledJob, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      const run = this.runOnce(job).finally(() => {
        this.runs.delete(run);
        if (!this.shutdown.signal.aborted) {
          this.schedule(job, job.intervalMs);
        }
      });
      this.runs.add(run);
    }, delayMs);
    this.timers.add(timer);
  }

  private async runOnce(job: ScheduledJob): Promise<void> {
    const endTimer = this.metrics.jobDuration.startTimer({ name: job.name });
    try {
      await job.run(this.shutdown.signal);
    } catch (error) {
      endTimer({ outcome: 'failed' });
      this.logger.error({ err: error, job: job.name }, 'Scheduled job failed');
      return;
    }
    endTimer({ outcome: 'succeeded' });
    this.metrics.jobLastSuccess.set({ name: job.name }, Date.now() / 1000);
  }
}
