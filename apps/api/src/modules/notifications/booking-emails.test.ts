import { Temporal } from 'temporal-polyfill';
import { describe, expect, it } from 'vitest';
import { dateSpan } from '../../platform/time/date-span.js';
import type { GuestReservation } from '../reservations/guest-reservations.service.js';
import { cancellationEmail, confirmationEmail } from './booking-emails.js';

const date = (value: string) => Temporal.PlainDate.from(value);

const freeUntil = Temporal.Instant.from('2026-10-28T13:00:00Z');

/** Two nights at Dar Nubia, free to cancel until 13:00 UTC on 28 October. */
function booking(changes: Partial<GuestReservation> = {}): GuestReservation {
  return {
    reservation: {
      id: '01a17d45-af7d-7270-8288-c911e0fd17ef',
      reference: 'N3X6H4RF',
      status: 'confirmed',
      propertyId: '01a17d45-af0d-713d-903c-9b0676ef99d7',
      unitTypeId: '01a17d45-af1d-713d-903c-9b0676ef99d7',
      stay: dateSpan(date('2026-10-30'), date('2026-11-01')),
      guests: 2,
      currency: 'EGP',
      nightlyRates: [
        { date: date('2026-10-30'), rateMinor: 240_000 },
        { date: date('2026-10-31'), rateMinor: 260_000 },
      ],
      totalMinor: 500_000,
      policy: { freeCancellationHours: 48, checkInTime: '15:00', checkOutTime: '11:00' },
      refundMinor: null,
      holdExpiresAt: null,
      guest: { name: 'Nour Hassan', email: 'nour@example.com' },
    },
    property: {
      id: '01a17d45-af0d-713d-903c-9b0676ef99d7',
      slug: 'dar-nubia',
      name: 'Dar Nubia',
      timeZone: 'Africa/Cairo',
      currency: 'EGP',
      checkInTime: Temporal.PlainTime.from('15:00'),
      checkOutTime: Temporal.PlainTime.from('11:00'),
      stayRules: { minNights: 1, maxNights: 30, bookingWindowDays: 365, freeCancellationHours: 48 },
    },
    unitType: {
      id: '01a17d45-af1d-713d-903c-9b0676ef99d7',
      slug: 'garden-double',
      name: 'Garden Double',
      description: '',
      maxGuests: 2,
      baseRateMinor: 240_000,
    },
    refund: {
      freeUntil,
      refundMinor: 500_000,
      feeMinor: 0,
    },
    ...changes,
  };
}

const manageUrl = 'https://stayflow.example/manage#token';

describe('confirmationEmail', () => {
  it('lists the stay, each night and the total, and links to the booking', () => {
    const email = confirmationEmail(booking(), manageUrl);

    expect(email.subject).toBe('Booking confirmed: Dar Nubia (N3X6H4RF)');
    expect(email.text).toBe(`Hello Nour Hassan,

Your booking at Dar Nubia is confirmed.

Reference  N3X6H4RF
Room       Garden Double
Check-in   Fri, 30 Oct 2026, from 15:00
Check-out  Sun, 1 Nov 2026, by 11:00
Guests     2

Fri, 30 Oct 2026  EGP 2,400.00
Sat, 31 Oct 2026  EGP 2,600.00
Total             EGP 5,000.00

You can cancel for free until Wed, 28 Oct 2026, 16:00, the property's local time. After that, the first night is not refunded.

Manage or cancel your booking:
https://stayflow.example/manage#token

Keep this email private: anyone with the link can manage your booking.
`);
    expect(email.html).toContain('href="https://stayflow.example/manage#token"');
  });

  it('says what cancelling refunds once the free period is over', () => {
    const email = confirmationEmail(
      booking({
        refund: { freeUntil, refundMinor: 260_000, feeMinor: 240_000 },
      }),
      manageUrl,
    );

    expect(email.text).toContain(
      'Cancelling now refunds EGP 2,600.00. The first night, EGP 2,400.00, is not refunded.',
    );
  });

  it('escapes what guests and hosts typed', () => {
    const base = booking();
    const email = confirmationEmail(
      {
        ...base,
        reservation: { ...base.reservation, guest: { name: '<b>Nour</b>', email: 'n@x.test' } },
      },
      manageUrl,
    );

    expect(email.html).toContain('Hello &lt;b&gt;Nour&lt;/b&gt;,');
    expect(email.html).not.toContain('<b>Nour</b>');
  });
});

describe('cancellationEmail', () => {
  it('says who cancelled and what is refunded', () => {
    const base = booking();
    const cancelled = booking({
      reservation: { ...base.reservation, status: 'cancelled', refundMinor: 260_000 },
      refund: { freeUntil, refundMinor: 260_000, feeMinor: 240_000 },
    });

    const byGuest = cancellationEmail(cancelled, 'guest', manageUrl);
    const byHost = cancellationEmail(cancelled, 'host', manageUrl);

    expect(byGuest.subject).toBe('Booking cancelled: Dar Nubia (N3X6H4RF)');
    expect(byGuest.text).toContain(
      'Your booking at Dar Nubia for Fri, 30 Oct 2026 to Sun, 1 Nov 2026 is cancelled, as you asked.',
    );
    expect(byGuest.text).toContain('Refund            EGP 2,600.00');
    expect(byGuest.text).toContain('Cancellation fee  EGP 2,400.00');
    expect(byHost.text).toContain('is cancelled by Dar Nubia.');
  });
});
