import { z } from 'zod';
import {
  amountMinorSchema,
  currencySchema,
  isoDateSchema,
  nightsSchema,
  nightsUpTo,
  yearMonthSchema,
} from './common.js';
import { nightlyRateSchema } from './availability.js';
import { bookingPolicySchema, refundSchema, reservationStatusSchema } from './reservations.js';

const roomSchema = z.object({ id: z.uuid(), name: z.string() });

/** A reservation as staff see it: in the list, on the room calendar and on Today. */
export const hostReservationResponseSchema = z.object({
  id: z.uuid(),
  reference: z.string(),
  status: reservationStatusSchema,
  unitType: z.object({ id: z.uuid(), name: z.string() }),
  /** The room it takes, or null once it takes none, as after a cancellation. */
  unit: roomSchema.nullable(),
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  nights: z.int().positive(),
  guests: z.int().positive(),
  /** Null until the guest confirms. */
  guest: z.object({ name: z.string(), email: z.string() }).nullable(),
  currency: currencySchema,
  totalMinor: amountMinorSchema,
  /** When the hold lapses; null once the reservation is no longer held. */
  holdExpiresAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export type HostReservationResponse = z.infer<typeof hostReservationResponseSchema>;

/** One step in a reservation's history. */
export const reservationEventResponseSchema = z.object({
  fromStatus: reservationStatusSchema.nullable(),
  toStatus: reservationStatusSchema,
  actor: z.enum(['guest', 'host', 'system']),
  /** The staff member, for a change the host made. */
  userId: z.uuid().nullable(),
  note: z.string().nullable(),
  occurredAt: z.iso.datetime(),
});

export type ReservationEventResponse = z.infer<typeof reservationEventResponseSchema>;

/**
 * `GET /v1/host/properties/:propertyId/reservations/:reservationId`, and the answer to every
 * action on it: check-in, check-out, no-show and cancel.
 */
export const hostReservationDetailResponseSchema = hostReservationResponseSchema.extend({
  nightlyRates: z.array(nightlyRateSchema),
  policy: bookingPolicySchema,
  refund: refundSchema.nullable(),
  /** Oldest first. */
  events: z.array(reservationEventResponseSchema),
});

export type HostReservationDetailResponse = z.infer<typeof hostReservationDetailResponseSchema>;

/** `POST /v1/host/properties/:propertyId/reservations/:reservationId/cancel` */
export const hostCancelRequestSchema = z.object({
  /** Why, for the booking's history, such as `Guest called: flight cancelled`. */
  reason: z.string().trim().min(1).max(500),
  /** Refund everything whatever the policy says, as when the property cancels. */
  waiveFee: z.boolean().default(false),
});

export type HostCancelRequest = z.infer<typeof hostCancelRequestSchema>;

const countSchema = z.int().nonnegative();

/** `GET /v1/host/properties/:propertyId/reservations`, newest first. */
export const reservationListQuerySchema = z
  .object({
    /**
     * Comma-separated, such as `confirmed,checked_in`. Without it, every status but `expired`
     * and `released`: holds that never became bookings.
     */
    status: z
      .string()
      .transform((value) => value.split(','))
      .pipe(z.array(reservationStatusSchema))
      .optional(),
    /** Only stays with a night on or after this date. */
    from: isoDateSchema.optional(),
    /** Only stays with a night before this date. */
    to: isoDateSchema.optional(),
    /** A reference, or part of the guest's name or email. */
    q: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce.number().pipe(z.int().min(1).max(100)).default(25),
    /** The `nextCursor` of the page before. */
    cursor: z.string().max(200).optional(),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.to > query.from, {
    path: ['to'],
    message: 'Must be after from',
  });

export type ReservationListQuery = z.infer<typeof reservationListQuerySchema>;

export const reservationListResponseSchema = z.object({
  reservations: z.array(hostReservationResponseSchema),
  /** Pass it as `cursor` to get the next page. Null on the last page. */
  nextCursor: z.string().nullable(),
});

export type ReservationListResponse = z.infer<typeof reservationListResponseSchema>;

/** The most nights the room calendar shows at once: about two months. */
const MAX_CALENDAR_NIGHTS = 62;

/** `GET /v1/host/properties/:propertyId/calendar?from=2026-12-01&to=2026-12-15` */
export const roomCalendarQuerySchema = nightsUpTo(MAX_CALENDAR_NIGHTS);

export type RoomCalendarQuery = z.infer<typeof roomCalendarQuerySchema>;

/** A stay or a block on a room's row. Its nights can run past either edge of the calendar. */
export const calendarBarSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('stay'),
    nights: nightsSchema,
    reservation: hostReservationResponseSchema,
  }),
  z.object({ kind: z.literal('block'), id: z.uuid(), nights: nightsSchema, reason: z.string() }),
]);

export type CalendarBarResponse = z.infer<typeof calendarBarSchema>;

export const roomCalendarResponseSchema = z.object({
  nights: nightsSchema,
  unitTypes: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      units: z.array(roomSchema.extend({ bars: z.array(calendarBarSchema) })),
    }),
  ),
});

export type RoomCalendarResponse = z.infer<typeof roomCalendarResponseSchema>;

/** `GET /v1/host/properties/:propertyId/today`: the day at the front desk, in the property's time zone. */
export const todayResponseSchema = z.object({
  date: isoDateSchema,
  /** Guests due to check in today, and those who already did or did not come. */
  arrivals: z.array(hostReservationResponseSchema),
  /** Guests due to check out today, and those who already did. */
  departures: z.array(hostReservationResponseSchema),
  /** Guests checked in right now. */
  inHouse: z.array(hostReservationResponseSchema),
  /** Every room tonight is sold, held, blocked or free. */
  tonight: z.object({
    rooms: countSchema,
    sold: countSchema,
    held: countSchema,
    blocked: countSchema,
    free: countSchema,
  }),
  /** The nights this month that are booked, and what they earn at their booked prices. */
  thisMonth: z.object({
    month: yearMonthSchema,
    nightsSold: countSchema,
    currency: currencySchema,
    revenueMinor: amountMinorSchema,
  }),
});

export type TodayResponse = z.infer<typeof todayResponseSchema>;
