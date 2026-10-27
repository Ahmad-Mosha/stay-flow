import type { ReservationResponse } from '@stay-flow/contracts';
import { nightCount } from '../../platform/time/date-span.js';
import type { UnitType } from '../inventory/inventory.service.js';
import type { Reservation } from './reservation.js';

export function toReservationResponse(
  reservation: Reservation,
  unitType: UnitType,
): ReservationResponse {
  const { stay, guest } = reservation;
  return {
    id: reservation.id,
    reference: reservation.reference,
    status: reservation.status,
    unitType: { slug: unitType.slug, name: unitType.name },
    checkIn: stay.start.toString(),
    checkOut: stay.end.toString(),
    nights: nightCount(stay),
    guests: reservation.guests,
    currency: reservation.currency,
    nightlyRates: reservation.nightlyRates.map((night) => ({
      date: night.date.toString(),
      rateMinor: night.rateMinor,
    })),
    totalMinor: reservation.totalMinor,
    holdExpiresAt:
      reservation.status === 'held' ? (reservation.holdExpiresAt?.toString() ?? null) : null,
    guest: guest === null ? null : { name: guest.name, email: guest.email },
  };
}
