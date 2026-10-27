import { Inject, Injectable } from '@nestjs/common';
import { type RawBuilder, sql } from 'kysely';
import { PinoLogger } from 'nestjs-pino';
import { DATABASE, type Database } from '../database/database.js';
import { MAX_WINDOW_SECONDS } from '../rate-limit/rate-limiter.js';
import { Clock } from '../time/clock.js';

/** Small batches keep each delete's locks and write-ahead log short. */
const BATCH_SIZE = 5_000;

interface RetentionRule {
  /** For the logs. */
  readonly name: string;
  readonly table: string;
  /** Matches the rows that have done their job, given the time now. */
  readonly done: (now: Date) => RawBuilder<boolean>;
}

/** The short-lived rows housekeeping deletes. Bookings and their history are never deleted. */
const RETENTION: readonly RetentionRule[] = [
  {
    name: 'expired sessions',
    table: 'sessions',
    done: (now) => sql`expires_at <= ${now}`,
  },
  {
    name: 'expired guest links',
    table: 'guest_access_tokens',
    done: (now) => sql`expires_at <= ${now}`,
  },
  {
    // A day is plenty for any client's retries, as with Stripe's keys. Later, a retry is new.
    name: 'old idempotency keys',
    table: 'idempotency_keys',
    done: (now) => sql`created_at <= ${now}::timestamptz - interval '1 day'`,
  },
  {
    // Such a window is over, and a missing row counts the same as an ended window.
    name: 'ended rate limit windows',
    table: 'rate_limits',
    done: (now) =>
      sql`window_start <= ${now}::timestamptz - make_interval(secs => ${MAX_WINDOW_SECONDS})`,
  },
  {
    // A week answers "did the guest get the email?". Dead events stay until a person looks.
    name: 'delivered outbox events',
    table: 'outbox_events',
    done: (now) => sql`processed_at <= ${now}::timestamptz - interval '7 days'`,
  },
];

/** Deletes the rows that have done their job, so these tables stay small. Run by the worker. */
@Injectable()
export class Housekeeping {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly clock: Clock,
    // Not @InjectPinoLogger(): it only works for classes imported before the LoggerModule is.
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(Housekeeping.name);
  }

  /** Returns how many rows it deleted from each table. */
  async run(signal?: AbortSignal): Promise<Record<string, number>> {
    const now = new Date(this.clock.now().epochMilliseconds);
    const deleted: Record<string, number> = {};
    for (const rule of RETENTION) {
      if (signal?.aborted === true) {
        break;
      }
      const count = await this.purge(rule, now, signal);
      deleted[rule.table] = count;
      if (count > 0) {
        this.logger.info({ deleted: count }, `Deleted ${rule.name}`);
      }
    }
    return deleted;
  }

  private async purge(rule: RetentionRule, now: Date, signal?: AbortSignal): Promise<number> {
    const table = sql.table(rule.table);
    let total = 0;
    for (;;) {
      // ANY(ARRAY(...)) finds the rows by their ctid, without a second scan of the table. The
      // outer condition is checked again on a row that changed meanwhile, so a rate limit window
      // that has just restarted stays.
      const { numAffectedRows = 0n } = await sql`
        DELETE FROM ${table}
        WHERE ctid = ANY(ARRAY(SELECT ctid FROM ${table} WHERE ${rule.done(now)} LIMIT ${BATCH_SIZE}))
          AND ${rule.done(now)}
      `.execute(this.db);
      total += Number(numAffectedRows);
      if (numAffectedRows < BigInt(BATCH_SIZE) || signal?.aborted === true) {
        return total;
      }
    }
  }
}
