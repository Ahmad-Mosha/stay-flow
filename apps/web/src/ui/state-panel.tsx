import type { ReactNode } from 'react';
import { cx } from './cx';

type Tone = 'neutral' | 'success' | 'danger';

interface StatePanelProps {
  tone?: Tone;
  /** A short mono tag above the title, such as "Sold out a moment ago". */
  eyebrow: string;
  title: string;
  children?: ReactNode;
  /** The one next step, pinned to the bottom of the panel. */
  action?: ReactNode;
  headingLevel?: 2 | 3;
  /** Set when the panel replaces content after a user action, so screen readers announce it. */
  announce?: boolean;
  className?: string;
}

const tones: Record<
  Tone,
  { className: string; icon: ReactNode; role: 'status' | 'alert' | undefined }
> = {
  neutral: { className: 'text-ink-3', icon: null, role: 'status' },
  success: {
    className: 'text-success',
    icon: <polyline points="5 12.5 10 17 19 7" />,
    role: 'status',
  },
  danger: {
    className: 'text-danger',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <line x1="12" y1="7.5" x2="12" y2="13" />
        <line x1="12" y1="16.5" x2="12" y2="16.6" />
      </>
    ),
    role: 'alert',
  },
};

/** Empty, error and success states share one shape: what happened, what it means, what to do next. */
export function StatePanel({
  tone = 'neutral',
  eyebrow,
  title,
  children,
  action,
  headingLevel = 2,
  announce = false,
  className,
}: StatePanelProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const { className: toneClassName, icon, role } = tones[tone];
  return (
    <div
      role={announce ? role : undefined}
      className={cx(
        'flex flex-col gap-3.5 rounded-lg border border-rule bg-paper p-6 sm:p-7',
        className,
      )}
    >
      <p
        className={cx(
          'flex items-center gap-2 font-mono text-label tracking-[0.06em] uppercase',
          toneClassName,
        )}
      >
        {icon && (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            {icon}
          </svg>
        )}
        {eyebrow}
      </p>
      <Heading className="font-display text-headline font-normal text-balance text-ink">
        {title}
      </Heading>
      {children && <div className="text-small text-ink-2">{children}</div>}
      {action && <div className="mt-auto pt-2">{action}</div>}
    </div>
  );
}
