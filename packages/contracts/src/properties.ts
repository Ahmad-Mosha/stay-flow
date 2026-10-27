import { z } from 'zod';
import {
  currencySchema,
  localTimeSchema,
  slugSchema,
  someChange,
  timeZoneSchema,
} from './common.js';

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

/** What a member may do at a property; see the API's access policy. */
export const propertyRoleSchema = z.enum(['owner', 'manager', 'front_desk']);

export type PropertyRole = z.infer<typeof propertyRoleSchema>;

const propertyNameSchema = z.string().trim().min(1).max(120);

/** `POST /v1/host/properties`. The creator becomes its owner. */
export const createPropertyRequestSchema = z.object({
  slug: slugSchema,
  name: propertyNameSchema,
  timeZone: timeZoneSchema,
  currency: currencySchema,
});

export type CreatePropertyRequest = z.infer<typeof createPropertyRequestSchema>;

/** A property as its staff see it: `GET /v1/host/properties/:propertyId` */
export const hostPropertyResponseSchema = propertyResponseSchema.extend({
  id: z.uuid(),
  /** The signed-in user's role at this property. */
  role: propertyRoleSchema,
});

export type HostPropertyResponse = z.infer<typeof hostPropertyResponseSchema>;

/** `GET /v1/host/properties`: the properties the signed-in user works at. */
export const hostPropertyListResponseSchema = z.object({
  properties: z.array(
    z.object({
      id: z.uuid(),
      slug: z.string(),
      name: z.string(),
      role: propertyRoleSchema,
    }),
  ),
});

export type HostPropertyListResponse = z.infer<typeof hostPropertyListResponseSchema>;

/**
 * `PATCH /v1/host/properties/:propertyId`. Bookings already made keep the terms they were made
 * under. The time zone and the currency never change, because every date and price depends on them.
 */
export const updatePropertyRequestSchema = z
  .object({
    name: propertyNameSchema.optional(),
    checkInTime: localTimeSchema.optional(),
    checkOutTime: localTimeSchema.optional(),
    stayRules: z
      .object({
        minNights: z.int().min(1).max(365),
        maxNights: z.int().min(1).max(365),
        bookingWindowDays: z.int().min(1).max(730),
        freeCancellationHours: z.int().min(0).max(720),
      })
      .partial()
      .refine(
        (rules) =>
          rules.minNights === undefined ||
          rules.maxNights === undefined ||
          rules.maxNights >= rules.minNights,
        { path: ['maxNights'], message: 'Must be at least minNights' },
      )
      .check(someChange)
      .optional(),
  })
  .check(someChange);

export type UpdatePropertyRequest = z.infer<typeof updatePropertyRequestSchema>;
