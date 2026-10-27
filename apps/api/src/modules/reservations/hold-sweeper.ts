import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ReservationsService } from './reservations.service.js';

const BATCH_SIZE = 500;

/**
 * Expires lapsed holds, so their rooms come back even if nobody tries to book them. The worker
 * runs it on a timer. Bookings never wait for it: they release a lapsed hold in their way.
 */
@Injectable()
export class HoldSweeper {
  constructor(
    private readonly reservations: ReservationsService,
    // Not @InjectPinoLogger(): it only works for classes imported before the LoggerModule is.
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(HoldSweeper.name);
  }

  /** Expires every due hold, one batch per transaction. Returns how many expired. */
  async sweep(signal?: AbortSignal): Promise<number> {
    let total = 0;
    for (;;) {
      const expired = await this.reservations.expireDueHolds(BATCH_SIZE);
      total += expired;
      if (expired < BATCH_SIZE || signal?.aborted === true) {
        break;
      }
    }
    if (total > 0) {
      this.logger.info({ expired: total }, 'Expired holds');
    }
    return total;
  }
}
