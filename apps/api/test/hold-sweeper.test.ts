import type { NestExpressApplication } from '@nestjs/platform-express';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HoldSweeper } from '../src/modules/reservations/hold-sweeper.js';
import type { Database } from '../src/platform/database/database.js';
import {
  eventsOf,
  lapseHold,
  placeHold,
  reservationIdOf,
  roomOf,
  statusOf,
} from './support/booking.js';
import { connectTestDatabase, createInventory } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

const now = Temporal.Instant.from('2026-10-27T22:30:00Z');

describe('hold sweeper', () => {
  const db: Database = connectTestDatabase();

  afterAll(async () => {
    await db.destroy();
  });

  async function placeTwoHolds(app: NestExpressApplication) {
    const { slug } = await createInventory(db);
    const lapsed = reservationIdOf(await placeHold(app.getHttpServer(), slug).expect(201));
    const live = reservationIdOf(await placeHold(app.getHttpServer(), slug).expect(201));
    await lapseHold(db, lapsed);
    return { lapsed, live };
  }

  describe('sweep', () => {
    let app: NestExpressApplication;

    beforeAll(async () => {
      app = await createTestApp({ now });
    });

    afterAll(async () => {
      await app.close();
    });

    it('expires lapsed holds, frees their rooms, and leaves live holds alone', async () => {
      const { lapsed, live } = await placeTwoHolds(app);

      // Other test files share the database, so their lapsed holds may be swept too.
      expect(await app.get(HoldSweeper).sweep()).toBeGreaterThanOrEqual(1);

      expect(await statusOf(db, lapsed)).toBe('expired');
      expect(await roomOf(db, lapsed)).toBeUndefined();
      expect(await eventsOf(db, lapsed)).toContainEqual({
        fromStatus: 'held',
        toStatus: 'expired',
        actor: 'system',
      });
      expect(await statusOf(db, live)).toBe('held');
      expect(await roomOf(db, live)).toBeDefined();
    });
  });

  it('runs on its own every interval', async () => {
    const app = await createTestApp({ now, env: { HOLD_SWEEP_INTERVAL_MS: '50' } });
    try {
      const { lapsed } = await placeTwoHolds(app);

      await expect.poll(() => statusOf(db, lapsed), { timeout: 5_000 }).toBe('expired');
    } finally {
      await app.close();
    }
  });
});
