import { sql } from 'kysely';
import type { Transaction } from './database.js';

/**
 * Runs `work` in a savepoint. If it fails, only its own changes are undone and the transaction
 * stays usable; without the savepoint, any failed statement aborts the whole transaction.
 */
export async function inSavepoint<T>(trx: Transaction, work: () => Promise<T>): Promise<T> {
  await sql`SAVEPOINT attempt`.execute(trx);
  try {
    const result = await work();
    await sql`RELEASE SAVEPOINT attempt`.execute(trx);
    return result;
  } catch (error) {
    await sql`ROLLBACK TO SAVEPOINT attempt`.execute(trx);
    throw error;
  }
}
