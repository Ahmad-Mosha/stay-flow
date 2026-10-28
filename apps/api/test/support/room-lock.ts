import { sql } from 'kysely';
import type { Database } from '../../src/platform/database/database.js';
import { deferred } from './deferred.js';

export interface RoomLock {
  /** How many queries are waiting for the lock. */
  waiters(): Promise<number>;
  release(): Promise<void>;
}

/**
 * Locks a property's rooms in a transaction of the test's own. Bookings there pick their room,
 * then wait to take it until `release`.
 */
export async function lockRooms(db: Database, propertyId: string): Promise<RoomLock> {
  const locked = deferred<number>();
  const released = deferred<undefined>();
  const transaction = db.transaction().execute(async (trx) => {
    await trx
      .selectFrom('units')
      .select('id')
      .where('propertyId', '=', propertyId)
      .forUpdate()
      .execute();
    const { pid } = await trx
      .selectNoFrom(sql<number>`pg_backend_pid()`.as('pid'))
      .executeTakeFirstOrThrow();
    locked.resolve(pid);
    await released.promise;
  });
  const holder = await locked.promise;

  return {
    async waiters() {
      const { count } = await db
        .selectNoFrom(
          sql<number>`(
            SELECT count(*)::int FROM pg_stat_activity WHERE ${holder} = ANY (pg_blocking_pids(pid))
          )`.as('count'),
        )
        .executeTakeFirstOrThrow();
      return count;
    },
    async release() {
      released.resolve(undefined);
      await transaction;
    },
  };
}
