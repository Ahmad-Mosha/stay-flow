import { Injectable } from '@nestjs/common';
import type { Temporal } from 'temporal-polyfill';
import type { Transaction } from '../../platform/database/database.js';
import { isPgError, PgErrorCode } from '../../platform/database/pg-errors.js';
import { inSavepoint } from '../../platform/database/savepoint.js';
import { AppError } from '../../platform/errors/app-error.js';
import { Metrics } from '../../platform/metrics/metrics.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { bestFitOrder } from './allocation.js';
import {
  type Block,
  InventoryRepository,
  type NewBlock,
  type Unit,
  type UnitType,
} from './inventory.repository.js';
import { priceStay, type StayPrice } from './pricing.js';

export type { Block, Unit, UnitType };

export interface UnitRequest {
  readonly propertyId: string;
  readonly unitTypeId: string;
  readonly stay: DateSpan;
  readonly reservationId: string;
}

/** The inventory module's public API for booking. Every method runs in the caller's transaction. */
@Injectable()
export class InventoryService {
  constructor(
    private readonly inventory: InventoryRepository,
    private readonly metrics: Metrics,
  ) {}

  async getUnitType(trx: Transaction, propertyId: string, slug: string): Promise<UnitType> {
    const unitType = await this.inventory.findUnitType(trx, propertyId, slug);
    if (unitType === undefined) {
      throw new AppError('NOT_FOUND', 'This property has no room type with this slug.');
    }
    return unitType;
  }

  async getUnitTypeById(trx: Transaction, id: string): Promise<UnitType> {
    const unitType = await this.inventory.findUnitTypeById(trx, id);
    if (unitType === undefined) {
      throw new Error(`Room type ${id} does not exist`);
    }
    return unitType;
  }

  async quote(
    trx: Transaction,
    propertyId: string,
    unitType: UnitType,
    stay: DateSpan,
  ): Promise<StayPrice> {
    const overrides = await this.inventory.rateOverrides(propertyId, stay, trx);
    return priceStay(stay, unitType.baseRateMinor, overrides.get(unitType.id) ?? []);
  }

  /**
   * Gives the reservation the best-fitting room of its type that is free for the stay. Two
   * bookings can pick the same room at once; the database lets one in, and the other moves on
   * to its next choice. Throws SOLD_OUT when no room is left.
   */
  async allocateUnit(trx: Transaction, request: UnitRequest): Promise<string> {
    const candidates = await this.inventory.freeUnitsAround(trx, request.unitTypeId, request.stay);

    for (const unit of bestFitOrder(request.stay, candidates)) {
      try {
        await inSavepoint(trx, () =>
          this.inventory.occupy(trx, {
            propertyId: request.propertyId,
            unitId: unit.id,
            stay: request.stay,
            reservationId: request.reservationId,
          }),
        );
        return unit.id;
      } catch (error) {
        if (!isPgError(error, PgErrorCode.ExclusionViolation, 'occupancies_no_overlap')) {
          throw error;
        }
        this.metrics.bookingConflicts.inc();
      }
    }
    this.metrics.holdsSoldOut.inc();
    throw new AppError('SOLD_OUT', 'Every room of this type is taken for these dates.');
  }

  async releaseUnits(trx: Transaction, reservationIds: readonly string[]): Promise<void> {
    await this.inventory.releaseOccupancies(trx, reservationIds);
  }

  /** After a check-out, gives back the nights from `today` on, so an early departure frees tonight. */
  async endStay(trx: Transaction, reservationId: string, today: Temporal.PlainDate): Promise<void> {
    await this.inventory.endOccupancy(trx, reservationId, today);
  }

  async getUnit(trx: Transaction, propertyId: string, id: string): Promise<Unit> {
    const unit = await this.inventory.findUnit(trx, propertyId, id);
    if (unit === undefined) {
      throw new AppError('NOT_FOUND', 'This property has no room with this id.');
    }
    return unit;
  }

  /** Takes the room out of service for the nights. Throws UNIT_TAKEN if any of them is taken. */
  async block(trx: Transaction, unit: Unit, block: NewBlock): Promise<Block> {
    try {
      return await this.inventory.insertBlock(trx, block);
    } catch (error) {
      if (isPgError(error, PgErrorCode.ExclusionViolation, 'occupancies_no_overlap')) {
        throw new AppError('UNIT_TAKEN', `Room ${unit.name} is not free on all of these nights.`);
      }
      throw error;
    }
  }

  async unblock(propertyId: string, id: string): Promise<void> {
    if (!(await this.inventory.releaseBlock(propertyId, id))) {
      throw new AppError('NOT_FOUND', 'This property has no block with this id.');
    }
  }
}
