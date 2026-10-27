import { z } from 'zod';

/** A calendar date such as `2026-12-01`. Zod rejects days that do not exist, like `2026-02-30`. */
export const isoDateSchema = z.iso.date();

/** A calendar month such as `2026-12`. */
export const yearMonthSchema = z
  .string()
  .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, 'Expected a month like 2026-12');

/** A wall-clock time such as `15:00`. */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

/** Guests sharing one room. Coerced, because query strings arrive as text. */
export const guestsSchema = z.coerce.number().int().min(1).max(20);

/** An amount in the currency's minor unit, such as piastres or cents. */
export const amountMinorSchema = z.int().nonnegative();

/** An ISO 4217 currency code such as `EGP`. */
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
