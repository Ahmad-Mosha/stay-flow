import { describe, expect, it } from 'vitest';
import { canTransition, releasesRoom } from './reservation-lifecycle.js';
import type { ReservationStatus } from './reservation.js';

const statuses: readonly ReservationStatus[] = [
  'held',
  'confirmed',
  'checked_in',
  'checked_out',
  'expired',
  'released',
  'cancelled',
  'no_show',
];

const allowed = new Set([
  'held>confirmed',
  'held>expired',
  'held>released',
  'confirmed>checked_in',
  'confirmed>cancelled',
  'confirmed>no_show',
  'checked_in>checked_out',
]);

describe('reservation lifecycle', () => {
  const pairs = statuses.flatMap((from) => statuses.map((to) => [from, to] as const));

  it.each(pairs)('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(allowed.has(`${from}>${to}`));
  });

  it('gives the room back on every way out except a completed stay', () => {
    expect(statuses.filter(releasesRoom)).toEqual(['expired', 'released', 'cancelled', 'no_show']);
  });
});
