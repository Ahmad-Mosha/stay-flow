import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database, type Transaction } from '../database/database.js';
import { AppError } from '../errors/app-error.js';

export interface IdempotentRequest {
  /** The operation, such as `place-hold`. A key is unique within its scope. */
  readonly scope: string;
  readonly key: string;
  /** What the client asked for. A retry with the same key must ask for the same thing. */
  readonly payload: unknown;
}

export interface IdempotentResult<T> {
  readonly response: T;
  /** True when the response was stored by an earlier request with the same key. */
  readonly replayed: boolean;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Runs `work` in a transaction at most once per key. The key and the response commit with
   * the work's writes, so a retry either gets the stored response or runs the work for the
   * first time. Failures are not stored: they roll back, and a retry runs again.
   */
  async run<T>(
    request: IdempotentRequest,
    work: (trx: Transaction) => Promise<T>,
  ): Promise<IdempotentResult<T>> {
    const requestHash = createHash('sha256').update(JSON.stringify(request.payload)).digest('hex');

    return this.db.transaction().execute(async (trx) => {
      // Held until commit, so a duplicate that arrives meanwhile is turned away, not run twice.
      const { rows } = await sql<{ acquired: boolean }>`
        SELECT pg_try_advisory_xact_lock(
          hashtextextended(${`${request.scope}:${request.key}`}, 0)
        ) AS acquired
      `.execute(trx);
      if (rows[0]?.acquired !== true) {
        throw new AppError(
          'IDEMPOTENCY_KEY_IN_USE',
          'A request with this Idempotency-Key is still in progress. Retry once it finishes.',
        );
      }

      const saved = await trx
        .selectFrom('idempotencyKeys')
        .select(['requestHash', 'response'])
        .where('scope', '=', request.scope)
        .where('key', '=', request.key)
        .executeTakeFirst();
      if (saved !== undefined) {
        if (saved.requestHash !== requestHash) {
          throw new AppError(
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was already used for a different request.',
          );
        }
        return { response: saved.response as T, replayed: true };
      }

      const response = await work(trx);
      await trx
        .insertInto('idempotencyKeys')
        .values({
          scope: request.scope,
          key: request.key,
          requestHash,
          // As text: node-postgres would send a top-level array as a PostgreSQL array.
          response: JSON.stringify(response),
        })
        .execute();
      return { response, replayed: false };
    });
  }
}
