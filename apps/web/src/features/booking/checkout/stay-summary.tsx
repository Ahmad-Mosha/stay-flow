import type { PropertyResponse, ReservationResponse } from '@stay-flow/contracts';
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatMoney,
  plural,
  zoneLabel,
} from '@/lib/format';
import { cx } from '@/ui/cx';
import { freeCancellationEnds } from './cancellation';

interface StaySummaryProps {
  property: PropertyResponse;
  reservation: ReservationResponse;
  now: number;
  /** The cancellation terms, left out once there is nothing left to cancel. */
  showTerms?: boolean;
}

/** The stay as a receipt: dates, every night's price, the total, and the cancellation terms. */
export function StaySummary({ property, reservation, now, showTerms = true }: StaySummaryProps) {
  const lowest = Math.min(...reservation.nightlyRates.map((night) => night.rateMinor));
  const firstNight = reservation.nightlyRates[0]?.rateMinor ?? 0;
  const freeUntil = freeCancellationEnds(
    reservation.checkIn,
    property.checkInTime,
    property.timeZone,
    property.stayRules.freeCancellationHours,
  );
  const stillFree = freeUntil.getTime() > now;

  return (
    <aside
      aria-label="Your stay"
      className="overflow-hidden rounded-lg border border-rule bg-paper"
    >
      <div className="flex flex-col gap-1.5 border-b border-rule px-6 pt-6 pb-5 sm:px-7">
        <span className="font-mono text-label text-ink-3 uppercase">{property.name}</span>
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
          <span className="text-small text-ink-2">from {property.checkInTime}</span>
        </div>
        <div className="flex flex-col gap-1 px-6 py-4 sm:px-7">
          <span className="font-mono text-label text-ink-3 uppercase">Check out</span>
          <span className="text-lead font-semibold">{formatDate(reservation.checkOut)}</span>
          <span className="text-small text-ink-2">by {property.checkOutTime}</span>
        </div>
      </div>
      <div
        className={cx('flex flex-col gap-3 px-6 py-5 sm:px-7', showTerms && 'border-b border-rule')}
      >
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
      {showTerms && (
        <div className="flex gap-3 px-6 pt-5 pb-6 sm:px-7">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cx('mt-0.5 size-5 shrink-0', stillFree ? 'text-success' : 'text-ink-3')}
          >
            <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z" />
            <polyline points="9 12 11.3 14.3 15.5 10" />
          </svg>
          <div className="flex flex-col gap-1.5">
            <p className="font-semibold">
              {stillFree
                ? `Free cancellation until ${formatDateTime(freeUntil, property.timeZone)}`
                : 'Cancelling keeps the first night'}
            </p>
            <p className="text-small text-ink-2">
              {stillFree
                ? `${zoneLabel(property.timeZone)}. After that, cancelling`
                : 'This stay starts soon, so cancelling'}{' '}
              keeps the first night ({formatMoney(firstNight, reservation.currency)}) and refunds
              the rest. You see the exact refund before you cancel.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}
