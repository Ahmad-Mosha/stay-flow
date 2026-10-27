import type {
  HostReservationDetailResponse,
  HostReservationResponse,
  RefundResponse,
  ReservationResponse,
} from '@stay-flow/contracts';
import { nightCount } from '../../platform/time/date-span.js';
import type { UnitType } from '../inventory/inventory.service.js';
import type { Refund } from './cancellation-policy.js';
import type { HostReservation, HostReservationDetail } from './host-reservations.service.js';
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
    holdExpiresAt: holdExpiryOf(reservation),
    guest: guest === null ? null : { name: guest.name, email: guest.email },
  };
}

export function toHostReservationResponse(reservation: HostReservation): HostReservationResponse {
  const { stay, guest, unit } = reservation;
  return {
    id: reservation.id,
    reference: reservation.reference,
    status: reservation.status,
    unitType: { id: reservation.unitType.id, name: reservation.unitType.name },
    unit: unit === null ? null : { id: unit.id, name: unit.name },
    checkIn: stay.start.toString(),
    checkOut: stay.end.toString(),
    nights: nightCount(stay),
    guests: reservation.guests,
    guest: guest === null ? null : { name: guest.name, email: guest.email },
    currency: reservation.currency,
    totalMinor: reservation.totalMinor,
    holdExpiresAt: holdExpiryOf(reservation),
    createdAt: reservation.createdAt.toString(),
  };
}

export function toHostReservationDetailResponse(
  reservation: HostReservationDetail,
): HostReservationDetailResponse {
  return {
    ...toHostReservationResponse(reservation),
    nightlyRates: reservation.nightlyRates.map((night) => ({
      date: night.date.toString(),
      rateMinor: night.rateMinor,
    })),
    policy: { ...reservation.policy },
    refund: reservation.refund === null ? null : toRefundResponse(reservation.refund),
    events: reservation.events.map((event) => ({
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      actor: event.actor,
      userId: event.userId,
      note: event.note,
      occurredAt: event.occurredAt.toString(),
    })),
  };
}

export function toRefundResponse(refund: Refund): RefundResponse {
  return {
    freeUntil: refund.freeUntil.toString(),
    refundMinor: refund.refundMinor,
    feeMinor: refund.feeMinor,
  };
}

/** A hold's deadline means nothing once the reservation has moved on. */
function holdExpiryOf(reservation: Reservation): string | null {
  return reservation.status === 'held' ? (reservation.holdExpiresAt?.toString() ?? null) : null;
}
