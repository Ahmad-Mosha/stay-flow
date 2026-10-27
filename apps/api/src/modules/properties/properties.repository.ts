import { Inject, Injectable } from '@nestjs/common';
import { Temporal } from 'temporal-polyfill';
import { DATABASE, type Database } from '../../platform/database/database.js';
import type { Property } from './property.js';

@Injectable()
export class PropertiesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findBySlug(slug: string, db: Database = this.db): Promise<Property | undefined> {
    const row = await db
      .selectFrom('properties')
      .selectAll()
      .where('slug', '=', slug)
      .executeTakeFirst();
    if (row === undefined) {
      return undefined;
    }

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
}
