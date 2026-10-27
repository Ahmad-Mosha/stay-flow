import { Temporal } from 'temporal-polyfill';
import { afterAll, describe, expect, it } from 'vitest';
import { NightAudit } from '../../src/modules/reservations/night-audit.js';
import type { ReservationStatus } from '../../src/platform/database/database.generated.js';
import type { Database } from '../../src/platform/database/database.js';
import { eventsOf, roomOf, statusOf } from '../support/booking.js';
import { connectTestDatabase, createInventory, createStay } from '../support/fixtures.js';
import { createTestWorker } from '../support/test-worker.js';

describe('night audit', () => {
  const db: Database = connectTestDatabase();

  afterAll(async () => {
    await db.destroy();
  });

  /** A stay at a property of its own, in `timeZone`, with its room taken. */
  async function stay(
    timeZone: string,
    nights: string,
    status: ReservationStatus = 'confirmed',
  ): Promise<string> {
    const inventory = await createInventory(db, { timeZone });
    const { id } = await createStay(db, {
      ...inventory,
      unitId: inventory.unitIds[0],
      nights,
      status,
    });
    return id;
  }

  /** Runs the audit as the worker would at `at`. */
  async function auditAt(at: string): Promise<void> {
    const worker = await createTestWorker({ now: Temporal.Instant.from(at) });
    try {
      await worker.app.get(NightAudit).run();
    } finally {
      await worker.app.close();
    }
  }

  it('marks a guest who never came as a no-show at 04:00 the next morning, and frees the room', async () => {
    const missed = await stay('Africa/Cairo', '[2026-10-26,2026-10-28)');

    // 03:59 on 27 October in Cairo: a late arrival can still check in.
    await auditAt('2026-10-27T00:59:00Z');
    expect(await statusOf(db, missed)).toBe('confirmed');

    // 04:00 in Cairo.
    await auditAt('2026-10-27T01:00:00Z');
    expect(await statusOf(db, missed)).toBe('no_show');
    expect(await roomOf(db, missed)).toBeUndefined();
    expect(await eventsOf(db, missed)).toContainEqual({
      fromStatus: 'confirmed',
      toStatus: 'no_show',
      actor: 'system',
    });
  });

  it("follows each property's own clock", async () => {
    const newYork = await stay('America/New_York', '[2026-10-26,2026-10-28)');

    // 04:00 in Cairo is still 21:00 the evening before in New York.
    await auditAt('2026-10-27T01:00:00Z');
    expect(await statusOf(db, newYork)).toBe('confirmed');

    // 04:00 in New York.
    await auditAt('2026-10-27T08:00:00Z');
    expect(await statusOf(db, newYork)).toBe('no_show');
  });

  it('catches up on arrivals missed while the worker was down', async () => {
    const longGone = await stay('Africa/Cairo', '[2026-10-20,2026-10-22)');

    await auditAt('2026-10-27T01:00:00Z');

    expect(await statusOf(db, longGone)).toBe('no_show');
  });

  it("leaves today's arrivals, and guests who checked in, alone", async () => {
    const arrivingToday = await stay('Africa/Cairo', '[2026-10-27,2026-10-29)');
    const inHouse = await stay('Africa/Cairo', '[2026-10-25,2026-10-28)', 'checked_in');

    await auditAt('2026-10-27T01:00:00Z');

    expect(await statusOf(db, arrivingToday)).toBe('confirmed');
    expect(await statusOf(db, inHouse)).toBe('checked_in');
  });

  it('marks each booking once, however often it runs', async () => {
    const missed = await stay('Africa/Cairo', '[2026-10-25,2026-10-26)');

    await auditAt('2026-10-27T01:00:00Z');
    await auditAt('2026-10-27T01:05:00Z');

    expect(await eventsOf(db, missed)).toEqual([
      { fromStatus: 'confirmed', toStatus: 'no_show', actor: 'system' },
    ]);
  });
});
