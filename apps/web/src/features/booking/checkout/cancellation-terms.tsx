import type { PropertyResponse, ReservationResponse } from '@stay-flow/contracts';
import { formatDateTime, formatMoney, zoneLabel } from '@/lib/format';
import { ReceiptNote } from '../stay-receipt';
import { freeCancellationEnds } from './cancellation';

interface CancellationTermsProps {
  property: PropertyResponse;
  reservation: ReservationResponse;
  now: number;
}

/** The terms a guest is about to book under, in the property's time zone. */
export function CancellationTerms({ property, reservation, now }: CancellationTermsProps) {
  const firstNight = formatMoney(reservation.nightlyRates[0]?.rateMinor ?? 0, reservation.currency);
  const freeUntil = freeCancellationEnds(
    reservation.checkIn,
    property.checkInTime,
    property.timeZone,
    property.stayRules.freeCancellationHours,
  );

  return freeUntil.getTime() > now ? (
    <ReceiptNote
      tone="success"
      title={`Free cancellation until ${formatDateTime(freeUntil, property.timeZone)}`}
    >
      {zoneLabel(property.timeZone)}. After that, cancelling keeps the first night ({firstNight})
      and refunds the rest. You see the exact refund before you cancel.
    </ReceiptNote>
  ) : (
    <ReceiptNote tone="muted" title="Cancelling keeps the first night">
      This stay starts soon, so cancelling keeps the first night ({firstNight}) and refunds the
      rest. You see the exact refund before you cancel.
    </ReceiptNote>
  );
}
