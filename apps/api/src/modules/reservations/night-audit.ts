import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { DATABASE, type Database } from '../../platform/database/database.js';
import { AppError } from '../../platform/errors/app-error.js';
import { Clock } from '../../platform/time/clock.js';
import { ReservationsRepository } from './reservations.repository.js';
import { StayLifecycleService } from './stay-lifecycle.service.js';

/** Hours after midnight. Late arrivals have come by then, and the property's day is closed. */
const AUDIT_HOUR = 4;
const BATCH_SIZE = 200;

/**
 * Marks guests who never arrived as no-shows, as a hotel's night audit does: at 04:00 property
 * time, the morning after their arrival day. Their room goes back on sale. Each property closes
 * its day on its own clock, so the worker runs this every few minutes rather than once a day,
 * which also catches up on anything missed while the worker was down.
 */
@Injectable()
export class NightAudit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly clock: Clock,
    private readonly reservations: ReservationsRepository,
    private readonly lifecycle: StayLifecycleService,
    // Not @InjectPinoLogger(): it only works for classes imported before the LoggerModule is.
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(NightAudit.name);
  }

  /** Marks every missed arrival as a no-show. Returns how many it marked. */
  async run(signal?: AbortSignal): Promise<number> {
    let marked = 0;
    for (;;) {
      const missed = await this.reservations.findMissedArrivals(
        this.db,
        this.clock.now(),
        AUDIT_HOUR,
        BATCH_SIZE,
      );
      let markedInBatch = 0;
      for (const { id, propertyId } of missed) {
        if (signal?.aborted === true) {
          break;
        }
        if (await this.markNoShow(propertyId, id)) {
          markedInBatch++;
        }
      }
      marked += markedInBatch;
      // A batch that marked nothing would come back unchanged: stop rather than spin.
      if (missed.length < BATCH_SIZE || markedInBatch === 0 || signal?.aborted === true) {
        break;
      }
    }
    if (marked > 0) {
      this.logger.info({ marked }, 'Marked missed arrivals as no-shows');
    }
    return marked;
  }

  /** One booking's failure is logged and skipped, so it never holds up the others. */
  private async markNoShow(propertyId: string, id: string): Promise<boolean> {
    try {
      await this.lifecycle.markNoShow(propertyId, id, { actor: 'system' });
      return true;
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_TRANSITION') {
        // Staff checked the guest in or cancelled just now. Their step stands.
        this.logger.info({ reservationId: id }, 'Booking moved on before the night audit');
      } else {
        this.logger.error({ err: error, reservationId: id }, 'Could not mark a no-show');
      }
      return false;
    }
  }
}
