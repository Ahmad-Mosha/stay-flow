import { z } from 'zod';
import type { NewOutboxEvent } from '../../platform/outbox/outbox-event.js';
import type { Actor } from './reservation.js';

/** The outbox events this module writes, for the emails the worker sends. */
export const RESERVATION_CONFIRMED = 'reservation.confirmed';
export const RESERVATION_CANCELLED = 'reservation.cancelled';

export const reservationConfirmedSchema = z.object({ reservationId: z.uuid() });

export const reservationCancelledSchema = z.object({
  reservationId: z.uuid(),
  cancelledBy: z.enum(['guest', 'host', 'system']),
});

export function reservationConfirmed(reservationId: string): NewOutboxEvent {
  return { type: RESERVATION_CONFIRMED, payload: { reservationId } };
}

export function reservationCancelled(reservationId: string, cancelledBy: Actor): NewOutboxEvent {
  return { type: RESERVATION_CANCELLED, payload: { reservationId, cancelledBy } };
}
