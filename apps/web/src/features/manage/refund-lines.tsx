import { formatAmount } from '@/lib/format';

interface RefundLinesProps {
  totalMinor: number;
  feeMinor: number;
  refundMinor: number;
  currency: string;
  /** "You get back" before cancelling, "Refunded" after. */
  refundLabel: string;
}

/** Paid, kept and refunded, as receipt lines that always add up. */
export function RefundLines({
  totalMinor,
  feeMinor,
  refundMinor,
  currency,
  refundLabel,
}: RefundLinesProps) {
  const amount = (minor: number) => (
    <span className="numerals font-mono">
      {formatAmount(minor, currency)}
      <span className="sr-only"> {currency}</span>
    </span>
  );
  return (
    <dl className="flex flex-col gap-2.5 rounded-md border border-rule bg-raised px-4 py-4 text-small sm:text-body">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-ink-2">Paid</dt>
        <dd>{amount(totalMinor)}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-ink-2">
          {feeMinor > 0 ? 'Kept by the hotel, first night' : 'Kept by the hotel'}
        </dt>
        <dd>{feeMinor > 0 ? amount(feeMinor) : <span className="text-ink-2">Nothing</span>}</dd>
      </div>
      <div className="flex items-baseline justify-between gap-4 border-t border-rule pt-2.5">
        <dt className="font-semibold">{refundLabel}</dt>
        <dd className="text-lead font-semibold">
          {amount(refundMinor)}{' '}
          <span className="text-small font-medium text-ink-2">{currency}</span>
        </dd>
      </div>
    </dl>
  );
}
