import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database } from '../../platform/database/database.js';
import { fromDateRange, toDateRange } from '../../platform/database/date-range.js';
import type { DateSpan } from '../../platform/time/date-span.js';
import { type Block, UNIT_TYPE_COLUMNS, type Unit, type UnitType } from './inventory.repository.js';

export interface UnitTypeWithUnits extends UnitType {
  readonly units: readonly Unit[];
}

export interface NewUnitType {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly maxGuests: number;
  readonly baseRateMinor: number;
}

export interface UnitTypeChanges {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
  readonly maxGuests?: number | undefined;
  readonly baseRateMinor?: number | undefined;
}

export interface RateOverride {
  readonly id: string;
  readonly unitTypeId: string;
  readonly nights: DateSpan;
  readonly rateMinor: number;
  readonly label: string;
}

export type NewRateOverride = Omit<RateOverride, 'id'>;

/** Nights a room is taken: by a reservation's stay, or by a block. */
export type Occupancy =
  | {
      readonly kind: 'stay';
      readonly id: string;
      readonly unitId: string;
      readonly nights: DateSpan;
      readonly reservationId: string;
    }
  | ({ readonly kind: 'block' } & Block);

const RATE_OVERRIDE_COLUMNS = ['id', 'unitTypeId', 'nights', 'rateMinor', 'label'] as const;

