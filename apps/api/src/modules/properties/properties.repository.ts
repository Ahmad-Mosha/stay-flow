import { Inject, Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database, type Transaction } from '../../platform/database/database.js';
import type { Properties } from '../../platform/database/database.generated.js';
import type { Property } from './property.js';

export interface PropertyChanges {
  readonly name?: string | undefined;
  readonly checkInTime?: string | undefined;
  readonly checkOutTime?: string | undefined;
  readonly minNights?: number | undefined;
  readonly maxNights?: number | undefined;
  readonly bookingWindowDays?: number | undefined;
  readonly freeCancellationHours?: number | undefined;
}

export interface NewProperty {
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
  readonly currency: string;
}

@Injectable()
export class PropertiesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findBySlug(slug: string, db: Database = this.db): Promise<Property | undefined> {
    const row = await db
      .selectFrom('properties')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();
    return row === undefined ? undefined : toProperty(row);
  }

  async findByIds(ids: readonly string[]): Promise<Property[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.db
      .selectFrom('properties')
      .selectAll()
      .where('id', 'in', ids)
      .execute();
    return rows.map(toProperty);
  }

  /** Inserts the property, or returns undefined if its slug is taken. */
  async insert(trx: Transaction, property: NewProperty): Promise<Property | undefined> {
    const row = await trx
      .insertInto('properties')
      .values(property)
      .onConflict((conflict) => conflict.column('slug').doNothing())
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? undefined : toProperty(row);
  }

  /** Applies the changes, or returns undefined if no property has this id. */
  async update(id: string, changes: PropertyChanges): Promise<Property | undefined> {
    const row = await this.db
      .updateTable('properties')
      .set(changes)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row === undefined ? undefined : toProperty(row);
  }
}

function toProperty(row: Selectable<Properties>): Property {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    timeZone: row.timeZone,
    currency: row.currency,
    checkInTime: Temporal.PlainTime.from(row.checkInTime),
    checkOutTime: Temporal.PlainTime.from(row.checkOutTime),
    stayRules: {
      minNights: row.minNights,
      maxNights: row.maxNights,
      bookingWindowDays: row.bookingWindowDays,
      freeCancellationHours: row.freeCancellationHours,
    },
  };
}
