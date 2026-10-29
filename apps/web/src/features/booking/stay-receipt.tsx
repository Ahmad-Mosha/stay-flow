import type { ReservationResponse } from '@stay-flow/contracts';
import type { ReactNode } from 'react';
import { formatAmount, formatDate, plural } from '@/lib/format';
import { cx } from '@/ui/cx';

interface StayReceiptProps {
  propertyName: string;
  reservation: ReservationResponse;
  /** The times the guest booked under; a booking keeps them if the property changes its own. */
  checkInTime: string;
  checkOutTime: string;
  /** Under the total, such as the cancellation terms. */
  footer?: ReactNode;
}

/** The stay as a receipt: room, dates, every night's price and the total. */
export function StayReceipt({
  propertyName,
  reservation,
  checkInTime,
  checkOutTime,
  footer,
}: StayReceiptProps) {
  const lowest = Math.min(...reservation.nightlyRates.map((night) => night.rateMinor));

  return (
    <aside
      aria-label="Your stay"
      className="overflow-hidden rounded-lg border border-rule bg-paper"
    >
      <div className="flex flex-col gap-1.5 border-b border-rule px-6 pt-6 pb-5 sm:px-7">
        <span className="font-mono text-label text-ink-3 uppercase">{propertyName}</span>
        <h2 className="font-display text-headline font-normal sm:text-[2rem] sm:leading-10">
          {reservation.unitType.name}
        </h2>
        <span className="text-small text-ink-2">
          {plural(reservation.guests, 'guest')} · {plural(reservation.nights, 'night')}
        </span>
      </div>
      <div className="grid grid-cols-2 border-b border-rule">
        <div className="flex flex-col gap-1 border-r border-rule px-6 py-4 sm:px-7">
          <span className="font-mono text-label text-ink-3 uppercase">Check in</span>
          <span className="text-lead font-semibold">{formatDate(reservation.checkIn)}</span>
          <span className="text-small text-ink-2">from {checkInTime}</span>
        </div>
        <div className="flex flex-col gap-1 px-6 py-4 sm:px-7">
          <span className="font-mono text-label text-ink-3 uppercase">Check out</span>
          <span className="text-lead font-semibold">{formatDate(reservation.checkOut)}</span>
          <span className="text-small text-ink-2">by {checkOutTime}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 px-6 py-5 sm:px-7">
        <ul aria-label="Price of each night" className="flex flex-col gap-3">
          {reservation.nightlyRates.map((night) => (
            <li key={night.date} className="flex items-baseline gap-2.5 text-small sm:text-body">
              <span className="whitespace-nowrap">{formatDate(night.date)}</span>
              {night.rateMinor > lowest && (
                <span className="rounded-sm border border-rule-strong px-1.5 font-mono text-[0.625rem] leading-4 text-ink-2">
                  SEASONAL
                </span>
              )}
              <span
                aria-hidden="true"
                className="flex-1 -translate-y-1 border-b-[1.5px] border-dotted border-rule-strong"
              />
              <span className="numerals font-mono">
                {formatAmount(night.rateMinor, reservation.currency)}
                <span className="sr-only"> {reservation.currency}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="flex items-baseline justify-between border-t border-rule pt-3.5">
          <span className="font-semibold">Total</span>
          <span className="numerals text-headline font-semibold">
            {formatAmount(reservation.totalMinor, reservation.currency)}{' '}
            <span className="text-small font-medium text-ink-2">{reservation.currency}</span>
          </span>
        </p>
      </div>
      {footer && <div className="border-t border-rule px-6 pt-5 pb-6 sm:px-7">{footer}</div>}
    </aside>
  );
}

interface ReceiptNoteProps {
  tone: 'success' | 'muted';
  title: string;
  children: ReactNode;
}

/** A line of terms with a shield: green while the guest is fully covered. */
export function ReceiptNote({ tone, title, children }: ReceiptNoteProps) {
  return (
    <div className="flex gap-3">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cx('mt-0.5 size-5 shrink-0', tone === 'success' ? 'text-success' : 'text-ink-3')}
      >
        <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
        <polyline points="9 12 11.3 14.3 15.5 10" />
      </svg>
      <div className="flex flex-col gap-1.5">
        <p className="font-semibold">{title}</p>
        <div className="text-small text-ink-2">{children}</div>
      </div>
    </div>
  );
}
