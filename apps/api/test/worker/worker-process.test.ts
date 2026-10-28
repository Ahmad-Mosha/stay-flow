import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/platform/database/database.js';
import { createTeam } from '../support/access.js';
import { connectTestDatabase, createReservation } from '../support/fixtures.js';
import { SmtpSink } from '../support/smtp-sink.js';
import { buildWorker, waitFor, WorkerProcess } from '../support/worker-process.js';

describe('the worker process', () => {
  const db: Database = connectTestDatabase();
  let sink: SmtpSink;
  const workers: WorkerProcess[] = [];

  beforeAll(async () => {
    await buildWorker();
    sink = await SmtpSink.start();
  }, 120_000);

  afterEach(async (context) => {
    for (const worker of workers.splice(0)) {
      if (context.task.result?.state === 'fail') {
        console.error(worker.logs);
      }
      await worker.stop('SIGKILL');
    }
  });

  afterAll(async () => {
    await sink.close();
    await db.destroy();
  });

  function startWorker(env: Record<string, string>): WorkerProcess {
    const worker = WorkerProcess.start({ SMTP_URL: sink.url, ...env });
    workers.push(worker);
    return worker;
  }

  /** `count` confirmed bookings, each with its confirmation waiting in the outbox. */
  async function pendingConfirmations(count: number): Promise<string[]> {
    const team = await createTeam(db);
    const reservations = await Promise.all(
      Array.from({ length: count }, () =>
        createReservation(db, { ...team, nights: '[2027-02-01,2027-02-03)' }),
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
    return events.map(({ id }) => id).sort();
  }

  async function statesOf(ids: readonly string[]) {
    const rows = await db
      .selectFrom('outboxEvents')
      .select(['id', 'attempts', 'processedAt'])
      .where('id', 'in', ids)
      .orderBy('id')
      .execute();
    return rows.map((row) => ({ attempts: row.attempts, processed: row.processedAt !== null }));
  }

  const messageIds = (ids: readonly string[]) => ids.map((id) => `<${id}@stay-flow>`);

  it('loses no email and sends none twice when killed in the middle of a batch', async () => {
    const ids = await pendingConfirmations(12);
    // Batches of 4: the sixth email is the second of the second batch.
    const held = sink.holdAfter(5);
    const doomed = startWorker({ OUTBOX_BATCH_SIZE: '4', OUTBOX_LEASE_MS: '1000' });

    await held.arrived;
    await doomed.stop('SIGKILL');
    held.release(false);

    expect(sink.emailsWithIds(messageIds(ids))).toHaveLength(5);
    expect(await statesOf(ids)).toEqual([
      ...Array.from({ length: 5 }, () => ({ attempts: 1, processed: true })),
      // Claimed by the dead worker: they come back when its lease runs out.
      ...Array.from({ length: 3 }, () => ({ attempts: 1, processed: false })),
      ...Array.from({ length: 4 }, () => ({ attempts: 0, processed: false })),
    ]);

    startWorker({ OUTBOX_BATCH_SIZE: '4' });
    await waitFor(async () => (await statesOf(ids)).every((state) => state.processed), {
      what: 'every event to be processed',
    });

    const sent = sink.emailsWithIds(messageIds(ids));
    expect(sent.map((email) => email.messageId).sort()).toEqual(messageIds(ids));
  });

  it('finishes the email in hand on SIGTERM, and hands back the rest of its batch', async () => {
    const ids = await pendingConfirmations(3);
    const held = sink.holdAfter(0);
    const worker = startWorker({ OUTBOX_BATCH_SIZE: '10' });
    await held.arrived;

    const stopping = worker.stop('SIGTERM');
    // Shutting down, but still waiting for the mail server.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(worker.exited).toBe(false);
    held.release(true);
    await stopping;

    expect(sink.emailsWithIds(messageIds(ids))).toHaveLength(1);
    expect(await statesOf(ids)).toEqual([
      { attempts: 1, processed: true },
      // Never tried, so free for the next worker at once, and not counted as attempts.
      { attempts: 0, processed: false },
      { attempts: 0, processed: false },
    ]);
  });

  it('logs each delivery under the id of the request that caused it', async () => {
    const { id: reservationId } = await createReservation(db, {
      ...(await createTeam(db)),
      nights: '[2027-02-01,2027-02-03)',
    });
    const { id } = await db
      .insertInto('outboxEvents')
      .values({
        type: 'reservation.confirmed',
        payload: { reservationId },
        requestId: 'booking-trace-0002',
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const worker = startWorker({});

    await waitFor(
      () =>
        Promise.resolve(
          worker.logRecords.some(
            (record) =>
              record.msg === 'Delivered outbox event' &&
              record.eventId === id &&
              record.requestId === 'booking-trace-0002',
          ),
        ),
      { what: 'the delivery to be logged' },
    );
  });
});
