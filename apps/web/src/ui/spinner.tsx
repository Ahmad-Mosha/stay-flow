'use client';

import { ProgressBar } from 'react-aria-components';
import { cx } from './cx';

interface SpinnerProps {
  /** What is loading, for screen readers. */
  label?: string;
  className?: string;
}

/**
 * An indeterminate progress indicator. Inside a pending `Button`, React Aria also announces the
 * change to screen readers while the button has focus.
 */
export function Spinner({ label = 'Loading', className }: SpinnerProps) {
  return (
    <ProgressBar isIndeterminate aria-label={label} className={cx('inline-flex', className)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-full animate-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2.5" />
        <path
          d="M12 3a9 9 0 0 1 9 9"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </ProgressBar>
  );
}
