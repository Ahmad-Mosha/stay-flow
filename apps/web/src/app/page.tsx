import { routes } from '@/lib/routes';
import { ButtonLink, TextLink } from '@/ui/link';
import { StatusTape, type TapeStatus } from '@/ui/status-tape';
import { Wordmark } from '@/ui/wordmark';

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between gap-6 border-b border-rule py-5">
        <Wordmark className="text-heading" />
        <nav aria-label="Demo" className="flex items-center gap-6">
          <TextLink href={routes.property('dar-nubia')} className="text-small">
            Guest booking
          </TextLink>
          <TextLink href={routes.signIn()} className="text-small">
            Front desk
          </TextLink>
        </nav>
      </header>

      <main className="flex flex-1 flex-col justify-center gap-14 py-16 sm:py-24">
        <div className="flex max-w-3xl flex-col gap-6">
          <p className="font-mono text-label tracking-[0.08em] text-ink-2 uppercase">
            Online booking and front desk for small hotels
          </p>
          <h1 className="font-display text-[clamp(2.75rem,9vw,var(--text-display))] leading-[1.02] font-normal tracking-[-0.025em] text-balance">
            Every room sold once. <em>Never twice.</em>
          </h1>
          <p className="max-w-2xl text-lead text-pretty text-ink-2">
            Guests book in a few calm steps while their room is held for ten minutes. Hosts run
            arrivals, stays and blocks from one tape chart. The database itself refuses a double
            booking.
          </p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4 pt-2">
            <ButtonLink href={routes.property('dar-nubia')} size="lg">
              Book a demo stay
            </ButtonLink>
            <ButtonLink href={routes.signIn()} variant="secondary" size="lg">
              Run the front desk
            </ButtonLink>
            <TextLink href="/design-system">See the design system</TextLink>
          </div>
        </div>

        <TapeChart />
      </main>

      <footer className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-rule py-5 text-small text-ink-3">
        <p>The demo hotel is Dar Nubia Guesthouse, with made-up rooms and prices.</p>
        <p className="font-mono text-label">Payment is simulated in this demo</p>
      </footer>
    </div>
  );
}

const nights = [
  { day: 'Wed', date: 16 },
  { day: 'Thu', date: 17 },
  { day: 'Fri', date: 18, weekend: true },
  { day: 'Sat', date: 19, weekend: true },
  { day: 'Sun', date: 20 },
  { day: 'Mon', date: 21 },
  { day: 'Tue', date: 22 },
];

// Each night is two grid columns, so a stay can start and end at midday, as check-in and check-out do.
const stays: {
  room: string;
  status: TapeStatus;
  label: string;
  columns: string;
  edges?: string;
}[] = [
  {
    room: '101',
    status: 'checked_in',
    label: 'Lukas Becker',
    columns: '2 / 9',
    edges: 'rounded-l-none',
  },
  { room: '102', status: 'confirmed', label: 'Aiko Tanaka', columns: '7 / 15' },
  { room: '103', status: 'held', label: 'Held · 6 min', columns: '3 / 9' },
  {
    room: '104',
    status: 'blocked',
    label: 'Renovation',
    columns: '11 / 16',
    edges: 'rounded-r-none',
  },
];

const grid =
  'grid grid-cols-[2.5rem_repeat(14,minmax(0,1fr))] sm:grid-cols-[3.5rem_repeat(14,minmax(0,1fr))]';

function TapeChart() {
  return (
    <figure className="flex flex-col gap-3">
      <div
        aria-hidden="true"
        className="relative overflow-hidden rounded-lg border border-rule bg-paper"
      >
        <div className={`${grid} absolute inset-0`}>
          {nights.map(({ date, weekend }, index) => (
            <span
              key={date}
              style={{ gridColumn: `${2 + index * 2} / span 2` }}
              className={`border-l border-rule ${weekend ? 'bg-ground-dim' : ''}`}
            />
          ))}
        </div>
        <div className={`${grid} relative border-b border-rule`}>
          {nights.map(({ day, date }, index) => (
            <span
              key={date}
              style={{ gridColumn: `${2 + index * 2} / span 2` }}
              className="flex flex-col items-center py-2.5 font-mono text-label text-ink-3 uppercase"
            >
              {day}
              <span className="numerals text-small text-ink">{date}</span>
            </span>
          ))}
        </div>
        <div className="relative flex flex-col gap-1.5 py-3">
          {stays.map(({ room, status, label, columns, edges }) => (
            <div key={room} className={`${grid} items-center`}>
              <span className="pl-3 font-mono text-label text-ink-3 sm:pl-4">{room}</span>
              <StatusTape
                status={status}
                style={{ gridColumn: columns }}
                className={`min-w-0 ${edges ?? ''}`}
              >
                <span className="truncate">{label}</span>
              </StatusTape>
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-small text-ink-3">
        The tape chart, from the host dashboard: who is in the building, who is coming, and which
        rooms are held or blocked. Stays start and end at midday.
      </figcaption>
    </figure>
  );
}
