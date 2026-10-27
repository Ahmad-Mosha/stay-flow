import { z } from 'zod';
import { currencySchema, localTimeSchema } from './common.js';

export const stayRulesSchema = z.object({
  minNights: z.int().positive(),
  maxNights: z.int().positive(),
  /** How many days ahead a guest may check in. */
  bookingWindowDays: z.int().positive(),
  /** Free cancellation ends this many hours before check-in. */
  freeCancellationHours: z.int().nonnegative(),
});

export type StayRules = z.infer<typeof stayRulesSchema>;

/** `GET /v1/properties/:slug` */
export const propertyResponseSchema = z.object({
  slug: z.string(),
  name: z.string(),
  /** IANA time zone; every date and deadline of the property is local to it. */
  timeZone: z.string(),
  currency: currencySchema,
  checkInTime: localTimeSchema,
  checkOutTime: localTimeSchema,
  stayRules: stayRulesSchema,
});

export type PropertyResponse = z.infer<typeof propertyResponseSchema>;
