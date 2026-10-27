import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database } from '../../platform/database/database.js';
import { fromDateRange, toDateRange } from '../../platform/database/date-range.js';
import { type DateSpan, nightCount } from '../../platform/time/date-span.js';
import type { RateOverride } from './pricing.js';

export interface UnitTypeWithFreeUnits {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly maxGuests: number;
  readonly baseRateMinor: number;
  readonly freeUnits: number;
}

export interface FreeUnitsOnNight {
  readonly night: Temporal.PlainDate;
  readonly unitTypeId: string;
  readonly baseRateMinor: number;
  readonly freeUnits: number;
}

/** Rate overrides grouped by room type id. */
export type OverridesByUnitType = ReadonlyMap<string, readonly RateOverride[]>;

@Injectable()
export class InventoryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

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
  async rateOverrides(propertyId: string, span: DateSpan): Promise<OverridesByUnitType> {
    const rows = await this.db
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
}
