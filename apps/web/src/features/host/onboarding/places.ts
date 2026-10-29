import { useSyncExternalStore } from 'react';

export interface ZoneOption {
  /** The IANA name the API takes, such as `America/Argentina/Buenos_Aires`. */
  id: string;
  /** The name to read and search: `America/Argentina/Buenos Aires`. */
  name: string;
  /** Its offset from GMT today, such as `GMT+2`. */
  offset: string;
}

/** Every time zone the browser knows, A to Z, with today's offset beside it. */
export function zoneOptions(now = new Date()): ZoneOption[] {
  return Intl.supportedValuesOf('timeZone').map((id) => ({
    id,
    name: id.replaceAll('_', ' '),
    offset: offsetOf(id, now),
  }));
}

function offsetOf(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' })
    .formatToParts(now)
    .find((part) => part.type === 'timeZoneName');
  return parts?.value ?? 'GMT';
}

export interface CurrencyOption {
  /** The ISO 4217 code the API takes, such as `EGP`. */
  id: string;
  /** Its English name, such as `Egyptian Pound`. */
  name: string;
}

/** Every currency the browser can format, by name. */
export function currencyOptions(): CurrencyOption[] {
  const names = new Intl.DisplayNames(['en'], { type: 'currency', fallback: 'none' });
  return Intl.supportedValuesOf('currency')
    .flatMap((id) => {
      const name = names.of(id);
      return name ? [{ id, name }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

const noSubscription = () => () => undefined;

/**
 * The time zone the visitor's device is set to. Null while rendering on the server, which does
 * not know it; React reads it again on the device without a hydration mismatch.
 */
export function useDeviceTimeZone(): string | null {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}
