import { randomBytes, randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/platform/database/database.js';
import { Housekeeping } from '../../src/platform/housekeeping/housekeeping.js';
import { createSignedInUser } from '../support/access.js';
import { connectTestDatabase, createInventory, createReservation } from '../support/fixtures.js';
import { createTestWorker, type TestWorker } from '../support/test-worker.js';

const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

/** `now` moved by a duration, such as `{ days: -8 }`. */
const at = (duration: Temporal.DurationLike) =>
  new Date(now.toZonedDateTimeISO('UTC').add(duration).epochMilliseconds);

describe('housekeeping', () => {
  const db: Database = connectTestDatabase();
  let worker: TestWorker;

  beforeAll(async () => {
    worker = await createTestWorker({ now });
  });

  afterAll(async () => {
    await worker.app.close();
    await db.destroy();
  });

  const run = () => worker.app.get(Housekeeping).run();

  it('deletes sessions and guest links once they expire', async () => {
    const { id: userId } = await createSignedInUser(db);
    const sessions = await db
      .insertInto('sessions')
      .values(
        [{ days: -1 }, { minutes: 1 }].map((expiry) => ({
          userId,
          tokenHash: randomBytes(32),
          createdAt: at({ days: -2 }),
          expiresAt: at(expiry),
        })),
      )
      .returning('id')
      .execute();
    const inventory = await createInventory(db);
    const { id: reservationId } = await createReservation(db, {
      ...inventory,
      nights: '[2026-09-01,2026-09-03)',
    });
    const links = await db
      .insertInto('guestAccessTokens')
      .values(
        [{ days: -1 }, { days: 1 }].map((expiry) => ({
          reservationId,
          tokenHash: randomBytes(32),
          expiresAt: at(expiry),
        })),
      )
      .returning('id')
      .execute();

    await run();

    expect(await idsIn('sessions', sessions)).toEqual([sessions[1]?.id]);
    expect(await idsIn('guestAccessTokens', links)).toEqual([links[1]?.id]);
  });

  it('keeps idempotency keys for a day', async () => {
    const scope = `housekeeping-${randomUUID()}`;
    await db
      .insertInto('idempotencyKeys')
      .values(
        [
          { key: 'old', createdAt: at({ hours: -25 }) },
          { key: 'recent', createdAt: at({ hours: -23 }) },
        ].map((row) => ({ ...row, scope, requestHash: 'hash', response: {} })),
      )
      .execute();

    await run();

    const kept = await db
      .selectFrom('idempotencyKeys')
      .select('key')
      .where('scope', '=', scope)
      .execute();
    expect(kept).toEqual([{ key: 'recent' }]);
  });

  it('deletes rate limit windows that ended long ago, however many there are', async () => {
    const prefix = `housekeeping-${randomUUID()}`;
    // More than one batch of old windows, and one current window.
    await sql`
      INSERT INTO rate_limits (key, window_start, hits)
      SELECT ${prefix} || ':' || n, ${at({ days: -2 })}::timestamptz, 1
      FROM generate_series(1, 5100) AS n
    `.execute(db);
    await db
      .insertInto('rateLimits')
      .values({ key: `${prefix}:current`, windowStart: at({ minutes: -5 }), hits: 3 })
      .execute();

    expect((await run()).rate_limits).toBeGreaterThanOrEqual(5100);

    const kept = await db
      .selectFrom('rateLimits')
      .select('key')
      .where('key', 'like', `${prefix}:%`)
      .execute();
    expect(kept).toEqual([{ key: `${prefix}:current` }]);
  });

  it('deletes outbox events a week after delivery, and keeps dead and waiting ones', async () => {
    const event = { type: 'housekeeping.test', payload: {}, createdAt: at({ days: -30 }) };
    const events = await db
      .insertInto('outboxEvents')
      .values([
        { ...event, processedAt: at({ days: -8 }) },
        { ...event, processedAt: at({ days: -6 }) },
        { ...event, deadAt: at({ days: -30 }) },
        // Waiting a long time for its turn, say while the mail server is down.
        { ...event, availableAt: at({ days: 1 }) },
      ])
      .returning('id')
      .execute();

    await run();

    expect(await idsIn('outboxEvents', events)).toEqual(events.slice(1).map(({ id }) => id));
  });

  async function idsIn(
    table: 'sessions' | 'guestAccessTokens' | 'outboxEvents',
    rows: readonly { id: string }[],
  ): Promise<string[]> {
    const kept = await db
      .selectFrom(table)
      .select('id')
      .where(
        'id',
        'in',
        rows.map(({ id }) => id),
      )
      .orderBy('id')
      .execute();
    return kept.map(({ id }) => id);
  }
});
