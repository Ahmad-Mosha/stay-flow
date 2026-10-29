import type { ReservationStatus } from '../platform/database/database.generated.js';

export interface DemoUnitType {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly maxGuests: number;
  readonly baseRateMinor: number;
  readonly holidayRateMinor: number;
  readonly units: readonly string[];
}

export interface DemoStay {
  readonly reference: string;
  readonly unit: string;
  /** First night, in days from today, or from the start of the winter holidays. */
  readonly from: number;
  readonly anchor?: 'holidays';
  readonly nights: number;
  readonly status: ReservationStatus;
  readonly guestName: string;
  readonly guests: number;
}

export interface DemoBlock {
  readonly unit: string;
  readonly from: number;
  readonly nights: number;
  readonly reason: string;
}

export const demoProperty = {
  slug: 'dar-nubia',
  name: 'Dar Nubia Guesthouse',
  timeZone: 'Africa/Cairo',
  currency: 'EGP',
  checkInTime: '14:00',
  checkOutTime: '12:00',
  minNights: 1,
  maxNights: 21,
  bookingWindowDays: 365,
  freeCancellationHours: 48,
} as const;

/** The owner you sign in as to try the host dashboard. Demo data only, never a real account. */
export const demoHost = {
  name: 'Amira Salem',
  email: 'host@example.com',
  password: 'nubia-demo-password',
} as const;

/** The rest of the team, to try each role. They share the demo host's password. */
export const demoTeam = [
  { name: 'Youssef Adel', email: 'manager@example.com', role: 'manager' },
  { name: 'Nadia Farouk', email: 'frontdesk@example.com', role: 'front_desk' },
] as const;

/** Holiday rates cover the nights of 18 December to 4 January. */
export const holidaySeason = { label: 'Winter holidays', month: 12, day: 18, nights: 18 } as const;

export const demoUnitTypes: readonly DemoUnitType[] = [
  {
    slug: 'garden-double',
    name: 'Garden Double',
    description: 'A quiet double room opening onto the palm garden.',
    maxGuests: 2,
    baseRateMinor: 240_000,
    holidayRateMinor: 310_000,
    units: ['101', '102', '103', '104'],
  },
  {
    slug: 'nile-view-double',
    name: 'Nile View Double',
    description: 'A double room with a balcony over the Nile and Elephantine Island.',
    maxGuests: 2,
    baseRateMinor: 360_000,
    holidayRateMinor: 470_000,
    units: ['201', '202', '203'],
  },
  {
    slug: 'family-suite',
    name: 'Family Suite',
    description: 'Two connected rooms under a Nubian dome, for up to four guests.',
    maxGuests: 4,
    baseRateMinor: 520_000,
    holidayRateMinor: 680_000,
    units: ['301', '302'],
  },
  {
    slug: 'rooftop-studio',
    name: 'Rooftop Studio',
    description: 'A studio on the roof terrace with views of the desert hills.',
    maxGuests: 2,
    baseRateMinor: 420_000,
    holidayRateMinor: 550_000,
    units: ['401'],
  },
];

// prettier-ignore
export const demoStays: readonly DemoStay[] = [
  { reference: 'A3F7K2MQ', unit: '101', from: -6, nights: 3, status: 'checked_out', guestName: 'Mona Hassan', guests: 2 },
  { reference: 'B8N4R6TW', unit: '101', from: -1, nights: 3, status: 'checked_in', guestName: 'Lukas Becker', guests: 2 },
  { reference: 'C2H9X5PZ', unit: '101', from: 5, nights: 4, status: 'confirmed', guestName: 'Aiko Tanaka', guests: 1 },
  { reference: 'D6J3V8KM', unit: '102', from: -3, nights: 4, status: 'checked_in', guestName: 'Omar Farouk', guests: 2 },
  { reference: 'E4Q7Y2NB', unit: '102', from: 1, nights: 3, status: 'confirmed', guestName: 'Sara Lindqvist', guests: 2 },
  { reference: 'F9T2C6HR', unit: '103', from: 2, nights: 3, status: 'cancelled', guestName: 'James Carter', guests: 2 },
  { reference: 'G5W8M3JX', unit: '103', from: 3, nights: 3, status: 'confirmed', guestName: 'Nour El-Din', guests: 2 },
  { reference: 'H2K6P9DV', unit: '104', from: -2, nights: 2, status: 'no_show', guestName: 'Peter Novak', guests: 1 },
  { reference: 'J7R3Z5EA', unit: '104', from: 10, nights: 4, status: 'confirmed', guestName: 'Yasmin Adel', guests: 2 },
  { reference: 'K4B9S2WN', unit: '201', from: -4, nights: 5, status: 'checked_in', guestName: 'Hannah Weber', guests: 2 },
  { reference: 'M8D5G7QT', unit: '201', from: 1, nights: 6, status: 'confirmed', guestName: 'Karim Mansour', guests: 2 },
  { reference: 'N3X6H4RF', unit: '202', from: 0, nights: 3, status: 'confirmed', guestName: 'Elena Rossi', guests: 2 },
  { reference: 'P9C2J8YK', unit: '203', from: -2, anchor: 'holidays', nights: 5, status: 'confirmed', guestName: 'Chen Wei', guests: 2 },
  { reference: 'Q5E7T3MB', unit: '203', from: 4, nights: 2, status: 'expired', guestName: 'Ahmed Samir', guests: 2 },
  { reference: 'R2V9N6GD', unit: '301', from: 6, nights: 4, status: 'confirmed', guestName: 'Hossam Ibrahim', guests: 4 },
  { reference: 'S6A4W8ZP', unit: '302', from: -8, nights: 3, status: 'checked_out', guestName: 'Fatma Ali', guests: 3 },
  { reference: 'T3M7K5XH', unit: '401', from: 0, nights: 2, status: 'released', guestName: 'Marco Silva', guests: 2 },
  { reference: 'V8F2R9QC', unit: '401', from: 8, nights: 4, status: 'confirmed', guestName: 'Ingrid Larsen', guests: 1 },
];

export const demoBlocks: readonly DemoBlock[] = [
  { unit: '302', from: 14, nights: 4, reason: 'Bathroom renovation' },
];
