import { createHash } from 'node:crypto';
import type { ReservationStatus } from '../platform/database/database.generated.js';
import type { DemoBlock, DemoHotel, DemoStay } from './demo-property.js';

/** Nights already taken in a room, as [first night, check-out day) in days from today. */
export type TakenDays = ReadonlyMap<string, readonly (readonly [number, number])[]>;

export interface DemoHistoryPlan {
  readonly stays: readonly DemoStay[];
  readonly blocks: readonly DemoBlock[];
}

// prettier-ignore
const FIRST_NAMES = [
  'Ahmed', 'Mariam', 'Youssef', 'Salma', 'Omar', 'Laila', 'Karim', 'Hana', 'Mostafa', 'Nour',
  'Emma', 'Lucas', 'Sofia', 'Noah', 'Chloé', 'Matteo', 'Freya', 'Jonas', 'Inès', 'Mateus',
  'Yuki', 'Haruto', 'Mei', 'Arjun', 'Priya', 'Min-jun', 'Aisha', 'Tariq', 'Zeynep', 'Emre',
  'Olivia', 'Liam', 'Grace', 'Daniel', 'Amara', 'Kwame', 'Fatima', 'Rachid', 'Elif', 'Ivan',
];

// prettier-ignore
const LAST_NAMES = [
  'Hassan', 'Mahmoud', 'El-Sayed', 'Fahmy', 'Naguib', 'Rizk', 'Shawky', 'Badawi', 'Kamal',
  'Müller', 'Schmidt', 'Dubois', 'Moreau', 'Rossi', 'Bianchi', 'Silva', 'Costa', 'Jensen',
  'Nilsson', 'Kowalski', 'Novák', 'Sato', 'Tanaka', 'Kim', 'Park', 'Sharma', 'Patel', 'Chen',
  'Wang', 'Yilmaz', 'Demir', 'Smith', 'Johnson', "O'Brien", 'Okafor', 'Mensah', 'Benali',
  'Haddad', 'Petrov', 'García',
];

const BLOCK_REASONS = [
  'Deep cleaning',
  'Air conditioning repair',
  'Repainting',
  'Plumbing work',
  'New furniture',
  'Owner staying',
];

// Mostly short stays, now and then a long one.
const STAY_LENGTHS = [1, 2, 2, 2, 3, 3, 3, 3, 4, 4, 5, 6, 7, 10, 14];
const DAYS_BOOKED_AHEAD = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 90];
const BLOCK_CHANCE = 0.02;

/**
 * Fills every room of the hotel with made-up stays across its history window, around the nights
 * already taken. The same hotel and taken nights always give the same plan, and each stay has a
 * status that fits its dates: checked out in the past, in house today, confirmed ahead. New
 * references skip the ones in `references`, and are added to it.
 */
export function planHistory(
  hotel: DemoHotel,
  taken: TakenDays,
  references: Set<string>,
): DemoHistoryPlan {
  const { fromDay, toDay } = hotel.history;
  const { slug, minNights, maxNights } = hotel.property;
  const stays: DemoStay[] = [];
  const blocks: DemoBlock[] = [];

  for (const type of hotel.unitTypes) {
    for (const unit of type.units) {
      // One sequence per room, so adding a room leaves the others as they were.
      const random = randomSequence(`${slug}/${unit}`);
      const busy = taken.get(unit) ?? [];
      let day = fromDay + pick(random, [0, 1, 2, 3]);
      let placed = 0;

      for (;;) {
        const nights = clamp(pick(random, STAY_LENGTHS), minNights, maxNights);
        if (day + nights > toDay) break;
        if (busy.some(([start, end]) => day < end && start < day + nights)) {
          day += 1;
          continue;
        }

        if (random() < BLOCK_CHANCE) {
          blocks.push({ unit, from: day, nights, reason: pick(random, BLOCK_REASONS) });
        } else {
          stays.push({
            reference: referenceFor(referenceSeed(slug, unit, placed), references),
            unit,
            from: day,
            nights,
            status: statusFor(day, nights, random()),
            guestName: `${pick(random, FIRST_NAMES)} ${pick(random, LAST_NAMES)}`,
            guests: Math.max(1, type.maxGuests - pick(random, [0, 0, 0, 1, 1, 2])),
            bookedDaysAhead: pick(random, DAYS_BOOKED_AHEAD),
          });
        }
        placed += 1;
        day += nights + gapAfter(day + nights, random);
      }
    }
  }
  return { stays, blocks };
}

/**
 * References of the first stays `planHistory` makes, whatever the day: if one of them exists, the
 * hotel already has its history.
 */
export function historyMarkers(hotel: DemoHotel): string[] {
  const firstUnit = hotel.unitTypes[0]?.units[0];
  if (firstUnit === undefined) return [];
  return [0, 1, 2].map((placed) =>
    referenceFor(referenceSeed(hotel.property.slug, firstUnit, placed), new Set()),
  );
}

function referenceSeed(slug: string, unit: string, placed: number): string {
  return `${slug}/${unit}/${placed.toString()}`;
}

/**
 * Only statuses the app could have reached by now: a stay that has not started cannot be checked
 * in, and one that should have started cannot still wait for its guest, or the night audit would
 * mark it as a no-show.
 */
function statusFor(from: number, nights: number, roll: number): ReservationStatus {
  if (from + nights < 0) {
    return roll < 0.06 ? 'cancelled' : roll < 0.1 ? 'no_show' : 'checked_out';
  }
  if (from < 0) {
    // In house, or leaving today.
    return 'checked_in';
  }
  if (from === 0) {
    return 'confirmed';
  }
  return roll < 0.07
    ? 'cancelled'
    : roll < 0.09
      ? 'expired'
      : roll < 0.1
        ? 'released'
        : 'confirmed';
}

/** Empty nights before the next stay: a room free most weeks, and more often further ahead. */
function gapAfter(day: number, random: () => number): number {
  if (day < 0) return pick(random, [0, 0, 1, 1, 2, 3]);
  if (day < 14) return pick(random, [0, 1, 1, 2, 3, 4]);
  if (day < 60) return pick(random, [1, 2, 3, 4, 6]);
  if (day < 120) return pick(random, [2, 4, 7, 10, 14]);
  return pick(random, [5, 10, 18, 28]);
}

const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** A reference derived from `seed`, so a second run plans the same ones, and unique in `taken`. */
function referenceFor(seed: string, taken: Set<string>): string {
  for (let attempt = 0; ; attempt += 1) {
    const bytes = createHash('sha256').update(`${seed}#${attempt.toString()}`).digest();
    const reference = Array.from(
      bytes.subarray(0, 8),
      (byte) => REFERENCE_ALPHABET[byte % 32],
    ).join('');
    if (!taken.has(reference)) {
      taken.add(reference);
      return reference;
    }
  }
}

/** mulberry32, seeded from a string: a small, repeatable stream of numbers in [0, 1). */
function randomSequence(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: () => number, options: readonly T[]): T {
  const option = options[Math.floor(random() * options.length)];
  if (option === undefined) throw new Error('Nothing to pick from');
  return option;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
