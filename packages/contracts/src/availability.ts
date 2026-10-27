import { z } from 'zod';
import {
  amountMinorSchema,
  currencySchema,
  guestsSchema,
  isoDateSchema,
  yearMonthSchema,
} from './common.js';

/** `GET /v1/properties/:slug/availability` */
export const availabilityQuerySchema = z
  .object({
    checkIn: isoDateSchema,
    checkOut: isoDateSchema,
    guests: guestsSchema,
  })
  // ISO dates compare correctly as strings.
  .refine((query) => query.checkOut > query.checkIn, {
    path: ['checkOut'],
    message: 'Must be after checkIn',
  });

export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export const nightlyRateSchema = z.object({
  date: isoDateSchema,
  rateMinor: amountMinorSchema,
});

export const unitTypeAvailabilitySchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  maxGuests: z.int().positive(),
  /** Rooms of this type free for every night of the stay; 0 means sold out. */
  freeUnits: z.int().nonnegative(),
  nightlyRates: z.array(nightlyRateSchema),
  totalMinor: amountMinorSchema,
});

export const availabilityResponseSchema = z.object({
  checkIn: isoDateSchema,
  checkOut: isoDateSchema,
  nights: z.int().positive(),
  guests: z.int().positive(),
  currency: currencySchema,
  /** Room types that fit the guests, cheapest first. */
  unitTypes: z.array(unitTypeAvailabilitySchema),
});

export type AvailabilityResponse = z.infer<typeof availabilityResponseSchema>;

/** `GET /v1/properties/:slug/availability/calendar` */
export const availabilityCalendarQuerySchema = z.object({
  month: yearMonthSchema,
  guests: guestsSchema,
});

export type AvailabilityCalendarQuery = z.infer<typeof availabilityCalendarQuerySchema>;

/** The night that starts on `date`. */
export const calendarNightSchema = z.object({
  date: isoDateSchema,
  /** At least one room that fits the guests is free that night, and the night is not past. */
  available: z.boolean(),
  /** The lowest nightly rate among the free rooms, or null when none is free. */
  fromRateMinor: amountMinorSchema.nullable(),
});

export const availabilityCalendarResponseSchema = z.object({
  month: yearMonthSchema,
  currency: currencySchema,
  /** The first and last check-in dates the stay rules allow today, both included. */
  checkInWindow: z.object({ earliest: isoDateSchema, latest: isoDateSchema }),
  nights: z.array(calendarNightSchema),
});

export type AvailabilityCalendarResponse = z.infer<typeof availabilityCalendarResponseSchema>;
