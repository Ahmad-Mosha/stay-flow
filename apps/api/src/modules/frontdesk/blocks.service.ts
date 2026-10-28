import { Inject, Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database } from '../../platform/database/database.js';
import { AppError } from '../../platform/errors/app-error.js';
import { Metrics } from '../../platform/metrics/metrics.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { type Block, InventoryService } from '../inventory/inventory.service.js';
import { PropertiesService } from '../properties/properties.service.js';
import { ReservationsService } from '../reservations/reservations.service.js';

export interface BlockRequest {
  readonly unitId: string;
  readonly nights: DateSpan;
  readonly reason: string;
}

/** Hosts taking rooms out of service: for repairs, a deep clean, or a friend's visit. */
@Injectable()
export class BlocksService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly properties: PropertiesService,
    private readonly inventory: InventoryService,
    private readonly reservations: ReservationsService,
    private readonly metrics: Metrics,
  ) {}

  /**
   * Blocks the room for the nights. Races with guests' holds like any booking: the database
   * lets exactly one of them take a night, and the other gets an error.
   */
  async block(propertyId: string, request: BlockRequest): Promise<Block> {
    const property = await this.properties.getById(propertyId);
    if (Temporal.PlainDate.compare(request.nights.start, this.properties.today(property)) < 0) {
      throw new AppError('BLOCK_IN_PAST', 'A block can start tonight at the earliest.');
    }

    let expired = 0;
    const block = await this.db.transaction().execute(async (trx) => {
      const unit = await this.inventory.getUnit(trx, propertyId, request.unitId);
      // A hold that ran out still keeps its room until it is released, as for a new hold.
      expired = await this.reservations.clearDueHolds(trx, unit.unitTypeId, request.nights);
      return this.inventory.block(trx, unit, { propertyId, ...request });
    });
    this.metrics.holdsExpired.inc(expired);
    return block;
  }

  /** Gives the nights back. Unblocking a block that was already released does nothing. */
  async unblock(propertyId: string, blockId: string): Promise<void> {
    await this.inventory.unblock(propertyId, blockId);
  }
}
