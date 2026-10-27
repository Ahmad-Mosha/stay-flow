import { z } from 'zod';
import { nightlyRateSchema } from './availability.js';
import {
  amountMinorSchema,
  currencySchema,
  emailSchema,
  guestsSchema,
  isoDateSchema,
  localTimeSchema,
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
  guestEmail: emailSchema,
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

/** The terms a guest booked under. The booking keeps them even if the property changes its own. */
export const bookingPolicySchema = z.object({
  freeCancellationHours: z.int().nonnegative(),
  checkInTime: localTimeSchema,
  checkOutTime: localTimeSchema,
});

/**
 * What a cancellation pays back. While a booking is confirmed, what cancelling now would refund;
 * once it is cancelled, what was refunded.
 */
export const refundSchema = z.object({
  /** Cancelling before this moment refunds everything. */
  freeUntil: z.iso.datetime(),
  refundMinor: amountMinorSchema,
  feeMinor: amountMinorSchema,
});

export type RefundResponse = z.infer<typeof refundSchema>;

/**
 * `GET /v1/guest/reservation`: the booking a manage-booking link opens. The link's token goes in
 * an `Authorization: Bearer` header.
 */
export const guestReservationResponseSchema = reservationResponseSchema.extend({
  property: z.object({ slug: z.string(), name: z.string() }),
  policy: bookingPolicySchema,
  /** What cancelling now would refund, or what was refunded. Null for other statuses. */
  refund: refundSchema.nullable(),
});

export type GuestReservationResponse = z.infer<typeof guestReservationResponseSchema>;

/** `POST /v1/guest/reservation/cancel`, with the link's token. */
export const guestCancelRequestSchema = z.object({
  /**
   * The refund the guest was shown. If cancelling now would refund a different amount, as when
   * the free-cancellation deadline passed in between, nothing is cancelled.
   */
  expectedRefundMinor: amountMinorSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

export type GuestCancelRequest = z.infer<typeof guestCancelRequestSchema>;
