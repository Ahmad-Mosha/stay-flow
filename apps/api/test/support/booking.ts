import { randomUUID } from 'node:crypto';
import { reservationResponseSchema } from '@stay-flow/contracts';
import { sql } from 'kysely';
import request from 'supertest';
import type { Database } from '../../src/platform/database/database.js';

type Target = Parameters<typeof request>[0];

/** A two-guest hold of a "double" for the nights of 16 to 19 December 2026. */
export const decemberHold = {
  unitType: 'double',
  checkIn: '2026-12-16',
  checkOut: '2026-12-20',
  guests: 2,
} as const;

export function placeHold(
  target: Target,
  slug: string,
  body: Record<string, unknown> = {},
  idempotencyKey: string = randomUUID(),
) {
  return request(target)
    .post(`/v1/properties/${slug}/holds`)
    .set('Idempotency-Key', idempotencyKey)
    .send({ ...decemberHold, ...body });
}

export function confirmReservation(
  target: Target,
  id: string,
  idempotencyKey: string = randomUUID(),
  guest: Record<string, unknown> = { guestName: 'Nour Hassan', guestEmail: 'nour@example.com' },
) {
  return request(target)
    .post(`/v1/reservations/${id}/confirm`)
    .set('Idempotency-Key', idempotencyKey)
    .send(guest);
}

export function releaseReservation(target: Target, id: string) {
  return request(target).post(`/v1/reservations/${id}/release`);
}

interface HttpResponse {
  readonly body: unknown;
}

/** The reservation id from a hold or confirm response. */
export function reservationIdOf(response: HttpResponse): string {
  return reservationResponseSchema.parse(response.body).id;
}

/** The stable error `code` from a problem+json response. */
export function errorCodeOf(response: HttpResponse): unknown {
  return (response.body as { code?: unknown }).code;
}

/** Moves a hold's deadline into the past without releasing it, as if ten minutes went by. */
export async function lapseHold(db: Database, id: string): Promise<void> {
  await db
    .updateTable('reservations')
    .set({ holdExpiresAt: sql<Date>`now() - interval '1 second'` })
    .where('id', '=', id)
    .execute();
}

export async function statusOf(db: Database, id: string) {
  const { status } = await db
    .selectFrom('reservations')
    .select('status')
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return status;
}

/** The room a reservation occupies, or undefined once it is released. */
export async function roomOf(db: Database, reservationId: string): Promise<string | undefined> {
  const occupancy = await db
    .selectFrom('occupancies')
    .select('unitId')
    .where('reservationId', '=', reservationId)
    .where('releasedAt', 'is', null)
    .executeTakeFirst();
  return occupancy?.unitId;
}

export async function eventsOf(db: Database, reservationId: string) {
  return db
    .selectFrom('reservationEvents')
    .select(['fromStatus', 'toStatus', 'actor'])
    .where('reservationId', '=', reservationId)
    .orderBy('occurredAt')
    .orderBy('id')
    .execute();
}

export async function reservationCount(db: Database, propertyId: string): Promise<number> {
  const { count } = await db
    .selectFrom('reservations')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('propertyId', '=', propertyId)
    .executeTakeFirstOrThrow();
  return count;
}
