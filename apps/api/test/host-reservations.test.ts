import type { NestExpressApplication } from '@nestjs/platform-express';
import { reservationListResponseSchema } from '@stay-flow/contracts';
import request from 'supertest';
import { Temporal } from 'temporal-polyfill';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../src/platform/database/database.js';
import { createTeam } from './support/access.js';
import { connectTestDatabase, createReservation, createStay } from './support/fixtures.js';
import { createTestApp } from './support/test-app.js';

// Tonight is 27 October 2026 in Cairo.
const now = Temporal.Instant.from('2026-10-27T10:00:00Z');

const inTenMinutes = () => new Date(Date.now() + 600_000);

type Team = Awaited<ReturnType<typeof createTeam>>;

describe('GET /v1/host/properties/:propertyId/reservations', () => {
  const db: Database = connectTestDatabase();
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ now });
  });

  afterAll(async () => {
    await app.close();
    await db.destroy();
  });

  const list = (team: Team, query: Record<string, string | number> = {}) =>
    request(app.getHttpServer())
      .get(`/v1/host/properties/${team.propertyId}/reservations`)
      .set('Cookie', team.frontDesk.cookie)
      .query(query);

  async function idsListed(team: Team, query: Record<string, string> = {}): Promise<string[]> {
    const response = await list(team, query).expect(200);
    return reservationListResponseSchema.parse(response.body).reservations.map(({ id }) => id);
  }

  it('lists reservations newest first, with their room type, room and guest', async () => {
    const team = await createTeam(db);
    const stay = await createStay(db, {
      ...team,
      unitId: team.unitIds[0],
      nights: '[2026-12-01,2026-12-04)',
      guestName: 'Nour Hassan',
      createdAt: '2026-10-20 09:00:00+00',
    });
    const cancelled = await createReservation(db, {
      ...team,
      nights: '[2026-12-10,2026-12-12)',
      status: 'cancelled',
      createdAt: '2026-10-21 09:00:00+00',
    });

    const response = await list(team).expect(200);

    const { reservations, nextCursor } = reservationListResponseSchema.parse(response.body);
    expect(reservations.map(({ id }) => id)).toEqual([cancelled.id, stay.id]);
    expect(reservations[1]).toMatchObject({
      reference: stay.reference,
      status: 'confirmed',
      unitType: { id: team.unitTypeId, name: 'Double' },
      unit: { id: team.unitIds[0], name: '101' },
      checkIn: '2026-12-01',
      checkOut: '2026-12-04',
      nights: 3,
      guest: { name: 'Nour Hassan', email: 'guest@example.com' },
      createdAt: '2026-10-20T09:00:00Z',
    });
    // A cancelled reservation no longer takes a room.
    expect(reservations[0]).toMatchObject({ status: 'cancelled', unit: null });
    expect(nextCursor).toBeNull();
  });

  it('leaves out holds that never became bookings, unless their status is asked for', async () => {
    const team = await createTeam(db);
    const nights = '[2026-12-01,2026-12-03)';
    const [held, expired, released, confirmed, checkedIn] = await Promise.all([
      createReservation(db, { ...team, nights, status: 'held', holdExpiresAt: inTenMinutes() }),
      createReservation(db, { ...team, nights, status: 'expired' }),
      createReservation(db, { ...team, nights, status: 'released' }),
      createReservation(db, { ...team, nights, status: 'confirmed' }),
      createReservation(db, { ...team, nights, status: 'checked_in' }),
    ]);

    const byDefault = await idsListed(team);
    const neverBooked = await idsListed(team, { status: 'expired,released' });
    const confirmedOnly = await idsListed(team, { status: 'confirmed' });

    expect(byDefault.sort()).toEqual([held.id, confirmed.id, checkedIn.id].sort());
    expect(neverBooked.sort()).toEqual([expired.id, released.id].sort());
    expect(confirmedOnly).toEqual([confirmed.id]);
    await list(team, { status: 'confirmed,paid' }).expect(400);
  });

  it('finds the stays with a night from `from` up to, but not including, `to`', async () => {
    const team = await createTeam(db);
    const [early, middle, late] = await Promise.all(
      ['[2026-12-01,2026-12-04)', '[2026-12-04,2026-12-06)', '[2026-12-10,2026-12-12)'].map(
        (nights) => createReservation(db, { ...team, nights }),
      ),
    );

    expect(await idsListed(team, { from: '2026-12-04', to: '2026-12-10' })).toEqual([middle?.id]);
    expect((await idsListed(team, { from: '2026-12-05' })).sort()).toEqual(
      [middle?.id, late?.id].sort(),
    );
    expect(await idsListed(team, { to: '2026-12-04' })).toEqual([early?.id]);
  });

  it("searches by reference and by part of the guest's name or email", async () => {
    const team = await createTeam(db);
    const nights = '[2026-12-01,2026-12-03)';
    const nour = await createReservation(db, { ...team, nights, guestName: 'Nour Hassan' });
    const omar = await createReservation(db, {
      ...team,
      nights,
      guestName: 'Omar Farouk',
      guestEmail: 'omar@example.org',
    });

    expect(await idsListed(team, { q: nour.reference.toLowerCase() })).toEqual([nour.id]);
    expect(await idsListed(team, { q: 'HASS' })).toEqual([nour.id]);
    expect(await idsListed(team, { q: 'example.org' })).toEqual([omar.id]);
    // LIKE wildcards in a search are plain text.
    expect(await idsListed(team, { q: '%' })).toEqual([]);
    expect(await idsListed(team, { q: '_' })).toEqual([]);
  });

  it('pages through every reservation once, even those made in the same millisecond', async () => {
    const team = await createTeam(db);
    // Two pairs made at the same moment, which only the id orders, and three in one millisecond
    // that only microseconds tell apart: a cursor rounded to milliseconds would skip two of them.
    const createdAt = [
      '2026-10-20 09:00:00.5+00',
      '2026-10-20 09:00:00.5+00',
      '2026-10-20 09:00:00.123456+00',
      '2026-10-20 09:00:00.1234+00',
      '2026-10-20 09:00:00.123+00',
      '2026-10-20 09:00:00.1+00',
      '2026-10-20 09:00:00.1+00',
    ];
    for (const at of createdAt) {
      await createReservation(db, { ...team, nights: '[2026-12-01,2026-12-03)', createdAt: at });
    }
    const expected = await db
      .selectFrom('reservations')
      .select('id')
      .where('propertyId', '=', team.propertyId)
      .orderBy('createdAt', 'desc')
      .orderBy('id', 'desc')
      .execute();

    for (const limit of [1, 2, 3]) {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const query: Record<string, string | number> = { limit };
        if (cursor !== null) {
          query.cursor = cursor;
        }
        const page = reservationListResponseSchema.parse(
          (await list(team, query).expect(200)).body,
        );
        expect(page.reservations.length).toBeLessThanOrEqual(limit);
        seen.push(...page.reservations.map(({ id }) => id));
        cursor = page.nextCursor;
      } while (cursor !== null);

      expect(seen).toEqual(expected.map(({ id }) => id));
    }
  });

  it('answers 400 INVALID_CURSOR for a cursor the list did not give out', async () => {
    const team = await createTeam(db);

    const response = await list(team, { cursor: 'eyJpZCI6MX0' }).expect(400);

    expect(response.body).toMatchObject({ code: 'INVALID_CURSOR' });
  });

  it("never shows another property's reservations", async () => {
    const team = await createTeam(db);
    const other = await createTeam(db);
    const theirs = await createReservation(db, { ...other, nights: '[2026-12-01,2026-12-03)' });

    expect(await idsListed(team)).toEqual([]);
    expect(await idsListed(team, { q: theirs.reference })).toEqual([]);
  });
});
