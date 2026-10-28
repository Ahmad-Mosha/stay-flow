import type {
  AvailabilityResponse,
  PropertyResponse,
  ReservationResponse,
} from '@stay-flow/contracts';

/** The demo hotel the API seeds, as its public endpoint returns it. */
export const property: PropertyResponse = {
  slug: 'dar-nubia',
  name: 'Dar Nubia Guesthouse',
  timeZone: 'Africa/Cairo',
  currency: 'EGP',
  checkInTime: '14:00',
  checkOutTime: '12:00',
  stayRules: { minNights: 1, maxNights: 21, bookingWindowDays: 365, freeCancellationHours: 48 },
};

export function aReservation(change: Partial<ReservationResponse> = {}): ReservationResponse {
  return {
    id: '01a18272-76fb-7749-9fe5-34dd584f1fde',
    reference: 'G1MMV3G4',
    status: 'held',
    unitType: { slug: 'garden-double', name: 'Garden Double' },
    checkIn: '2026-12-16',
    checkOut: '2026-12-19',
    nights: 3,
    guests: 2,
    currency: 'EGP',
    nightlyRates: [
      { date: '2026-12-16', rateMinor: 240_000 },
      { date: '2026-12-17', rateMinor: 240_000 },
      { date: '2026-12-18', rateMinor: 310_000 },
    ],
    totalMinor: 790_000,
    holdExpiresAt: '2026-12-01T10:10:00.000Z',
    guest: null,
    ...change,
  };
}

type UnitType = AvailabilityResponse['unitTypes'][number];

export function anAvailability(unitTypes: Partial<UnitType>[]): AvailabilityResponse {
  return {
    checkIn: '2026-12-16',
    checkOut: '2026-12-18',
    nights: 2,
    guests: 2,
    currency: 'EGP',
    unitTypes: unitTypes.map((type, index) => ({
      slug: `room-${String(index)}`,
      name: `Room ${String(index)}`,
      description: 'A room.',
      maxGuests: 2,
      freeUnits: 2,
      nightlyRates: [
        { date: '2026-12-16', rateMinor: 240_000 },
        { date: '2026-12-17', rateMinor: 240_000 },
      ],
      totalMinor: 480_000,
      ...type,
    })),
  };
}