/** The rooms, room types and rates a property's staff set up. Every query is scoped to the property. */
@Injectable()
export class HostInventoryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listUnitTypes(propertyId: string): Promise<UnitTypeWithUnits[]> {
    const [unitTypes, units] = await Promise.all([
      this.db
        .selectFrom('unitTypes')
        .select(UNIT_TYPE_COLUMNS)
        .where('propertyId', '=', propertyId)
        .orderBy('createdAt')
        .orderBy('id')
        .execute(),
      this.listUnits(propertyId),
    ]);
    return unitTypes.map((unitType) => ({
      ...unitType,
      units: units.filter((unit) => unit.unitTypeId === unitType.id),
    }));
  }

  /** The property's rooms, or one room type's, in name order. */
  async listUnits(propertyId: string, unitTypeId?: string): Promise<Unit[]> {
    let query = this.db
      .selectFrom('units')
      .select(['id', 'unitTypeId', 'name'])
      .where('propertyId', '=', propertyId);
    if (unitTypeId !== undefined) {
      query = query.where('unitTypeId', '=', unitTypeId);
    }
    const units = await query.execute();
    // Room names hold numbers, so "9" sorts before "10".
    return units.sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }

  /** Inserts the room type, or returns undefined if the property already has its slug. */
  async insertUnitType(propertyId: string, unitType: NewUnitType): Promise<UnitType | undefined> {
    return this.db
      .insertInto('unitTypes')
      .values({ propertyId, ...unitType })
      .onConflict((conflict) => conflict.columns(['propertyId', 'slug']).doNothing())
      .returning(UNIT_TYPE_COLUMNS)
      .executeTakeFirst();
  }

  async updateUnitType(
    propertyId: string,
    id: string,
    changes: UnitTypeChanges,
  ): Promise<UnitType | undefined> {
    return this.db
      .updateTable('unitTypes')
      .set(changes)
      .where('propertyId', '=', propertyId)
      .where('id', '=', id)
      .returning(UNIT_TYPE_COLUMNS)
      .executeTakeFirst();
  }

  async findUnitType(propertyId: string, id: string): Promise<UnitType | undefined> {
    return this.db
      .selectFrom('unitTypes')
      .select(UNIT_TYPE_COLUMNS)
      .where('propertyId', '=', propertyId)
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Inserts the room, or returns undefined if the property already has a room with its name.
   * Fails with a foreign key violation if the room type is not the property's.
   */
  async insertUnit(
    propertyId: string,
    unitTypeId: string,
    name: string,
  ): Promise<Unit | undefined> {
    return this.db
      .insertInto('units')
      .values({ propertyId, unitTypeId, name })
      .onConflict((conflict) => conflict.columns(['propertyId', 'name']).doNothing())
      .returning(['id', 'unitTypeId', 'name'])
      .executeTakeFirst();
  }

  /** Renames the room. Fails with a unique violation if another room has the name. */
  async renameUnit(propertyId: string, id: string, name: string): Promise<Unit | undefined> {
    return this.db
      .updateTable('units')
      .set({ name })
      .where('propertyId', '=', propertyId)
      .where('id', '=', id)
      .returning(['id', 'unitTypeId', 'name'])
      .executeTakeFirst();
  }

  /** The property's rate overrides with a night on or after `from`, in date order. */
  async listRateOverrides(propertyId: string, from: Temporal.PlainDate): Promise<RateOverride[]> {
    const rows = await this.db
      .selectFrom('rateOverrides as ro')
      .innerJoin('unitTypes as ut', 'ut.id', 'ro.unitTypeId')
      .select(['ro.id', 'ro.unitTypeId', 'ro.nights', 'ro.rateMinor', 'ro.label'])
      .where('ut.propertyId', '=', propertyId)
      .where(sql<boolean>`upper(ro.nights) > ${from.toString()}::date`)
      .orderBy(sql`lower(ro.nights)`)
      .orderBy('ro.id')
      .execute();
    return rows.map(toRateOverride);
  }

  /** Fails with an exclusion violation if another override of the type covers one of the nights. */
  async insertRateOverride(override: NewRateOverride): Promise<RateOverride> {
    const row = await this.db
      .insertInto('rateOverrides')
      .values({ ...override, nights: toDateRange(override.nights) })
      .returning(RATE_OVERRIDE_COLUMNS)
      .executeTakeFirstOrThrow();
    return toRateOverride(row);
  }

  /**
   * The stays and blocks that take a night of `span`, in date order. A hold that ran out is left
   * out: the next booking clears it, so the room is as good as free.
   */
  async listOccupancies(propertyId: string, span: DateSpan): Promise<Occupancy[]> {
    const rows = await this.db
      .selectFrom('blockingOccupancies')
      .select(['id', 'unitId', 'nights', 'reservationId', 'blockReason'])
      .where('propertyId', '=', propertyId)
      .where(sql<boolean>`nights && ${toDateRange(span)}::daterange`)
      .orderBy(sql`lower(nights)`)
      .orderBy('id')
      .execute();
    return rows.map(toOccupancy);
  }

  /** The rooms the reservations take now, by reservation id. Reservations without one are left out. */
  async roomsOf(propertyId: string, reservationIds: readonly string[]): Promise<Map<string, Unit>> {
    if (reservationIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .selectFrom('occupancies as o')
      .innerJoin('units as u', 'u.id', 'o.unitId')
      .select(['o.reservationId', 'u.id', 'u.unitTypeId', 'u.name'])
      .where('o.propertyId', '=', propertyId)
      .where('o.reservationId', 'in', reservationIds)
      .where('o.releasedAt', 'is', null)
      .execute();
    return new Map(
      rows.flatMap(({ reservationId, ...unit }) =>
        reservationId === null ? [] : [[reservationId, unit] as const],
      ),
    );
  }

  /** Deletes the override if it belongs to the property, and says whether it did. */
  async deleteRateOverride(propertyId: string, id: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom('rateOverrides')
      .where('id', '=', id)
      .where('unitTypeId', 'in', (eb) =>
        eb.selectFrom('unitTypes').select('id').where('propertyId', '=', propertyId),
      )
      .executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}

function toRateOverride(row: {
  id: string;
  unitTypeId: string;
  nights: string;
  rateMinor: number;
  label: string;
}): RateOverride {
  return { ...row, nights: fromDateRange(row.nights) };
}

/** A view's columns are all nullable to the type generator; the occupancies table rules out nulls. */
function toOccupancy(row: {
  id: string | null;
  unitId: string | null;
  nights: string | null;
  reservationId: string | null;
  blockReason: string | null;
}): Occupancy {
  const { id, unitId, nights, reservationId, blockReason } = row;
  if (id === null || unitId === null || nights === null) {
    throw new TypeError('An occupancy is missing its id, room or nights');
  }
  const span = fromDateRange(nights);
  if (reservationId !== null) {
    return { kind: 'stay', id, unitId, nights: span, reservationId };
  }
  if (blockReason !== null) {
    return { kind: 'block', id, unitId, nights: span, reason: blockReason };
  }
  throw new TypeError(`Occupancy ${id} is neither a stay nor a block`);
}
