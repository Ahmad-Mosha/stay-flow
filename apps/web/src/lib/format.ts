import { DateFormatter, parseDate, type CalendarDate } from '@internationalized/date';

/** One locale for the whole app, so the server and the browser render the same text. */
export const locale = 'en-GB';

const formatters = {
  short: new DateFormatter(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }),
  dayMonth: new DateFormatter(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }),
  long: new DateFormatter(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }),
  weekday: new DateFormatter(locale, { weekday: 'short', timeZone: 'UTC' }),
  weekdayLong: new DateFormatter(locale, { weekday: 'long', timeZone: 'UTC' }),
  dayShortMonth: new DateFormatter(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }),
  monthYear: new DateFormatter(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  month: new DateFormatter(locale, { month: 'long', timeZone: 'UTC' }),
};

export type DateStyle = keyof typeof formatters;

/** Formats a calendar date such as `2026-12-16`. Dates have no time zone, so they never shift. */
export function formatDate(date: string | CalendarDate, style: DateStyle = 'short'): string {
  const value = typeof date === 'string' ? parseDate(date) : date;
  return formatters[style].format(value.toDate('UTC'));
}

/** "16 to 20 December", or "28 December to 3 January" across months. */
export function formatStay(checkIn: string, checkOut: string): string {
  const start = parseDate(checkIn);
  const end = parseDate(checkOut);
  const startText = start.month === end.month ? String(start.day) : formatDate(start, 'dayMonth');
  return `${startText} to ${formatDate(end, 'dayMonth')}`;
}

/** "16–19 Dec", or "28 Dec–3 Jan" across months. */
export function formatDayRange(first: string, last: string): string {
  const start = parseDate(first);
  const end = parseDate(last);
  const startText =
    start.month === end.month ? String(start.day) : formatDate(start, 'dayShortMonth');
  return `${startText}–${formatDate(end, 'dayShortMonth')}`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString(locale)} ${count === 1 ? one : many}`;
}

const fractionDigits = new Map<string, number>();

function digitsOf(currency: string): number {
  let digits = fractionDigits.get(currency);
  if (digits === undefined) {
    digits =
      new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    fractionDigits.set(currency, digits);
  }
  return digits;
}

/** An amount in minor units as people read it: 1100000 EGP is "11,000". */
export function formatAmount(minor: number, currency: string): string {
  const digits = digitsOf(currency);
  const value = minor / 10 ** digits;
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: Number.isInteger(value) ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatMoney(minor: number, currency: string): string {
  return `${formatAmount(minor, currency)} ${currency}`;
}

/** "14:52", on the property's clock. */
export function formatTime(instant: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(instant),
  );
}

/** "Mon 14 Dec, 14:00", on the property's clock. */
export function formatDateTime(instant: string | number | Date, timeZone: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(instant));
}

/** "Cairo", from `Africa/Cairo`. */
export function zoneCity(timeZone: string): string {
  return (timeZone.split('/').at(-1) ?? timeZone).replaceAll('_', ' ');
}

/** "Cairo time", from `Africa/Cairo`. */
export function zoneLabel(timeZone: string): string {
  return `${zoneCity(timeZone)} time`;
}
