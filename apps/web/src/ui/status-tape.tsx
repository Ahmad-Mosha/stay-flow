import type { ReservationStatus } from '@stay-flow/contracts';
import type { CSSProperties, ReactNode } from 'react';
import { cx } from './cx';

/** A reservation's status, or a room blocked by the host. */
export type TapeStatus = ReservationStatus | 'blocked';

// Every status differs by more than hue (fill, pattern, outline or dash), and always carries its label.
const tapes: Record<TapeStatus, { label: string; className: string }> = {
  checked_in: { label: 'In house', className: 'bg-tape-in text-tape-in-ink' },
  confirmed: { label: 'Confirmed', className: 'bg-tape-stay text-ink' },
  held: { label: 'Held', className: 'tape-hold text-hold-ink' },
  blocked: { label: 'Blocked', className: 'tape-block text-ink-2' },
  no_show: { label: 'No-show', className: 'border-[1.5px] border-danger text-danger' },
  checked_out: {
    label: 'Checked out',
    className: 'border border-dashed border-rule-strong text-ink-2',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'border border-dashed border-rule-strong text-ink-3',
  },
  expired: {
    label: 'Hold expired',
    className: 'border border-dashed border-rule-strong text-ink-3',
  },
  released: { label: 'Released', className: 'border border-dashed border-rule-strong text-ink-3' },
};

export function tapeLabel(status: TapeStatus): string {
  return tapes[status].label;
}

interface StatusTapeProps {
  status: TapeStatus;
  /** Replaces the status name, as in "Held · 6 min". */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function StatusTape({ status, children, className, style }: StatusTapeProps) {
  const tape = tapes[status];
  return (
    <span
      style={style}
      className={cx(
        'inline-flex h-7 items-center rounded-sm px-2.5 text-small font-medium whitespace-nowrap',
        tape.className,
        className,
      )}
    >
      {children ?? tape.label}
    </span>
  );
}
