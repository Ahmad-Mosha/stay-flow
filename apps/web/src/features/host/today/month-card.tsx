import type { TodayResponse } from '@stay-flow/contracts';
import { parseDate } from '@internationalized/date';
import { formatAmount, formatDate, formatMoney, locale } from '@/lib/format';

interface MonthCardProps {
  month: TodayResponse['thisMonth'];
  rooms: number;
}

/**
 * The month's booked nights and revenue, with the two figures hotels judge a month by:
 * occupancy, and the average rate a sold night earns.
 */
export function MonthCard({ month, rooms }: MonthCardProps) {
  const first = parseDate(`${month.month}-01`);
  const roomNights = rooms * first.calendar.getDaysInMonth(first);
  const occupancy = roomNights === 0 ? 0 : Math.round((month.nightsSold / roomNights) * 100);
  const averageMinor =
    month.nightsSold === 0 ? 0 : Math.round(month.revenueMinor / month.nightsSold);

  return (
    <section
      aria-labelledby="month-title"
      className="flex min-w-0 flex-col gap-4 rounded-lg border border-rule bg-paper p-5 sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="month-title" className="text-[1.0625rem] font-semibold">
          {formatDate(first, 'month')} on the books
        </h2>
        <span className="font-mono text-label text-ink-3">{month.month}</span>
      </div>
      <p className="flex flex-col gap-1 pt-1">
        <span className="numerals font-display text-[3.25rem] leading-none tracking-[-0.02em]">
          {formatAmount(month.revenueMinor, month.currency)}{' '}
          <span className="font-sans text-body text-ink-2">{month.currency}</span>
        </span>
        <span className="text-small text-ink-2">
          for nights this month, at the prices guests booked
        </span>
      </p>
      <dl className="mt-auto flex flex-col divide-y divide-rule border-t border-rule text-small">
        <Figure label="Nights sold" value={month.nightsSold.toLocaleString(locale)} />
        <Figure label="Occupancy" value={`${String(occupancy)}%`} />
        <Figure
          label="Average rate"
          value={month.nightsSold === 0 ? 'None yet' : formatMoney(averageMinor, month.currency)}
        />
      </dl>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-ink-2">{label}</dt>
      <dd className="numerals text-body font-semibold">{value}</dd>
    </div>
  );
}
