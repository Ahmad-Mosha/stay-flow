import { Inject, Injectable } from '@nestjs/common';
import { type ExpressionBuilder, sql } from 'kysely';
import { DATABASE, type Database, type Transaction } from '../database/database.js';
import type { DB } from '../database/database.generated.js';
import type { NewOutboxEvent, OutboxEvent } from './outbox-event.js';

/** Enough of an error to act on, without filling the table with stack traces. */
const MAX_ERROR_LENGTH = 2_000;

/**
 * Matches the event only while the claim that returned it is the latest. Once a lease runs out,
 * another worker can claim the event again, which adds one to its attempts. From then on, every
 * write from the first worker matches nothing.
 */
function stillClaimed(eb: ExpressionBuilder<DB, 'outboxEvents'>, event: OutboxEvent) {
  return eb.and([
    eb('id', '=', event.id),
    eb('attempts', '=', event.attempt),
    eb('processedAt', 'is', null),
    eb('deadAt', 'is', null),
  ]);
}

@Injectable()
export class OutboxRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async insert(trx: Transaction, event: NewOutboxEvent): Promise<void> {
    await trx
      .insertInto('outboxEvents')
      .values({ type: event.type, payload: event.payload })
      .execute();
  }

  /**
   * Takes up to `limit` due events and hides them from other workers for `leaseMs`, oldest first.
   * SKIP LOCKED lets workers that claim at the same moment take different events without waiting.
   */
  async claim(limit: number, leaseMs: number): Promise<OutboxEvent[]> {
    const rows = await this.db
      // Materialized, so PostgreSQL runs the locking SELECT exactly once.
      .with(
        (cte) => cte('due').materialized(),
        (db) =>
          db
            .selectFrom('outboxEvents')
            .select('id')
            .where('processedAt', 'is', null)
            .where('deadAt', 'is', null)
            .where('availableAt', '<=', sql<Date>`now()`)
            .orderBy('availableAt')
            .limit(limit)
            .forUpdate()
            .skipLocked(),
      )
      .updateTable('outboxEvents')
      .from('due')
      .set((eb) => ({
        availableAt: sql<Date>`now() + make_interval(secs => ${leaseMs / 1000})`,
        attempts: eb('attempts', '+', 1),
      }))
      .whereRef('outboxEvents.id', '=', 'due.id')
      .returning(['outboxEvents.id', 'type', 'payload', 'attempts'])
      .execute();
    // RETURNING keeps no order. The ids are UUIDv7, so sorting them sorts by creation.
    return rows
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => ({ id: row.id, type: row.type, payload: row.payload, attempt: row.attempts }));
  }

  /**
   * Gives the event a full lease again, just before its handler runs, so that a slow batch never
   * lets the events at its end run out. False when another worker has claimed it since.
   */
  async renewLease(event: OutboxEvent, leaseMs: number): Promise<boolean> {
    const { numUpdatedRows } = await this.db
      .updateTable('outboxEvents')
      .set({ availableAt: sql<Date>`now() + make_interval(secs => ${leaseMs / 1000})` })
      .where((eb) => stillClaimed(eb, event))
      .executeTakeFirst();
    return numUpdatedRows > 0n;
  }

  async complete(event: OutboxEvent): Promise<void> {
    await this.db
      .updateTable('outboxEvents')
      .set({ processedAt: sql<Date>`now()`, lastError: null })
      .where((eb) => stillClaimed(eb, event))
      .execute();
  }

  /** Records the failure and makes the event due again after `delayMs`. */
  async retryLater(event: OutboxEvent, error: string, delayMs: number): Promise<void> {
    await this.db
      .updateTable('outboxEvents')
      .set({
        availableAt: sql<Date>`now() + make_interval(secs => ${delayMs / 1000})`,
        lastError: error.slice(0, MAX_ERROR_LENGTH),
      })
      .where((eb) => stillClaimed(eb, event))
      .execute();
  }

  /** Gives up on the event. It stays in the table, for a person to look at. */
  async bury(event: OutboxEvent, error: string): Promise<void> {
    await this.db
      .updateTable('outboxEvents')
      .set({ deadAt: sql<Date>`now()`, lastError: error.slice(0, MAX_ERROR_LENGTH) })
      .where((eb) => stillClaimed(eb, event))
      .execute();
  }

  /** Hands back claimed events that were never tried, so another worker can take them now. */
  async release(events: readonly OutboxEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }
    await this.db
      .updateTable('outboxEvents')
      .set((eb) => ({ availableAt: sql<Date>`now()`, attempts: eb('attempts', '-', 1) }))
      .where((eb) => eb.or(events.map((event) => stillClaimed(eb, event))))
      .execute();
  }
}
