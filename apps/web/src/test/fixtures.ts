import type {
  AvailabilityResponse,
  GuestReservationResponse,
  HostPropertyResponse,
  HostReservationResponse,
  PropertyResponse,
  ReservationResponse,
  RoomCalendarResponse,
  TodayResponse,
  UserResponse,
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

export function aGuestReservation(
  change: Partial<GuestReservationResponse> = {},
): GuestReservationResponse {
  return {
    ...aReservation({
      status: 'confirmed',
      holdExpiresAt: null,
      guest: { name: 'Nour El-Sayed', email: 'nour@example.com' },
    }),
    property: { slug: property.slug, name: property.name },
    policy: { freeCancellationHours: 48, checkInTime: '14:00', checkOutTime: '12:00' },
    refund: { freeUntil: '2026-12-14T12:00:00.000Z', refundMinor: 790_000, feeMinor: 0 },
    ...change,
  };
}

export const host: UserResponse = {
  id: '01a1825d-ff33-7836-92e7-3ed28f880c73',
  name: 'Amira Salem',
  email: 'host@example.com',
};

export const hostProperty: HostPropertyResponse = {
  ...property,
  id: '01a1825d-fad0-7292-82eb-c902afb044e6',
  role: 'owner',
};

const garden = { id: '01a1825d-fddd-7d91-b222-b86baff7fa9b', name: 'Garden Double' };

export function aHostReservation(
  change: Partial<HostReservationResponse> = {},
): HostReservationResponse {
  return {
    id: '01a1825d-fe4c-73bc-9a85-2a5bc65dff6f',
    reference: 'E4Q7Y2NB',
    status: 'confirmed',
    unitType: garden,
    unit: { id: '01a1825d-fdee-7caf-9e8d-ded549254d8b', name: '102' },
    checkIn: '2026-10-29',
    checkOut: '2026-11-01',
    nights: 3,
    guests: 2,
    guest: { name: 'Sara Lindqvist', email: 'sara@example.com' },
    currency: 'EGP',
    totalMinor: 720_000,
    holdExpiresAt: null,
    createdAt: '2026-10-17T08:16:00.000Z',
    ...change,
  };
}

/** Sara arrives in room 102 today, while Omar, in house there, leaves. */
export const arriving = aHostReservation();
export const leaving = aHostReservation({
  id: '01a1825d-fe3d-7fe7-bf03-34619703147b',
  reference: 'D6J3V8KM',
  status: 'checked_in',
  checkIn: '2026-10-25',
  checkOut: '2026-10-29',
  nights: 4,
  guest: { name: 'Omar Farouk', email: 'omar@example.com' },
});

export function aToday(change: Partial<TodayResponse> = {}): TodayResponse {
  return {
    date: '2026-10-29',
    arrivals: [arriving],
    departures: [leaving],
    inHouse: [leaving],
    tonight: { rooms: 3, sold: 1, held: 1, blocked: 0, free: 1 },
    thisMonth: { month: '2026-10', nightsSold: 25, currency: 'EGP', revenueMinor: 7_800_000 },
    ...change,
  };
}

/** Tonight: 102 arriving, 103 held until 09:10 UTC, 104 free. */
export const tonightCalendar: RoomCalendarResponse = {
  nights: { from: '2026-10-29', to: '2026-10-30' },
  unitTypes: [
    {
      ...garden,
      units: [
        {
          id: '01a1825d-fdee-7caf-9e8d-ded549254d8b',
          name: '102',
          bars: [
            {
              kind: 'stay',
              nights: { from: '2026-10-29', to: '2026-11-01' },
              reservation: arriving,
            },
          ],
        },
        {
          id: '01a1825d-fdef-7caf-9e8d-ded549254d8c',
          name: '103',
          bars: [
            {
              kind: 'stay',
              nights: { from: '2026-10-29', to: '2026-10-31' },
              reservation: aHostReservation({
                id: '01a1825d-fe50-73bc-9a85-2a5bc65dff70',
                status: 'held',
                unit: { id: '01a1825d-fdef-7caf-9e8d-ded549254d8c', name: '103' },
                guest: null,
                holdExpiresAt: '2026-10-29T09:10:00.000Z',
              }),
            },
          ],
        },
        { id: '01a1825d-fdf0-7caf-9e8d-ded549254d8d', name: '104', bars: [] },
      ],
    },
  ],
};
