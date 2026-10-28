import { randomUUID } from 'node:crypto';
import { Agent, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'kysely';
import { afterAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { decemberHold } from './support/booking.js';
import { deferred } from './support/deferred.js';
import { connectTestDatabase, createInventory } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

interface Reply {
  readonly status: number;
  readonly connection: string | undefined;
}

interface SendOptions {
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  /** Without one, the request opens a connection of its own. */
  readonly agent?: Agent | undefined;
}

/** The API listening on a port, as main.ts runs it, so that connections are real. */
class ListeningApi {
  private constructor(
    readonly app: NestExpressApplication,
    private readonly port: number,
  ) {}

  static async start(env: Record<string, string>): Promise<ListeningApi> {
    const app = await createTestApp({ env });
    await app.listen(0, '127.0.0.1');
    const { port } = app.getHttpServer().address() as AddressInfo;
    return new ListeningApi(app, port);
  }

  send(method: string, path: string, { body, headers = {}, agent }: SendOptions = {}) {
    return new Promise<Reply>((resolve, reject) => {
      const outgoing = request(
        {
          host: '127.0.0.1',
          port: this.port,
          method,
          path,
          agent: agent ?? false,
          headers:
            body === undefined ? headers : { ...headers, 'content-type': 'application/json' },
        },
        (response) => {
          response.resume();
          response.on('end', () => {
            resolve({ status: response.statusCode ?? 0, connection: response.headers.connection });
          });
        },
      );
      outgoing.on('error', reject);
      outgoing.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }

  /** Whether a new connection gets in, or the error that turned it away. */
  async probe(): Promise<string> {
    try {
      await this.send('GET', '/health/live');
      return 'accepted';
    } catch (error) {
      return (error as NodeJS.ErrnoException).code ?? 'failed';
    }
  }
}

describe('graceful shutdown', () => {
  const db: Database = connectTestDatabase();

  afterAll(async () => {
    await db.destroy();
  });

  /**
   * Locks a property's rooms in a transaction of the test's own, so that a booking there waits
   * until `release`.
   */
  async function lockRooms(propertyId: string) {
    const locked = deferred<number>();
    const released = deferred<undefined>();
    const transaction = db.transaction().execute(async (trx) => {
      await trx
        .selectFrom('units')
        .select('id')
        .where('propertyId', '=', propertyId)
        .forUpdate()
        .execute();
      const { pid } = await trx
        .selectNoFrom(sql<number>`pg_backend_pid()`.as('pid'))
        .executeTakeFirstOrThrow();
      locked.resolve(pid);
      await released.promise;
    });
    const holder = await locked.promise;

    return {
      /** Whether a query is waiting for the lock. */
      async waitedOn(): Promise<boolean> {
        const { waiting } = await db
          .selectNoFrom(
            sql<boolean>`exists (
              SELECT FROM pg_stat_activity WHERE ${holder} = ANY (pg_blocking_pids(pid))
            )`.as('waiting'),
          )
          .executeTakeFirstOrThrow();
        return waiting;
      },
      async release(): Promise<void> {
        released.resolve(undefined);
        await transaction;
      },
    };
  }

  /** Starts a booking that waits for the property's rooms until the test releases them. */
  async function startStuckBooking(api: ListeningApi, agent?: Agent) {
    const { propertyId, slug } = await createInventory(db);
    const rooms = await lockRooms(propertyId);
    const booking = api.send('POST', `/v1/properties/${slug}/holds`, {
      body: decemberHold,
      headers: { 'Idempotency-Key': randomUUID() },
      agent,
    });
    // Handled before the test moves on, as a rejection may come before anyone awaits it.
    booking.catch(() => undefined);
    await expect.poll(() => rooms.waitedOn(), { timeout: 5_000 }).toBe(true);
    return { booking, rooms };
  }

  it('stops reporting ready, then finishes the requests in flight before it closes', async () => {
    const api = await ListeningApi.start({ SHUTDOWN_DRAIN_DELAY_MS: '1000' });
    const keepAlive = new Agent({ keepAlive: true });
    const { booking, rooms } = await startStuckBooking(api, keepAlive);

    let closed = false;
    const closing = api.app.close().then(() => {
      closed = true;
    });

    // Draining: the load balancer learns to stop sending traffic, which is still served.
    await expect
      .poll(async () => (await api.send('GET', '/health/ready')).status, { timeout: 5_000 })
      .toBe(503);
    expect((await api.send('GET', '/health/live')).status).toBe(200);
    // Then the server takes no new connections, but waits for the booking.
    await expect.poll(() => api.probe(), { timeout: 5_000 }).toBe('ECONNREFUSED');
    expect(closed).toBe(false);

    await rooms.release();

    // The booking succeeds, and its connection closes after it rather than being kept alive.
    expect(await booking).toEqual({ status: 201, connection: 'close' });
    await closing;
    keepAlive.destroy();
  });

  it('cuts off a request that runs past the shutdown timeout', async () => {
    const api = await ListeningApi.start({ SHUTDOWN_TIMEOUT_MS: '200' });
    const { booking, rooms } = await startStuckBooking(api);

    const closing = api.app.close();

    await expect(booking).rejects.toMatchObject({ code: 'ECONNRESET' });
    await rooms.release();
    await closing;
  });
});
