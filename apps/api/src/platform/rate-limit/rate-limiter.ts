import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { DATABASE, type Database } from '../database/database.js';
import { AppError } from '../errors/app-error.js';

/** At most `limit` requests in each window of `windowSeconds`, counted per subject. */
export interface RateLimit {
  /** Names the rule inside the stored key, such as `sign-in`. */
  readonly name: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

@Injectable()
export class RateLimiter {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /**
   * Counts one request for `subject`, such as a client IP, and throws RATE_LIMITED once the
   * window is full. It commits on its own, so a request that fails afterwards still counts.
   */
  async consume(rule: RateLimit, subject: string): Promise<void> {
    const window = sql`make_interval(secs => ${rule.windowSeconds})`;
    // The upsert locks the row, so concurrent requests count one after another.
    const { rows } = await sql<{ hits: number; retryAfterSeconds: number }>`
      INSERT INTO rate_limits AS r (key, window_start, hits)
      VALUES (${`${rule.name}:${subject}`}, now(), 1)
      ON CONFLICT (key) DO UPDATE SET
        window_start = CASE WHEN r.window_start + ${window} <= now() THEN now() ELSE r.window_start END,
        hits = CASE WHEN r.window_start + ${window} <= now() THEN 1 ELSE r.hits + 1 END
      RETURNING hits,
        greatest(1, ceil(extract(epoch FROM window_start + ${window} - now())))::int
          AS retry_after_seconds
    `.execute(this.db);

    const [count] = rows;
    if (count !== undefined && count.hits > rule.limit) {
      throw new AppError(
        'RATE_LIMITED',
        `Too many attempts. Try again in ${String(count.retryAfterSeconds)} seconds.`,
        { headers: { 'Retry-After': String(count.retryAfterSeconds) } },
      );
    }
  }
}
