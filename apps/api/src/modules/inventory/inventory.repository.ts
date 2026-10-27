import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database, type Transaction } from '../../platform/database/database.js';
import { fromDateRange, toDateRange } from '../../platform/database/date-range.js';
import { type DateSpan, nightCount } from '../../platform/time/date-span.js';
import type { RateOverride } from './pricing.js';

export interface UnitType {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly maxGuests: number;
  readonly baseRateMinor: number;
}

export interface UnitTypeWithFreeUnits extends UnitType {
  readonly freeUnits: number;
}

export interface FreeUnitsOnNight {
  readonly night: Temporal.PlainDate;
  readonly unitTypeId: string;
  readonly baseRateMinor: number;
  readonly freeUnits: number;
}

/** A room free for a stay, and the free run of nights around it. */
export interface FreeUnit {
  readonly id: string;
  readonly name: string;
  /** Where the free run starts: the check-out of the stay or block before, or null if none. */
  readonly freeFrom: Temporal.PlainDate | null;
  /** Where the free run ends: the check-in of the stay or block after, or null if none. */
  readonly freeUntil: Temporal.PlainDate | null;
}

export interface NewOccupancy {
  readonly propertyId: string;
  readonly unitId: string;
  readonly stay: DateSpan;
  readonly reservationId: string;
}

/** Rate overrides grouped by room type id. */
export type OverridesByUnitType = ReadonlyMap<string, readonly RateOverride[]>;

const UNIT_TYPE_COLUMNS = [
  'id',
  'slug',
  'name',
  'description',
  'maxGuests',
  'baseRateMinor',
] as const;

