import type { ReactNode } from 'react';
import { roomTileStyles } from '@/features/host/today/tonight-card';
import { cx } from '@/ui/cx';
import { TextLink } from '@/ui/link';
import { Wordmark } from '@/ui/wordmark';

interface AuthScreenProps {
  /** A short mono tag above the title, such as "Front desk". */
  eyebrow: string;
  title: string;
  intro: string;
  /** The form, and what follows it. */
  children: ReactNode;
}

/** Signing in and signing up: the form on one side, the dashboard it leads to on the other. */
export function AuthScreen({ eyebrow, title, intro, children }: AuthScreenProps) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <div className="flex flex-col px-4 sm:px-10 lg:px-14 xl:px-20">
        <header className="flex items-center justify-between gap-6 border-b border-rule py-5 lg:border-0">
          <Wordmark className="text-heading" />
          <TextLink href="/" className="text-small">
            Home
          </TextLink>
        </header>
        <main className="flex flex-1 flex-col justify-center py-10 sm:py-16">
          <div className="mx-auto flex w-full max-w-[25rem] flex-col gap-8 lg:mx-0">
            <div className="flex flex-col gap-3">
              <p className="font-mono text-label tracking-[0.08em] text-ink-2 uppercase">
                {eyebrow}
              </p>
              <h1 className="font-display text-[2.75rem] leading-none font-normal tracking-[-0.02em]">
                {title}
              </h1>
              <p className="text-body text-pretty text-ink-2">{intro}</p>
            </div>
            {children}
          </div>
        </main>
      </div>
      <Showcase />
    </div>
  );
}

const facts = [
  { figure: '10 min', text: 'A guest’s room stays held while they check out, then frees itself.' },
  { figure: '0', text: 'Double bookings. The database refuses a stay that overlaps another.' },
  { figure: '1 press', text: 'To check a guest in or out, kept in the booking’s history.' },
];

/** The dashboard in the dark theme, so a visitor sees where signing in leads. */
function Showcase() {
  return (
    <aside
      data-theme="dark"
      className="hidden flex-col justify-between gap-12 bg-ground p-12 text-ink lg:flex xl:p-16"
    >
      <p className="font-mono text-label tracking-[0.08em] text-ink-3 uppercase">
        Today at Dar Nubia Guesthouse
      </p>
      <div className="flex flex-col gap-10">
        <h2 className="max-w-xl font-display text-[2.75rem] leading-[1.08] font-normal tracking-[-0.02em] text-balance">
          Who arrives, who leaves, and every room tonight, <em>on one page.</em>
        </h2>
        <TodayPreview />
      </div>
      <ul className="grid grid-cols-3 gap-6 border-t border-rule pt-6">
        {facts.map(({ figure, text }) => (
          <li key={figure} className="flex flex-col gap-2">
            <span className="numerals font-display text-[1.75rem] leading-none">{figure}</span>
            <span className="text-small text-ink-2">{text}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

const previewRooms = [
  { name: '101', label: 'In house', kind: 'in_house' },
  { name: '102', label: 'Arriving', kind: 'arriving' },
  { name: '103', label: 'Free', kind: 'free' },
  { name: '104', label: 'Free', kind: 'free' },
  { name: '201', label: 'Arriving', kind: 'arriving' },
  { name: '202', label: 'In house', kind: 'in_house' },
  { name: '203', label: 'Held · 6 min', kind: 'held' },
  { name: '301', label: 'Free', kind: 'free' },
  { name: '302', label: 'Repairs', kind: 'blocked' },
  { name: '401', label: 'Free', kind: 'free' },
] as const;

function TodayPreview() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-4 rounded-lg border border-rule bg-paper p-6"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[1.0625rem] font-semibold">Tonight</span>
        <span className="text-small text-ink-2">5 of 10 rooms sold or held · 50%</span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {previewRooms.map(({ name, label, kind }) => (
          <span
            key={name}
            className={cx(
              'flex h-16 flex-col justify-between rounded-md px-2.5 py-2',
              roomTileStyles[kind],
            )}
          >
            <span className="font-mono text-small">{name}</span>
            <span className="truncate text-[0.6875rem] leading-4 font-medium">{label}</span>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-3.5 border-t border-rule pt-4">
        <span className="flex h-10 w-12 items-center justify-center rounded-md bg-tape-stay font-mono text-small">
          102
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[0.9375rem] font-semibold">Sara Lindqvist</span>
          <span className="text-[0.8125rem] text-ink-2">Garden Double · 3 nights · 2 guests</span>
        </span>
        <span className="flex h-11 items-center rounded-md bg-action px-4 text-small font-semibold text-action-ink">
          Check in
        </span>
      </div>
    </div>
  );
}
