import { sql } from 'kysely';
import type { Database } from '../../src/platform/database/database.js';
import { deferred } from './deferred.js';

export interface RoomLock {
  /** How many queries are waiting for the lock, directly or behind another waiter. */
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
      // A row lock queues its waiters behind the first one, so count the whole chain.
      const { rows } = await sql<{ count: number }>`
        WITH RECURSIVE waiting (pid) AS (
          SELECT pid FROM pg_stat_activity WHERE ${holder} = ANY (pg_blocking_pids(pid))
          UNION
          SELECT activity.pid
          FROM pg_stat_activity AS activity
          JOIN waiting ON waiting.pid = ANY (pg_blocking_pids(activity.pid))
        )
        SELECT count(*)::int AS count FROM waiting
      `.execute(db);
      return rows[0]?.count ?? 0;
    },
    async release() {
      released.resolve(undefined);
      await transaction;
    },
  };
}
