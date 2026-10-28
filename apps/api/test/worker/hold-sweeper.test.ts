import type { NestExpressApplication } from '@nestjs/platform-express';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HoldSweeper } from '../../src/modules/reservations/hold-sweeper.js';
import type { Database } from '../../src/platform/database/database.js';
import { Metrics } from '../../src/platform/metrics/metrics.js';
import {
  eventsOf,
  lapseHold,
  placeHold,
  reservationIdOf,
  roomOf,
  statusOf,
} from '../support/booking.js';
import { connectTestDatabase, createInventory } from '../support/fixtures.js';
import { createTestApp } from '../support/test-app.js';
import { createTestWorker, type TestWorker } from '../support/test-worker.js';

const now = Temporal.Instant.from('2026-10-27T22:30:00Z');

describe('hold sweeper', () => {
  const db: Database = connectTestDatabase();
  let api: NestExpressApplication;

  beforeAll(async () => {
    api = await createTestApp({ now });
  });

  afterAll(async () => {
    await api.close();
    await db.destroy();
  });

  async function placeTwoHolds() {
    const { slug } = await createInventory(db);
    const lapsed = reservationIdOf(await placeHold(api.getHttpServer(), slug).expect(201));
    const live = reservationIdOf(await placeHold(api.getHttpServer(), slug).expect(201));
    await lapseHold(db, lapsed);
    return { lapsed, live };
  }

  describe('sweep', () => {
    let worker: TestWorker;

    beforeAll(async () => {
      worker = await createTestWorker({ now });
    });

    afterAll(async () => {
      await worker.app.close();
    });

    it('expires lapsed holds, frees their rooms, and leaves live holds alone', async () => {
      const { lapsed, live } = await placeTwoHolds();

      // Other test files share the database, so their lapsed holds may be swept too.
      const swept = await worker.app.get(HoldSweeper).sweep();
      expect(swept).toBeGreaterThanOrEqual(1);
      const { values } = await worker.app.get(Metrics).holdsExpired.get();
      expect(values[0]?.value).toBe(swept);

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

  it('runs in the worker every interval', async () => {
    const worker = await createTestWorker({ now, env: { HOLD_SWEEP_INTERVAL_MS: '50' } });
    try {
      const { lapsed } = await placeTwoHolds();

      await expect.poll(() => statusOf(db, lapsed), { timeout: 5_000 }).toBe('expired');
    } finally {
      await worker.app.close();
    }
  });
});
