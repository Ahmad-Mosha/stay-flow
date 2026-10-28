import type { ReservationResponse } from '@stay-flow/contracts';
import { useMemo, useSyncExternalStore } from 'react';

/** The details a Confirm press sent, and the idempotency key that goes with exactly those details. */
export interface ConfirmAttempt {
  key: string;
  guestName: string;
  guestEmail: string;
}

/**
 * What the checkout page needs to survive a reload: the API has no public read of a hold, so the
 * hold's answer is kept for this tab only.
 */
export interface StoredHold {
  propertySlug: string;
  reservation: ReservationResponse;
  /** Server time when the hold was placed, to draw how much of it is left. */
  heldAt: number;
  /**
   * Pressing Confirm again with the same details reuses this key, which is what makes "you will
   * not be booked twice" true. Changed details get a new key: the API refuses a key reused for a
   * different request.
   */
  lastConfirm?: ConfirmAttempt;
}

const keyFor = (id: string) => `stay-flow:hold:${id}`;
const listeners = new Set<() => void>();

export function saveHold(hold: StoredHold): void {
  try {
    sessionStorage.setItem(keyFor(hold.reservation.id), JSON.stringify(hold));
  } catch {
    // Private mode or a full quota: nothing to keep, and the checkout says so on reload.
  }
  for (const listener of listeners) listener();
}

function readRaw(id: string): string | null {
  try {
    return sessionStorage.getItem(keyFor(id));
  } catch {
    return null;
  }
}

export function loadHold(id: string): StoredHold | null {
  const text = readRaw(id);
  return text ? (JSON.parse(text) as StoredHold) : null;
}

export function updateHold(id: string, change: Partial<StoredHold>): void {
  const hold = loadHold(id);
  if (hold) saveHold({ ...hold, ...change });
}

export function forgetHold(id: string): void {
  try {
    sessionStorage.removeItem(keyFor(id));
  } catch {
    // Nothing was kept.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The stored hold: undefined while rendering on the server, null when this tab has none. */
export function useStoredHold(id: string): StoredHold | null | undefined {
  const text = useSyncExternalStore(
    subscribe,
    () => readRaw(id),
    () => undefined,
  );
  return useMemo(
    () => (text === undefined ? undefined : text ? (JSON.parse(text) as StoredHold) : null),
    [text],
  );
}
