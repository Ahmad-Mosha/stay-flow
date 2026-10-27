import { z } from 'zod';
import { nightlyRateSchema } from './availability.js';
import {
  amountMinorSchema,
  currencySchema,
  guestsSchema,
  isoDateSchema,
  slugSchema,
  stayDatesInOrder,
} from './common.js';

/** `POST /v1/properties/:slug/holds`, with an `Idempotency-Key` header. */
export const placeHoldRequestSchema = z
  .object({
    unitType: slugSchema,
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    guests: guestsSchema,
  })
  .check(stayDatesInOrder);

export type PlaceHoldRequest = z.infer<typeof placeHoldRequestSchema>;

/** `POST /v1/reservations/:id/confirm`, with an `Idempotency-Key` header. */
export const confirmReservationRequestSchema = z.object({
  guestName: z.string().trim().min(1).max(200),
  guestEmail: z.string().trim().max(254).pipe(z.email()),
});

export type ConfirmReservationRequest = z.infer<typeof confirmReservationRequestSchema>;

export const reservationStatusSchema = z.enum([
  'held',
  'confirmed',
  'checked_in',
  'checked_out',
  'expired',
  'released',
  'cancelled',
  'no_show',
]);

export type ReservationStatus = z.infer<typeof reservationStatusSchema>;

export const reservationResponseSchema = z.object({
  id: z.uuid(),
  /** Short code the guest quotes at the front desk. */
  reference: z.string(),
  status: reservationStatusSchema,
  unitType: z.object({ slug: z.string(), name: z.string() }),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  nights: z.int().positive(),
  guests: z.int().positive(),
  currency: currencySchema,
  /** Prices as they were when the room was held. */
  nightlyRates: z.array(nightlyRateSchema),
  totalMinor: amountMinorSchema,
  /** When the hold lapses unless confirmed; null once the reservation is no longer held. */
  holdExpiresAt: z.iso.datetime().nullable(),
  /** Null until the guest confirms. */
  guest: z.object({ name: z.string(), email: z.string() }).nullable(),
});

export type ReservationResponse = z.infer<typeof reservationResponseSchema>;
