import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'kysely';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HoldSweeper } from '../src/modules/reservations/hold-sweeper.js';
import { ReservationsRepository } from '../src/modules/reservations/reservations.repository.js';
import type { Database } from '../src/platform/database/database.js';
import {
  confirmReservation,
  errorCodeOf,
  eventsOf,
  placeHold,
  reservationCount,
  reservationIdOf,
  roomOf,
  statusOf,
} from './support/booking.js';
import { connectTestDatabase, createInventory, occupy } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

const now = Temporal.Instant.from('2026-10-27T22:30:00Z');

/** How many times each race runs. The plan's acceptance run uses CONCURRENCY_RUNS=100. */
const RUNS = Number(process.env.CONCURRENCY_RUNS ?? 20);

const guest = { name: 'Nour Hassan', email: 'nour@example.com' };

describe('booking under concurrency', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;
  let url: string;

  beforeAll(async () => {
    app = await createTestApp({ now });
    // One listening server for all requests, so they truly arrive at the same time.
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  async function heldReservation(): Promise<string> {
    const { slug } = await createInventory(db);
    return reservationIdOf(await placeHold(url, slug).expect(201));
  }

  /** Sets the hold to lapse a few milliseconds from now, by the database clock. */
  async function lapseSoon(id: string, milliseconds: number): Promise<void> {
    await db
      .updateTable('reservations')
      .set({
        holdExpiresAt: sql<Date>`clock_timestamp() + make_interval(secs => ${milliseconds / 1000})`,
      })
      .where('id', '=', id)
      .execute();
  }

  it('gives the last free room to exactly one of 50 simultaneous holds', async () => {
    for (let run = 0; run < RUNS; run++) {
      const { slug, propertyId, unitIds } = await createInventory(db);
      const [lastRoom, blockedRoom] = unitIds;
      await occupy(db, {
        propertyId,
        unitId: blockedRoom,
        nights: '[2026-12-01,2026-12-31)',
        blockReason: 'Repairs',
      });

      const responses = await Promise.all(Array.from({ length: 50 }, () => placeHold(url, slug)));

      const created = responses.filter((response) => response.status === 201);
      const soldOut = responses.filter((response) => errorCodeOf(response) === 'SOLD_OUT');
      expect(created).toHaveLength(1);
      expect(soldOut).toHaveLength(49);
      for (const id of created.map(reservationIdOf)) {
        expect(await roomOf(db, id)).toBe(lastRoom);
      }
      expect(await reservationCount(db, propertyId)).toBe(1);
    }
  });

  it('creates one hold for the same Idempotency-Key sent 10 times at once', async () => {
    for (let run = 0; run < RUNS; run++) {
      const { slug, propertyId } = await createInventory(db);
      const key = randomUUID();

      const responses = await Promise.all(
        Array.from({ length: 10 }, () => placeHold(url, slug, {}, key)),
      );

      const created = responses.filter((response) => response.status === 201);
      const turnedAway = responses.filter((response) => response.status !== 201);
      expect(created.length).toBeGreaterThanOrEqual(1);
      expect(new Set(created.map(reservationIdOf)).size).toBe(1);
      for (const response of turnedAway) {
        expect(response.status).toBe(409);
        expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_IN_USE' });
      }
      expect(await reservationCount(db, propertyId)).toBe(1);
    }
  });

  describe('confirm racing the sweeper at the hold deadline', () => {
    const reservations = new ReservationsRepository();

    /**
     * A transaction's now() is the moment it began. Starting the confirm before the deadline
     * and the sweep after it makes both see the hold as theirs to take.
     */
    async function raceAtDeadline(id: string) {
      await lapseSoon(id, 200);
      const confirming = await db.startTransaction().execute();
      await sql`SELECT now()`.execute(confirming);
      await sleep(300);
      const sweeping = await db.startTransaction().execute();
      return { confirming, sweeping };
    }

    it('lets confirm win when it locks the hold first', async () => {
      const id = await heldReservation();
      const { confirming, sweeping } = await raceAtDeadline(id);

      expect(await reservations.confirm(confirming, id, guest)).toBe(true);
      expect(await reservations.expireDueHolds(sweeping, { limit: 10_000 })).not.toContain(id);
      await sweeping.commit().execute();
      await confirming.commit().execute();

      expect(await statusOf(db, id)).toBe('confirmed');
    });

    it('lets the sweeper win when it locks the hold first', async () => {
      const id = await heldReservation();
      const { confirming, sweeping } = await raceAtDeadline(id);

      expect(await reservations.expireDueHolds(sweeping, { limit: 10_000 })).toContain(id);
      // Confirm waits for the sweeper's row lock, then finds the hold no longer held.
      const confirmed = reservations.confirm(confirming, id, guest);
      await sleep(100);
      await sweeping.commit().execute();
      expect(await confirmed).toBe(false);
      await confirming.rollback().execute();

      expect(await statusOf(db, id)).toBe('expired');
    });

    it('never lets both win over HTTP, whatever the timing', async () => {
      const sweeper = app.get(HoldSweeper);

      for (let run = 0; run < RUNS; run++) {
        const id = await heldReservation();
        await lapseSoon(id, 20);

        const [confirmed] = await Promise.all([
          sleep(randomInt(40)).then(() => confirmReservation(url, id)),
          sleep(randomInt(40)).then(() => sweeper.sweep()),
        ]);

        const status = await statusOf(db, id);
        if (confirmed.status === 200) {
          expect(status).toBe('confirmed');
          expect(await roomOf(db, id)).toBeDefined();
        } else {
          expect(confirmed.body).toMatchObject({ code: 'HOLD_EXPIRED' });
          expect(status).not.toBe('confirmed');
        }
        // One move at most: confirmed or expired, or still held if the sweep came too early.
        expect(await eventsOf(db, id)).toHaveLength(status === 'held' ? 1 : 2);
      }
    });
  });
});
