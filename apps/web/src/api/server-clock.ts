let offsetMs = 0;

/** Keeps how far this device's clock is from the server's, from a response's `Date` header. */
export function recordServerTime(date: string | null): void {
  if (!date) return;
  const serverMs = Date.parse(date);
  if (!Number.isNaN(serverMs)) offsetMs = serverMs - Date.now();
}

/**
 * The server's idea of now. Hold deadlines come from the database clock, so a countdown based on a
 * device clock that runs fast or slow would show the wrong time left.
 */
export function serverNow(): number {
  return Date.now() + offsetMs;
}
