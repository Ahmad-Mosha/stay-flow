import type { Temporal } from 'temporal-polyfill';

const LOCALE = 'en-GB';

/** Such as `EGP 2,400.00`, from an amount in minor units. */
export function formatMoney(amountMinor: number, currency: string): string {
  const format = new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  // Intl puts a no-break space after the code; a plain one reads the same in every mail client.
  return format.format(amountMinor / 10 ** digits).replace(/\u00a0/g, ' ');
}

/** Such as `Fri, 30 Oct 2026`. */
export function formatDate(date: Temporal.PlainDate): string {
  return date.toLocaleString(LOCALE, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Such as `Wed, 28 Oct 2026, 16:00`, on the clock of `timeZone`. */
export function formatDateTime(instant: Temporal.Instant, timeZone: string): string {
  const local = instant.toZonedDateTimeISO(timeZone);
  return `${formatDate(local.toPlainDate())}, ${local.toPlainTime().toString({ smallestUnit: 'minute' })}`;
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Makes text safe to put inside HTML, such as a guest name like `<script>`. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}
