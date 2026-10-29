import { zoneLabel } from '@/lib/format';
import { cx } from '@/ui/cx';

interface PropertyPreviewProps {
  name: string;
  slug: string;
  timeZone: string | null;
  currency: string | null;
}

/** A new property opens with the database's defaults, which Settings can change later. */
const defaults = { checkIn: '15:00', checkOut: '11:00', freeCancellationHours: 48 };

const nextSteps = [
  { title: 'Name it', body: 'Its name, booking page address, time zone and currency.' },
  { title: 'Add rooms and rates', body: 'Each type of room, its rooms, and a price a night.' },
  { title: 'Share the booking page', body: 'Guests book direct. No account, no commission.' },
];

/** The booking page as guests will see it, following the form as the host types. */
export function PropertyPreview({ name, slug, timeZone, currency }: PropertyPreviewProps) {
  const words = (name || 'Your property').split(/\s+/);
  const lastWord = words.length > 1 ? words.pop() : undefined;
  return (
    <aside
      aria-labelledby="preview-title"
      className="@container flex flex-col gap-6 lg:sticky lg:top-10"
    >
      <h2
        id="preview-title"
        className="font-mono text-label tracking-[0.06em] text-ink-3 uppercase"
      >
        Your booking page
      </h2>
      <div
        aria-hidden="true"
        className="overflow-hidden rounded-lg border border-rule-strong bg-paper shadow-overlay"
      >
        <div className="flex items-center gap-3 border-b border-rule bg-ground-dim px-4 py-2.5">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="size-2.5 rounded-full bg-rule-strong" />
            ))}
          </span>
          <span className="min-w-0 flex-1 truncate rounded-sm bg-paper px-3 py-1 font-mono text-label text-ink-2">
            /stay/<span className="text-ink">{slug || 'your-property'}</span>
          </span>
        </div>
        <div className="flex flex-col gap-5 px-6 py-7 sm:px-8 sm:py-9">
          <p className="font-mono text-[0.6875rem] tracking-[0.08em] text-ink-3 uppercase">
            Book direct with the hotel
          </p>
          <p
            className={cx(
              'font-display text-[clamp(2rem,4vw,3rem)] leading-[1] tracking-[-0.025em] text-balance break-words',
              !name && 'text-ink-3',
            )}
          >
            {words.join(' ')} {lastWord && <em>{lastWord}</em>}
          </p>
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-small">
            <Fact label="Check in" value={`from ${defaults.checkIn}`} />
            <Fact label="Check out" value={`by ${defaults.checkOut}`} />
            <Fact label="Prices in" value={currency ?? '—'} />
          </dl>
          <div className="grid grid-cols-[1fr_1fr_auto] divide-x divide-rule rounded-md border border-rule bg-raised text-small">
            {['Check in', 'Check out', 'Guests'].map((label) => (
              <span key={label} className="flex flex-col gap-0.5 px-3.5 py-2.5">
                <span className="font-mono text-[0.625rem] text-ink-3 uppercase">{label}</span>
                <span className="text-ink-2">{label === 'Guests' ? '2' : 'Pick a date'}</span>
              </span>
            ))}
          </div>
          <p className="text-label text-ink-3">
            {timeZone ? `Dates and times in ${zoneLabel(timeZone)}. ` : ''}Free cancellation until{' '}
            {defaults.freeCancellationHours} hours before arrival.
          </p>
        </div>
      </div>
      <ol aria-label="Setting up" className="grid gap-4 @lg:grid-cols-3">
        {nextSteps.map((step, index) => (
          <li
            key={step.title}
            aria-current={index === 0 ? 'step' : undefined}
            className={cx(
              'flex flex-col gap-1 border-t-2 pt-3',
              index === 0 ? 'border-action' : 'border-rule',
            )}
          >
            <span className="font-mono text-label text-ink-3">0{index + 1}</span>
            <span className="text-small font-semibold text-ink">{step.title}</span>
            <span className="text-small text-ink-2">{step.body}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[0.625rem] text-ink-3 uppercase">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  );
}
