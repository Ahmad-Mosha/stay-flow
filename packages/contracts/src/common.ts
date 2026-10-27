import { z } from 'zod';

/** A calendar date such as `2026-12-01`. Zod rejects days that do not exist, like `2026-02-30`. */
export const isoDateSchema = z.iso.date();

/** A calendar month such as `2026-12`. */
export const yearMonthSchema = z
  .string()
  .regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/, 'Expected a month like 2026-12');

/** A wall-clock time such as `15:00`. */
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

/** Guests sharing one room. */
export const guestsSchema = z.int().min(1).max(20);

/** The same, read from a query string, where every value arrives as text. */
export const guestsQuerySchema = z.coerce.number().pipe(guestsSchema);

/** A URL-safe name such as `garden-double`. */
export const slugSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Expected lowercase words joined by hyphens');

/** An IANA time zone such as `Africa/Cairo`. */
export const timeZoneSchema = z
  .string()
  .regex(/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/, 'Expected a time zone such as Africa/Cairo')
  .refine(isTimeZone, 'Unknown time zone');

function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** An email address, trimmed. */
export const emailSchema = z.string().trim().max(254).pipe(z.email());

/** An amount in the currency's minor unit, such as piastres or cents. */
export const amountMinorSchema = z.int().nonnegative();

/** An ISO 4217 currency code such as `EGP`. */
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);

/** The most nights a block or a rate may cover: two years, like the longest booking window. */
const MAX_SPAN_NIGHTS = 730;

const DAY_MS = 86_400_000;

/**
 * Nights from `from` up to, but not including, `to`, the way a stay runs from check-in to
 * check-out: `{ from: '2026-12-18', to: '2026-12-20' }` is two nights.
 */
export const nightsSchema = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((nights) => nights.to > nights.from, { path: ['to'], message: 'Must be after from' })
  .refine(
    (nights) => (Date.parse(nights.to) - Date.parse(nights.from)) / DAY_MS <= MAX_SPAN_NIGHTS,
    {
      path: ['to'],
      message: `Covers at most ${String(MAX_SPAN_NIGHTS)} nights`,
    },
  );

export type Nights = z.infer<typeof nightsSchema>;

/** A PATCH body must change something. Add it to the schema: `.check(someChange)`. */
export const someChange = z.refine<Record<string, unknown>>(
  (body) => Object.values(body).some((value) => value !== undefined),
  'Send at least one field to change',
);

/** Check-out must follow check-in. Add it to a schema with both dates: `.check(stayDatesInOrder)`. */
export const stayDatesInOrder = z.refine<{ checkIn: string; checkOut: string }>(
  // ISO dates compare correctly as strings.
  (stay) => stay.checkOut > stay.checkIn,
  { path: ['checkOut'], message: 'Must be after checkIn' },
);
