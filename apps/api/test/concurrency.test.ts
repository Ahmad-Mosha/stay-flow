import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { guestReservationResponseSchema } from '@stay-flow/contracts';
import { sql } from 'kysely';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GuestReservationsService } from '../src/modules/reservations/guest-reservations.service.js';
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
import { createTeam } from './support/access.js';
import { connectTestDatabase, createInventory, createStay, occupy } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// 01:30 on 28 October in Cairo, so a stay from the 28th is due today.
const now = Temporal.Instant.from('2026-10-27T22:30:00Z');

/** How many times each race runs. The plan's acceptance run uses CONCURRENCY_RUNS=100. */
const RUNS = Number(process.env.CONCURRENCY_RUNS ?? 20);

const guest = { name: 'Nour Hassan', email: 'nour@example.com' };

/** Up to this late, a host block splits the wins about evenly with a guest hold it races. */
const BLOCK_DELAY_MS = 10;

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

  async function activeOccupancies(unitId: string): Promise<number> {
    const { count } = await db
      .selectFrom('occupancies')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('unitId', '=', unitId)
      .where('releasedAt', 'is', null)
      .executeTakeFirstOrThrow();
    return count;
  }

  type Team = Awaited<ReturnType<typeof createTeam>>;

  /** A host step on a reservation, sent by the front desk. */
  function takeStep(team: Team, id: string, step: 'check-in' | 'cancel') {
    return request(url)
      .post(`/v1/host/properties/${team.propertyId}/reservations/${id}/${step}`)
      .set('Cookie', team.frontDesk.cookie)
      .send(step === 'cancel' ? { reason: 'Guest called' } : {});
  }

  /** A team with a guest due today in its first room. */
  async function arrivingToday(): Promise<{ team: Team; id: string }> {
    const team = await createTeam(db);
    const { id } = await createStay(db, {
      ...team,
      unitId: team.unitIds[0],
      nights: '[2026-10-28,2026-10-30)',
    });
    return { team, id };
  }

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

  it('gives a room a lapsed hold still keeps to exactly one of 50 simultaneous holds', async () => {
    for (let run = 0; run < RUNS; run++) {
      const { slug, propertyId, unitIds } = await createInventory(db);
      const [lastRoom, blockedRoom] = unitIds;
      await occupy(db, {
        propertyId,
        unitId: blockedRoom,
        nights: '[2026-12-01,2026-12-31)',
        blockReason: 'Repairs',
      });
      const lapsed = reservationIdOf(await placeHold(url, slug).expect(201));
      await lapseSoon(lapsed, -1_000);

      const responses = await Promise.all(Array.from({ length: 50 }, () => placeHold(url, slug)));

      expect(responses.map((response) => response.status).toSorted()).toEqual([
        201,
        ...Array<number>(49).fill(409),
      ]);
      for (const id of responses.filter((r) => r.status === 201).map(reservationIdOf)) {
        expect(await roomOf(db, id)).toBe(lastRoom);
      }
      expect(await statusOf(db, lapsed)).toBe('expired');
    }
  });

  it('lets either a host block or a guest hold have the last room, never both', async () => {
    const winners = { hold: 0, block: 0 };
    for (let run = 0; run < RUNS; run++) {
      const team = await createTeam(db);
      const [lastRoom, closedRoom] = team.unitIds;
      await occupy(db, {
        propertyId: team.propertyId,
        unitId: closedRoom,
        nights: '[2026-12-01,2026-12-31)',
        blockReason: 'Closed for the season',
      });

      // A hold does more work before it takes the room, so the block starts a little later.
      const [hold, block] = await Promise.all([
        placeHold(url, team.slug),
        sleep(randomInt(BLOCK_DELAY_MS)).then(() =>
          request(url)
            .post(`/v1/host/properties/${team.propertyId}/blocks`)
            .set('Cookie', team.frontDesk.cookie)
            .send({
              unitId: lastRoom,
              nights: { from: '2026-12-16', to: '2026-12-20' },
              reason: 'Leak',
            }),
        ),
      ]);

      if (hold.status === 201) {
        expect(block.body).toMatchObject({ status: 409, code: 'UNIT_TAKEN' });
        winners.hold++;
      } else {
        expect(hold.body).toMatchObject({ status: 409, code: 'SOLD_OUT' });
        expect(block.status).toBe(201);
        winners.block++;
      }
      expect(await activeOccupancies(lastRoom)).toBe(1);
    }
    expect(winners.hold + winners.block).toBe(RUNS);
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

  it('lets either check-in or cancellation happen to a guest, never both', async () => {
    const winners = { checkIn: 0, cancel: 0 };
    for (let run = 0; run < RUNS; run++) {
      const { team, id } = await arrivingToday();

      const [checkIn, cancel] = await Promise.all([
        sleep(randomInt(10)).then(() => takeStep(team, id, 'check-in')),
        sleep(randomInt(10)).then(() => takeStep(team, id, 'cancel')),
      ]);

      const [won, lost] = checkIn.status === 200 ? [checkIn, cancel] : [cancel, checkIn];
      expect(won.status).toBe(200);
      expect(lost.body).toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
      if (won === checkIn) {
        expect(await statusOf(db, id)).toBe('checked_in');
        expect(await roomOf(db, id)).toBe(team.unitIds[0]);
        winners.checkIn++;
      } else {
        expect(await statusOf(db, id)).toBe('cancelled');
        expect(await roomOf(db, id)).toBeUndefined();
        winners.cancel++;
      }
      expect(await eventsOf(db, id)).toHaveLength(1);
    }
    expect(winners.checkIn + winners.cancel).toBe(RUNS);
  });

  it('checks a guest in once when two staff do it at the same time', async () => {
    for (let run = 0; run < RUNS; run++) {
      const { team, id } = await arrivingToday();

      const responses = await Promise.all([
        takeStep(team, id, 'check-in'),
        takeStep(team, id, 'check-in'),
      ]);

      for (const response of responses) {
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ status: 'checked_in' });
      }
      expect(await eventsOf(db, id)).toHaveLength(1);
    }
  });

  it('lets either the guest cancel or the front desk check them in, never both', async () => {
    const winners = { guest: 0, host: 0 };
    for (let run = 0; run < RUNS; run++) {
      const { team, id } = await arrivingToday();
      const { token } = await app.get(GuestReservationsService).issueLink(id);
      const asGuest = (path: string) =>
        request(url).post(`/v1/guest/reservation${path}`).set('Authorization', `Bearer ${token}`);
      const { refund } = guestReservationResponseSchema.parse(
        (await request(url).get('/v1/guest/reservation').set('Authorization', `Bearer ${token}`))
          .body,
      );

      const [cancel, checkIn] = await Promise.all([
        sleep(randomInt(10)).then(() =>
          asGuest('/cancel').send({ expectedRefundMinor: refund?.refundMinor }),
        ),
        sleep(randomInt(10)).then(() => takeStep(team, id, 'check-in')),
      ]);

      const lost = cancel.status === 200 ? checkIn : cancel;
      expect(lost.body).toMatchObject({ status: 409, code: 'INVALID_TRANSITION' });
      if (cancel.status === 200) {
        expect(await statusOf(db, id)).toBe('cancelled');
        winners.guest++;
      } else {
        expect(checkIn.status).toBe(200);
        expect(await statusOf(db, id)).toBe('checked_in');
        winners.host++;
      }
      expect(await eventsOf(db, id)).toHaveLength(1);
    }
    expect(winners.guest + winners.host).toBe(RUNS);
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
