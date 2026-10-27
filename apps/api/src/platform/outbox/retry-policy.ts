/** After this many failed deliveries, an event is dead. */
export const MAX_ATTEMPTS = 10;

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60 * 60_000;

/**
 * How long to wait after the `attempt`-th failed delivery: about 5 s, 10 s, 20 s and so on, up to
 * an hour. A random part of up to half (jitter) spreads out the retries of events that failed
 * together, so a mail server that comes back is not hit by all of them in the same second.
 */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const ceiling = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}
