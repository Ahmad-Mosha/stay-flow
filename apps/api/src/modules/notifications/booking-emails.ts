import type { GuestReservation } from '../reservations/guest-reservations.service.js';
import type { Actor } from '../reservations/reservation.js';
import { type EmailBlock, type RenderedEmail, renderEmail } from './email-layout.js';
import { formatDate, formatDateTime, formatMoney } from './format.js';

/** The guest's confirmation: the stay, the price of each night, and how to cancel. */
export function confirmationEmail(booking: GuestReservation, manageUrl: string): RenderedEmail {
  const { reservation, property, unitType, refund } = booking;
  const money = (amountMinor: number) => formatMoney(amountMinor, reservation.currency);
  const { policy } = reservation;

  const blocks: EmailBlock[] = [
    { kind: 'paragraph', text: `Hello ${reservation.guest?.name ?? 'there'},` },
    { kind: 'paragraph', text: `Your booking at ${property.name} is confirmed.` },
    {
      kind: 'table',
      rows: [
        ['Reference', reservation.reference],
        ['Room', unitType.name],
        ['Check-in', `${formatDate(reservation.stay.start)}, from ${policy.checkInTime}`],
        ['Check-out', `${formatDate(reservation.stay.end)}, by ${policy.checkOutTime}`],
        ['Guests', String(reservation.guests)],
      ],
    },
    {
      kind: 'table',
      rows: [
        ...reservation.nightlyRates.map(
          (night) => [formatDate(night.date), money(night.rateMinor)] as const,
        ),
        ['Total', money(reservation.totalMinor)],
      ],
    },
  ];
  if (refund !== null) {
    const deadline = formatDateTime(refund.freeUntil, property.timeZone);
    blocks.push({
      kind: 'paragraph',
      text:
        refund.feeMinor === 0
          ? `You can cancel for free until ${deadline}, the property's local time. After that, the first night is not refunded.`
          : `Cancelling now refunds ${money(refund.refundMinor)}. The first night, ${money(refund.feeMinor)}, is not refunded.`,
    });
  }
  blocks.push(
    { kind: 'button', label: 'Manage or cancel your booking', url: manageUrl },
    {
      kind: 'paragraph',
      text: 'Keep this email private: anyone with the link can manage your booking.',
    },
  );

  return renderEmail({
    subject: `Booking confirmed: ${property.name} (${reservation.reference})`,
    blocks,
  });
}

/** Tells the guest the booking is cancelled, by whom, and what is refunded. */
export function cancellationEmail(
  booking: GuestReservation,
  cancelledBy: Actor,
  manageUrl: string,
): RenderedEmail {
  const { reservation, property, refund } = booking;
  const money = (amountMinor: number) => formatMoney(amountMinor, reservation.currency);
  const dates = `${formatDate(reservation.stay.start)} to ${formatDate(reservation.stay.end)}`;
  const byWhom = {
    guest: ', as you asked',
    host: ` by ${property.name}`,
    system: '',
  }[cancelledBy];

  const rows: (readonly [string, string])[] = [['Reference', reservation.reference]];
  if (refund !== null) {
    rows.push(['Refund', money(refund.refundMinor)]);
    if (refund.feeMinor > 0) {
      rows.push(['Cancellation fee', money(refund.feeMinor)]);
    }
  }

  return renderEmail({
    subject: `Booking cancelled: ${property.name} (${reservation.reference})`,
    blocks: [
      { kind: 'paragraph', text: `Hello ${reservation.guest?.name ?? 'there'},` },
      {
        kind: 'paragraph',
        text: `Your booking at ${property.name} for ${dates} is cancelled${byWhom}.`,
      },
      { kind: 'table', rows },
      { kind: 'button', label: 'See your booking', url: manageUrl },
    ],
  });
}
