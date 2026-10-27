import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { AppConfig, OutboxConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import {
  OUTBOX_HANDLERS,
  type OutboxEvent,
  type OutboxHandler,
  PermanentFailure,
} from './outbox-event.js';
import { OutboxRepository } from './outbox.repository.js';
import { MAX_ATTEMPTS, retryDelayMs } from './retry-policy.js';

/**
 * Delivers the outbox in the worker process: claims a batch of due events, hands them to their
 * handlers one at a time, and records each outcome. A failed delivery is retried later with
 * backoff; after MAX_ATTEMPTS, or a permanent failure, the event is dead.
 */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly config: OutboxConfig;
  private readonly handlers: ReadonlyMap<string, OutboxHandler>;
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly outbox: OutboxRepository,
    @Inject(OUTBOX_HANDLERS) handlers: readonly OutboxHandler[],
    // Not @InjectPinoLogger(): it only works for classes imported before the LoggerModule is.
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(OutboxWorker.name);
    this.config = config.outbox;
    this.handlers = new Map(handlers.map((handler) => [handler.type, handler]));
  }

  onApplicationBootstrap(): void {
    if (this.config.pollIntervalMs > 0) {
      this.loop(0);
    }
  }

  /** Stops claiming, lets the event in hand finish, and hands back the rest of its batch. */
  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  /** Delivers every due event, batch after batch. Returns how many it claimed. */
  async drain(): Promise<number> {
    let total = 0;
    for (;;) {
      const claimed = await this.runBatch();
      total += claimed;
      if (claimed < this.config.batchSize || this.stopped) {
        return total;
      }
    }
  }

  /** Claims one batch and delivers it. Returns how many events it claimed. */
  async runBatch(): Promise<number> {
    const events = await this.outbox.claim(this.config.batchSize, this.config.leaseMs);
    for (const [index, event] of events.entries()) {
      if (this.stopped) {
        await this.outbox.release(events.slice(index));
        break;
      }
      if (await this.outbox.renewLease(event, this.config.leaseMs)) {
        await this.deliver(event);
      } else {
        this.logger.warn(
          { eventId: event.id, type: event.type },
          'Lease on an outbox event ran out, and another worker has it now',
        );
      }
    }
    return events.length;
  }

  private async deliver(event: OutboxEvent): Promise<void> {
    try {
      const handler = this.handlers.get(event.type);
      if (handler === undefined) {
        throw new PermanentFailure(`No handler for ${event.type} events`);
      }
      await handler.handle(event);
    } catch (error) {
      await this.fail(event, error);
      return;
    }
    await this.outbox.complete(event);
  }

  private async fail(event: OutboxEvent, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : String(error);
    const context = { eventId: event.id, type: event.type, attempt: event.attempt, err: error };
    if (error instanceof PermanentFailure || event.attempt >= MAX_ATTEMPTS) {
      await this.outbox.bury(event, reason);
      this.logger.error(context, 'Gave up on an outbox event');
      return;
    }
    const delayMs = retryDelayMs(event.attempt);
    await this.outbox.retryLater(event, reason, delayMs);
    this.logger.warn({ ...context, retryInMs: delayMs }, 'Outbox delivery failed, will retry');
  }

  // A timeout per run rather than an interval, so batches never overlap. A full batch means more
  // may be waiting, so the next one starts at once.
  private loop(delayMs: number): void {
    this.timer = setTimeout(() => {
      this.running = this.runBatch()
        .then((claimed) => (claimed === this.config.batchSize ? 0 : this.config.pollIntervalMs))
        .catch((error: unknown) => {
          this.logger.error({ err: error }, 'Outbox batch failed');
          return this.config.pollIntervalMs;
        })
        .then((next) => {
          if (!this.stopped) {
            this.loop(next);
          }
        });
    }, delayMs);
  }
}
