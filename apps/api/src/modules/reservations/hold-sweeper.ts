import {
  type BeforeApplicationShutdown,
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { AppConfig } from '../../config/config.js';
import { APP_CONFIG } from '../../config/config.module.js';
import { ReservationsService } from './reservations.service.js';

const BATCH_SIZE = 500;

/** Expires holds in the background, so their rooms come back even if nobody tries to book them. */
@Injectable()
export class HoldSweeper implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> = Promise.resolve();
  private stopped = false;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reservations: ReservationsService,
    @InjectPinoLogger(HoldSweeper.name) private readonly logger: PinoLogger,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.holds.sweepIntervalMs > 0) {
      this.scheduleNext();
    }
  }

  /** Runs before the database pool closes, so a sweep in progress can finish. */
  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  /** Expires every due hold, one batch per transaction. Returns how many expired. */
  async sweep(): Promise<number> {
    let total = 0;
    for (;;) {
      const expired = await this.reservations.expireDueHolds(BATCH_SIZE);
      total += expired;
      if (expired < BATCH_SIZE) {
        return total;
      }
    }
  }

  // A timeout per run rather than an interval, so a slow sweep never overlaps the next.
  private scheduleNext(): void {
    this.timer = setTimeout(() => {
      this.running = this.sweep()
        .then((expired) => {
          if (expired > 0) {
            this.logger.info({ expired }, 'Expired holds');
          }
        })
        .catch((error: unknown) => {
          this.logger.error({ err: error }, 'Hold sweep failed');
        })
        .finally(() => {
          if (!this.stopped) {
            this.scheduleNext();
          }
        });
    }, this.config.holds.sweepIntervalMs);
  }
}
