import { cx } from '@/ui/cx';

const steps = ['Room and dates', 'Your details', 'Confirmed'] as const;

/** Where the guest is in booking. Checkout always starts with a room held, so step one is done. */
export function BookingSteps({ current }: { current: 'details' | 'confirmed' }) {
  const currentIndex = current === 'details' ? 1 : 2;
  return (
    <ol
      aria-label="Booking steps"
      className="flex items-center gap-2 font-mono text-label uppercase sm:gap-3"
    >
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex;
        const done = index < currentIndex || current === 'confirmed';
        return (
          <li
            key={step}
            aria-current={isCurrent ? 'step' : undefined}
            className={cx(
              'flex items-center gap-2 sm:gap-3',
              done || isCurrent ? 'text-ink' : 'text-ink-3',
            )}
          >
            {index > 0 && <span aria-hidden="true" className="h-px w-3 bg-rule-strong sm:w-6" />}
            <span
              aria-hidden="true"
              className={cx(
                'grid size-5 place-items-center rounded-full border text-[0.625rem]',
                done
                  ? 'border-ink bg-ink text-paper'
                  : isCurrent
                    ? 'border-ink'
                    : 'border-rule-strong',
              )}
            >
              {done ? '✓' : index + 1}
            </span>
            <span className={isCurrent ? undefined : 'sr-only sm:not-sr-only'}>
              {step}
              {done && !isCurrent && <span className="sr-only">, done</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
