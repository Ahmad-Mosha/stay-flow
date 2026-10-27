import type { ReservationStatus } from './reservation.js';

/** How long a hold keeps a room while the guest confirms. */
export const HOLD_MINUTES = 10;

/** The statuses a reservation may move to from each status. */
const nextStatuses: Record<ReservationStatus, readonly ReservationStatus[]> = {
  held: ['confirmed', 'expired', 'released'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['checked_out'],
  checked_out: [],
  expired: [],
  released: [],
  cancelled: [],
  no_show: [],
};

const roomReleasing = new Set<ReservationStatus>(['expired', 'released', 'cancelled', 'no_show']);

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return nextStatuses[from].includes(to);
}

/** Whether entering this status gives the room back. */
export function releasesRoom(status: ReservationStatus): boolean {
  return roomReleasing.has(status);
}
