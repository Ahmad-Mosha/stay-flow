import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'kysely';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/platform/database/database.js';
import { MAX_ATTEMPTS } from '../../src/platform/outbox/retry-policy.js';
import { createTeam } from '../support/access.js';
import { confirmReservation, lapseHold, placeHold, reservationIdOf } from '../support/booking.js';
import { connectTestDatabase, createReservation, createStay } from '../support/fixtures.js';
import { SmtpSink } from '../support/smtp-sink.js';
import { createTestApp } from '../support/test-app.js';
import { createTestWorker, type TestWorker } from '../support/test-worker.js';

// 13:00 on 27 October 2026 in Cairo.
const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

describe('the outbox and the emails it sends', () => {
  const db: Database = connectTestDatabase();
  let api: NestExpressApplication;
  let sink: SmtpSink;
  let worker: TestWorker;

  beforeAll(async () => {
    sink = await SmtpSink.start();
    api = await createTestApp({ now });
    worker = await createTestWorker({ smtpUrl: sink.url, now });
  });

  afterAll(async () => {
    await worker.app.close();
    await api.close();
    await sink.close();
    await db.destroy();
  });

  const uniqueEmail = () => `guest-${randomUUID().slice(0, 8)}@example.com`;

  /** Holds and confirms a December stay for a guest with this email. */
  async function book(guestEmail: string): Promise<string> {
    const { slug } = await createTeam(db);
    const id = reservationIdOf(await placeHold(api.getHttpServer(), slug).expect(201));
    await confirmReservation(api.getHttpServer(), id, randomUUID(), {
      guestName: 'Nour Hassan',
      guestEmail,
    }).expect(200);
    return id;
  }

  async function eventsOf(reservationId: string) {
    return db
      .selectFrom('outboxEvents')
      .selectAll()
      .where(sql<string>`payload->>'reservationId'`, '=', reservationId)
      .orderBy('id')
      .execute();
  }

  async function onlyEventOf(reservationId: string) {
    const [event, ...others] = await eventsOf(reservationId);
    expect(others).toEqual([]);
    if (event === undefined) {
      throw new Error(`No outbox event for ${reservationId}`);
    }
    return event;
  }

  /** As if the retry delay had passed. */
  async function makeDue(id: string): Promise<void> {
    await db
      .updateTable('outboxEvents')
      .set({ availableAt: sql<Date>`now()` })
      .where('id', '=', id)
      .execute();
  }

  describe('writing events', () => {
    it('writes one event with the confirmation, in the same transaction', async () => {
      const { slug } = await createTeam(db);
      const id = reservationIdOf(await placeHold(api.getHttpServer(), slug).expect(201));
      const key = randomUUID();

      await confirmReservation(api.getHttpServer(), id, key).expect(200);
      await confirmReservation(api.getHttpServer(), id, key).expect(200);

      expect(await eventsOf(id)).toMatchObject([
        { type: 'reservation.confirmed', payload: { reservationId: id }, attempts: 0 },
      ]);
    });

    it('keeps the id of the request that wrote it, to find the logs of its delivery', async () => {
      const { slug } = await createTeam(db);
      const id = reservationIdOf(await placeHold(api.getHttpServer(), slug).expect(201));

      await confirmReservation(api.getHttpServer(), id)
        .set('X-Request-Id', 'booking-trace-0001')
        .expect(200);

      expect(await onlyEventOf(id)).toMatchObject({ requestId: 'booking-trace-0001' });
    });

    it('writes nothing when the confirmation fails', async () => {
      const { slug } = await createTeam(db);
      const id = reservationIdOf(await placeHold(api.getHttpServer(), slug).expect(201));
      await lapseHold(db, id);

      await confirmReservation(api.getHttpServer(), id).expect(409);

      expect(await eventsOf(id)).toEqual([]);
    });
  });

  describe('delivering', () => {
    it('emails the guest a confirmation whose link opens the booking', async () => {
      const guestEmail = uniqueEmail();
      const id = await book(guestEmail);

      await worker.outbox.drain();

      const event = await onlyEventOf(id);
      expect(event).toMatchObject({ attempts: 1, lastError: null, deadAt: null });
      expect(event.processedAt).not.toBeNull();
      const [email, ...others] = sink.emailsTo(guestEmail);
      expect(others).toEqual([]);
      expect(email).toMatchObject({
        messageId: `<${event.id}@stay-flow>`,
        subject: expect.stringMatching(/^Booking confirmed: Test Guesthouse \(\w{8}\)$/) as string,
      });
      const token = /https:\/\/stayflow\.test\/manage#([\w-]{43})/.exec(email?.text ?? '')?.[1];
      const opened = await request(api.getHttpServer())
        .get('/v1/guest/reservation')
        .set('Authorization', `Bearer ${token ?? ''}`)
        .expect(200);
      expect(opened.body).toMatchObject({ id, status: 'confirmed' });
    });

    it('emails the guest when the property cancels, with the refund', async () => {
      const team = await createTeam(db);
      const guestEmail = uniqueEmail();
      const { id } = await createStay(db, {
        ...team,
        unitId: team.unitIds[0],
        nights: '[2026-10-28,2026-10-30)',
        nightlyRateMinor: 200_000,
        guestEmail,
      });
      await request(api.getHttpServer())
        .post(`/v1/host/properties/${team.propertyId}/reservations/${id}/cancel`)
        .set('Cookie', team.frontDesk.cookie)
        .send({ reason: 'Burst pipe' })
        .expect(200);

      await worker.outbox.drain();

      expect(await onlyEventOf(id)).toMatchObject({
        type: 'reservation.cancelled',
        payload: { reservationId: id, cancelledBy: 'host' },
      });
      const [email] = sink.emailsTo(guestEmail);
      expect(email?.text).toContain('is cancelled by Test Guesthouse.');
      expect(email?.text).toContain('Refund            EGP 2,000.00');
      expect(email?.text).toContain('Cancellation fee  EGP 2,000.00');
    });
  });

  describe('failing', () => {
    it('tries again later when the mail server turns the email away for now', async () => {
      const guestEmail = uniqueEmail();
      sink.refuse(guestEmail, 451);
      const id = await book(guestEmail);

      await worker.outbox.drain();

      const failed = await onlyEventOf(id);
      expect(failed).toMatchObject({ attempts: 1, processedAt: null, deadAt: null });
      expect(failed.lastError).toContain('451');
      // The first retry waits 2.5 to 5 seconds.
      const { waitMs } = await db
        .selectFrom('outboxEvents')
        .select(sql<number>`(extract(epoch from available_at - now()) * 1000)::float8`.as('waitMs'))
        .where('id', '=', failed.id)
        .executeTakeFirstOrThrow();
      expect(waitMs).toBeGreaterThan(2_000);
      expect(waitMs).toBeLessThanOrEqual(5_000);
      expect(sink.emailsTo(guestEmail)).toEqual([]);

      sink.accept(guestEmail);
      await makeDue(failed.id);
      await worker.outbox.drain();

      expect(await onlyEventOf(id)).toMatchObject({ attempts: 2, lastError: null });
      expect(sink.emailsTo(guestEmail)).toHaveLength(1);
    });

    it('gives up at once when the mail server refuses the address for good', async () => {
      const guestEmail = uniqueEmail();
      sink.refuse(guestEmail, 550);
      const id = await book(guestEmail);

      await worker.outbox.drain();

      const dead = await onlyEventOf(id);
      expect(dead).toMatchObject({ attempts: 1, processedAt: null });
      expect(dead.deadAt).not.toBeNull();
      expect(dead.lastError).toMatch(/refused the email/);
    });

    it('gives up after the last attempt', async () => {
      const guestEmail = uniqueEmail();
      sink.refuse(guestEmail, 451);
      const id = await book(guestEmail);
      await db
        .updateTable('outboxEvents')
        .set({ attempts: MAX_ATTEMPTS - 1 })
        .where(sql<string>`payload->>'reservationId'`, '=', id)
        .execute();

      await worker.outbox.drain();

      expect((await onlyEventOf(id)).deadAt).not.toBeNull();
    });

    it('buries an event that no handler knows', async () => {
      const { id } = await db
        .insertInto('outboxEvents')
        .values({ type: 'mystery.event', payload: {} })
        .returning('id')
        .executeTakeFirstOrThrow();

      await worker.outbox.drain();

      const dead = await db
        .selectFrom('outboxEvents')
        .select(['deadAt', 'lastError'])
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      expect(dead.deadAt).not.toBeNull();
      expect(dead.lastError).toBe('No handler for mystery.event events');
    });
  });

  it('sends each email once when two workers drain the outbox at the same time', async () => {
    const other = await createTestWorker({
      smtpUrl: sink.url,
      now,
      env: { OUTBOX_BATCH_SIZE: '5' },
    });
    const team = await createTeam(db);
    const reservations = await Promise.all(
      Array.from({ length: 40 }, (_, night) =>
        createReservation(db, {
          ...team,
          nights: `[2027-01-01,2027-01-03)`,
          guestEmail: `night-${String(night)}@example.com`,
        }),
      ),
    );
    const events = await db
      .insertInto('outboxEvents')
      .values(
        reservations.map(({ id }) => ({
          type: 'reservation.confirmed',
          payload: { reservationId: id },
        })),
      )
      .returning('id')
      .execute();

    try {
      await Promise.all([worker.outbox.drain(), other.outbox.drain()]);
    } finally {
      await other.app.close();
    }

    const sent = sink.emailsWithIds(events.map(({ id }) => `<${id}@stay-flow>`));
    expect(sent).toHaveLength(40);
    expect(new Set(sent.map((email) => email.messageId)).size).toBe(40);
  });

  it('leaves the rest of its batch alone once its lease has run out', async () => {
    const slow = await createTestWorker({
      smtpUrl: sink.url,
      now,
      env: { OUTBOX_LEASE_MS: '100' },
    });
    const team = await createTeam(db);
    const reservations = await Promise.all(
      Array.from({ length: 3 }, () =>
        createReservation(db, { ...team, nights: '[2027-01-10,2027-01-12)' }),
      ),
    );
    const ids = (
      await db
        .insertInto('outboxEvents')
        .values(
          reservations.map(({ id }) => ({
            type: 'reservation.confirmed',
            payload: { reservationId: id },
          })),
        )
        .returning('id')
        .execute()
    )
      .map(({ id }) => id)
      .sort();
    const messageIds = ids.map((id) => `<${id}@stay-flow>`);

    try {
      // The slow worker claims all three, then stalls on the first email past its lease.
      const held = sink.holdAfter(0);
      const stalled = slow.outbox.drain();
      await held.arrived;
      await new Promise((resolve) => setTimeout(resolve, 200));
      // The other worker claims all three again and sends them.
      await worker.outbox.drain();
      held.release(true);
      await stalled;
    } finally {
      await slow.app.close();
    }

    const sent = sink.emailsWithIds(messageIds).map((email) => email.messageId);
    // Only the email in flight when the lease ran out went twice, with the same Message-ID.
    expect(sent.toSorted()).toEqual([messageIds[0], ...messageIds].toSorted());
    const states = await db
      .selectFrom('outboxEvents')
      .select(['attempts', 'processedAt'])
      .where('id', 'in', ids)
      .execute();
    expect(states.every((state) => state.attempts === 2 && state.processedAt !== null)).toBe(true);
  });
});
