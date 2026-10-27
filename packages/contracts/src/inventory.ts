import { z } from 'zod';
import { amountMinorSchema, guestsSchema, nightsSchema, slugSchema, someChange } from './common.js';

const unitTypeNameSchema = z.string().trim().min(1).max(120);
const descriptionSchema = z.string().trim().max(2000);
const unitNameSchema = z.string().trim().min(1).max(40);

/** `POST /v1/host/properties/:propertyId/unit-types` */
export const createUnitTypeRequestSchema = z.object({
  /** Part of the guest-facing booking request, so it cannot change later. */
  slug: slugSchema,
  name: unitTypeNameSchema,
  description: descriptionSchema.default(''),
  maxGuests: guestsSchema,
  /** The nightly rate on nights that no rate override covers. */
  baseRateMinor: amountMinorSchema,
});

export type CreateUnitTypeRequest = z.infer<typeof createUnitTypeRequestSchema>;

/** `PATCH /v1/host/properties/:propertyId/unit-types/:unitTypeId` */
export const updateUnitTypeRequestSchema = z
  .object({
    name: unitTypeNameSchema,
    description: descriptionSchema,
    maxGuests: guestsSchema,
    baseRateMinor: amountMinorSchema,
  })
  .partial()
  .check(someChange);

export type UpdateUnitTypeRequest = z.infer<typeof updateUnitTypeRequestSchema>;

/** A room type as staff see it, with its rooms. */
export const hostUnitTypeResponseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  maxGuests: z.int(),
  baseRateMinor: amountMinorSchema,
  units: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export type HostUnitTypeResponse = z.infer<typeof hostUnitTypeResponseSchema>;

/** `GET /v1/host/properties/:propertyId/unit-types` */
export const hostUnitTypeListResponseSchema = z.object({
  unitTypes: z.array(hostUnitTypeResponseSchema),
});

export type HostUnitTypeListResponse = z.infer<typeof hostUnitTypeListResponseSchema>;

/** `POST /v1/host/properties/:propertyId/units` */
export const createUnitRequestSchema = z.object({
  unitTypeId: z.uuid(),
  /** What staff call the room, such as `101` or `Garden Suite`. */
  name: unitNameSchema,
});

export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;

/** `PATCH /v1/host/properties/:propertyId/units/:unitId` */
export const updateUnitRequestSchema = z.object({ name: unitNameSchema });

export type UpdateUnitRequest = z.infer<typeof updateUnitRequestSchema>;

export const unitResponseSchema = z.object({
  id: z.uuid(),
  unitTypeId: z.uuid(),
  name: z.string(),
});

export type UnitResponse = z.infer<typeof unitResponseSchema>;

/** `POST /v1/host/properties/:propertyId/rate-overrides`: another nightly rate for some nights. */
export const createRateOverrideRequestSchema = z.object({
  unitTypeId: z.uuid(),
  nights: nightsSchema,
  rateMinor: amountMinorSchema,
  /** What the rate is for, such as `Winter holidays`. */
  label: z.string().trim().min(1).max(80),
});

export type CreateRateOverrideRequest = z.infer<typeof createRateOverrideRequestSchema>;

export const rateOverrideResponseSchema = z.object({
  id: z.uuid(),
  unitTypeId: z.uuid(),
  nights: nightsSchema,
  rateMinor: amountMinorSchema,
  label: z.string(),
});

export type RateOverrideResponse = z.infer<typeof rateOverrideResponseSchema>;

/** `GET /v1/host/properties/:propertyId/rate-overrides`: the ones not over yet. */
export const rateOverrideListResponseSchema = z.object({
  rateOverrides: z.array(rateOverrideResponseSchema),
});

export type RateOverrideListResponse = z.infer<typeof rateOverrideListResponseSchema>;

/** `POST /v1/host/properties/:propertyId/blocks`: takes a room out of service for some nights. */
export const createBlockRequestSchema = z.object({
  unitId: z.uuid(),
  nights: nightsSchema,
  /** Why the room is closed, such as `Repainting`. */
  reason: z.string().trim().min(1).max(200),
});

export type CreateBlockRequest = z.infer<typeof createBlockRequestSchema>;

export const blockResponseSchema = z.object({
  id: z.uuid(),
  unitId: z.uuid(),
  nights: nightsSchema,
  reason: z.string(),
});

export type BlockResponse = z.infer<typeof blockResponseSchema>;