@Injectable()
export class InventoryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findUnitType(
    trx: Transaction,
    propertyId: string,
    slug: string,
  ): Promise<UnitType | undefined> {
    return trx
      .selectFrom('unitTypes')
      .select(UNIT_TYPE_COLUMNS)
      .where('propertyId', '=', propertyId)
      .where('slug', '=', slug)
      .executeTakeFirst();
  }

  async findUnitTypeById(trx: Transaction, id: string): Promise<UnitType | undefined> {
    return trx
      .selectFrom('unitTypes')
      .select(UNIT_TYPE_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Room types that fit `guests`, each with the number of its rooms free for the whole stay. */
  async unitTypesFreeFor(
    propertyId: string,
    stay: DateSpan,
    guests: number,
  ): Promise<UnitTypeWithFreeUnits[]> {
    return this.db
      .selectFrom('unitTypes as ut')
      .innerJoin('units as u', 'u.unitTypeId', 'ut.id')
      .select(['ut.id', 'ut.slug', 'ut.name', 'ut.description', 'ut.maxGuests', 'ut.baseRateMinor'])
      .select((eb) =>
        eb.fn
          .count<number>('u.id')
          .filterWhere((filter) =>
            filter.not(
              filter.exists(
                filter
                  .selectFrom('blockingOccupancies as o')
                  .select('o.id')
                  .whereRef('o.unitId', '=', 'u.id')
                  .where(sql<boolean>`o.nights && ${toDateRange(stay)}::daterange`),
              ),
            ),
          )
          .as('freeUnits'),
      )
      .where('ut.propertyId', '=', propertyId)
      .where('ut.maxGuests', '>=', guests)
      .groupBy('ut.id')
      .execute();
  }

  /** For each night of `span` and each room type that fits `guests`, how many rooms are free. */
  async freeUnitsByNight(
    propertyId: string,
    span: DateSpan,
    guests: number,
  ): Promise<FreeUnitsOnNight[]> {
    const { rows } = await sql<{
      night: string;
      unitTypeId: string;
      baseRateMinor: number;
      freeUnits: number;
    }>`
      SELECT n.night::text AS night, ut.id AS unit_type_id, ut.base_rate_minor,
             count(*) FILTER (WHERE NOT EXISTS (
               SELECT FROM blocking_occupancies o
               WHERE o.unit_id = u.id AND o.nights @> n.night
             )) AS free_units
      FROM unit_types ut
      JOIN units u ON u.unit_type_id = ut.id
      CROSS JOIN LATERAL (
        SELECT ${span.start.toString()}::date + offset_days AS night
        FROM generate_series(0, ${nightCount(span) - 1}) AS offset_days
      ) n
      WHERE ut.property_id = ${propertyId} AND ut.max_guests >= ${guests}
      GROUP BY n.night, ut.id
    `.execute(this.db);

    return rows.map((row) => ({ ...row, night: Temporal.PlainDate.from(row.night) }));
  }

  /** The property's rate overrides that cover any night of `span`. */
  async rateOverrides(
    propertyId: string,
    span: DateSpan,
    db: Database = this.db,
  ): Promise<OverridesByUnitType> {
    const rows = await db
      .selectFrom('rateOverrides as ro')
      .innerJoin('unitTypes as ut', 'ut.id', 'ro.unitTypeId')
      .select(['ro.unitTypeId', 'ro.nights', 'ro.rateMinor'])
      .where('ut.propertyId', '=', propertyId)
      .where(sql<boolean>`ro.nights && ${toDateRange(span)}::daterange`)
      .execute();

    const byUnitType = new Map<string, RateOverride[]>();
    for (const row of rows) {
      const overrides = byUnitType.get(row.unitTypeId) ?? [];
      overrides.push({ nights: fromDateRange(row.nights), rateMinor: row.rateMinor });
      byUnitType.set(row.unitTypeId, overrides);
    }
    return byUnitType;
  }

  /** The type's rooms that are free for the whole stay, with the free run around the stay. */
  async freeUnitsAround(trx: Transaction, unitTypeId: string, stay: DateSpan): Promise<FreeUnit[]> {
    const range = toDateRange(stay);
    const { rows } = await sql<{
      id: string;
      name: string;
      freeFrom: string | null;
      freeUntil: string | null;
    }>`
      SELECT u.id, u.name,
             (SELECT max(upper(o.nights)) FROM blocking_occupancies o
              WHERE o.unit_id = u.id AND o.nights << ${range}::daterange) AS free_from,
             (SELECT min(lower(o.nights)) FROM blocking_occupancies o
              WHERE o.unit_id = u.id AND o.nights >> ${range}::daterange) AS free_until
      FROM units u
      WHERE u.unit_type_id = ${unitTypeId}
        AND NOT EXISTS (
          SELECT FROM blocking_occupancies o
          WHERE o.unit_id = u.id AND o.nights && ${range}::daterange
        )
    `.execute(trx);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      freeFrom: row.freeFrom === null ? null : Temporal.PlainDate.from(row.freeFrom),
      freeUntil: row.freeUntil === null ? null : Temporal.PlainDate.from(row.freeUntil),
    }));
  }

  /**
   * Takes the room for the nights, or fails with an exclusion violation if it is taken. Locks
   * the room first: bookings racing for it then queue up, instead of inserting clashing rows at
   * the same moment, which can deadlock the exclusion check.
   */
  async occupy(trx: Transaction, occupancy: NewOccupancy): Promise<void> {
    await trx
      .selectFrom('units')
      .select('id')
      .where('id', '=', occupancy.unitId)
      .forNoKeyUpdate()
      .execute();
    await trx
      .insertInto('occupancies')
      .values({
        propertyId: occupancy.propertyId,
        unitId: occupancy.unitId,
        nights: toDateRange(occupancy.stay),
        reservationId: occupancy.reservationId,
      })
      .execute();
  }

  async releaseOccupancies(trx: Transaction, reservationIds: readonly string[]): Promise<void> {
    if (reservationIds.length === 0) {
      return;
    }
    await trx
      .updateTable('occupancies')
      .set({ releasedAt: sql<Date>`now()` })
      .where('reservationId', 'in', reservationIds)
      .where('releasedAt', 'is', null)
      .execute();
  }
}
