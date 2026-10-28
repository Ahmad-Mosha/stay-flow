import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Button } from '@/ui/button';
import { cx } from '@/ui/cx';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { StatusTape, type TapeStatus } from '@/ui/status-tape';
import { TextField } from '@/ui/text-field';
import { Wordmark } from '@/ui/wordmark';

export const metadata: Metadata = {
  title: 'Design system',
  description: 'Colour, type, controls, status tape and states for Stay Flow, in light and dark.',
};

const colours = [
  { token: 'ground', name: 'Limestone', role: 'Page ground' },
  { token: 'paper', name: 'Paper', role: 'Cards and panels' },
  { token: 'raised', name: 'Raised', role: 'Fields and menus' },
  { token: 'ink', name: 'Ink', role: 'Text, in-house stays' },
  { token: 'ink-2', name: 'Ink 2', role: 'Secondary text' },
  { token: 'ink-3', name: 'Ink 3', role: 'Labels and hints' },
  { token: 'rule', name: 'Rule', role: 'Hairlines and grid lines' },
  { token: 'field-edge', name: 'Field edge', role: 'Input borders' },
  { token: 'action', name: 'Nile blue', role: 'Actions, nothing else' },
  { token: 'hold', name: 'Ochre tape', role: 'Holds' },
  { token: 'danger', name: 'Vermilion', role: 'Errors and no-shows' },
  { token: 'success', name: 'Moss', role: 'Success messages' },
];

const typeScale = [
  {
    token: 'display',
    spec: '64 / 68 · Newsreader',
    className: 'font-display text-display',
    sample: 'Dar Nubia Guesthouse',
  },
  {
    token: 'title',
    spec: '40 / 44 · Newsreader',
    className: 'font-display text-title',
    sample: 'Four nights by the Nile',
  },
  {
    token: 'headline',
    spec: '28 / 34 · Newsreader',
    className: 'font-display text-headline',
    sample: 'You are booked, Laila.',
  },
  {
    token: 'heading',
    spec: '22 / 28 · Instrument Sans',
    className: 'text-heading font-semibold',
    sample: 'Arrivals today',
  },
  {
    token: 'lead',
    spec: '18 / 28',
    className: 'text-lead',
    sample: 'Ten rooms around a palm garden, with balconies over the Nile.',
  },
  {
    token: 'body',
    spec: '16 / 26',
    className: 'text-body',
    sample: 'Your confirmation and a private link to manage the booking go to this email.',
  },
  {
    token: 'small',
    spec: '14 / 20',
    className: 'text-small',
    sample: 'Free cancellation until 48 hours before arrival.',
  },
  {
    token: 'label',
    spec: '12 / 16 · DM Mono',
    className: 'font-mono text-label',
    sample: 'M8D5G7QT · ROOM 201 · 3,600 EGP · 14:00',
  },
];

const statuses: { status: TapeStatus; meaning: string }[] = [
  { status: 'checked_in', meaning: 'The most contrast: who is in the building now.' },
  { status: 'confirmed', meaning: 'Upcoming stays, one step quieter.' },
  { status: 'held', meaning: 'Ochre tape while a guest confirms, for ten minutes at most.' },
  {
    status: 'blocked',
    meaning: 'Taken off sale by the host. Hatched, with the reason written on it.',
  },
  {
    status: 'no_show',
    meaning: 'Outlined in vermilion. Set by the night audit the morning after arrival.',
  },
  { status: 'checked_out', meaning: 'Dashed and quiet: history.' },
  { status: 'cancelled', meaning: 'Dashed. The nights are on sale again.' },
  { status: 'expired', meaning: 'The guest did not confirm within ten minutes.' },
  { status: 'released', meaning: 'The guest let the hold go before it ran out.' },
];

const sections = [
  { id: 'colour', title: 'Colour' },
  { id: 'type', title: 'Type' },
  { id: 'controls', title: 'Controls' },
  { id: 'status', title: 'Status tape' },
  { id: 'states', title: 'States' },
];

export default function DesignSystemPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col px-4 sm:px-8 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-rule py-5">
        <Link
          href="/"
          className="rounded-sm outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-4 focus-visible:outline-action"
        >
          <Wordmark className="text-heading" />
        </Link>
        <nav aria-label="Sections">
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-small">
            {sections.map(({ id, title }) => (
              <li key={id}>
                <a
                  href={`#${id}`}
                  className="rounded-sm text-ink-2 underline-offset-4 outline-hidden hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="flex flex-col gap-20 py-14 sm:gap-24 sm:py-20">
        <div className="flex flex-col gap-10 border-b border-rule pb-12 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-3xl flex-col gap-5">
            <p className="font-mono text-label tracking-[0.08em] text-ink-2 uppercase">
              Stay Flow · Design system
            </p>
            <h1 className="font-display text-[clamp(3.25rem,11vw,6rem)] leading-[0.95] font-normal tracking-[-0.025em]">
              Register <em>&amp;</em> Tape
            </h1>
            <p className="text-lead text-ink-2">
              Quiet hospitality for guests, precise operations for hosts. The look comes from the
              two paper tools small hotels ran on for a century: the guest register and the tape
              chart.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <Wordmark className="text-[2.125rem]" />
            <p className="max-w-xs font-mono text-label text-ink-3 lg:text-right">
              The mark is one stay on a ruled line. It starts half a night in, like a bar on the
              tape chart.
            </p>
          </div>
        </div>

        <Section
          id="colour"
          number="01"
          title="Colour"
          intro="One accent, kept for actions. Every text pair passes WCAG AA in both themes, checked by a unit test."
        >
          <ThemePair>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
              {colours.map(({ token, name, role }) => (
                <li key={token} className="flex flex-col gap-2">
                  <span
                    className="h-14 rounded-md border border-rule"
                    style={{ backgroundColor: `var(--color-${token})` }}
                  />
                  <span className="flex flex-col">
                    <span className="text-small font-semibold text-ink">{name}</span>
                    <span className="text-label text-ink-3">{role}</span>
                    <code className="font-mono text-label text-ink-2">{token}</code>
                  </span>
                </li>
              ))}
            </ul>
          </ThemePair>
        </Section>

        <Section
          id="type"
          number="02"
          title="Type"
          intro="Three open-licence families. Newsreader speaks to guests, Instrument Sans runs the interface, DM Mono sets references, rooms, prices and times."
        >
          <dl className="flex flex-col divide-y divide-rule border-y border-rule">
            {typeScale.map(({ token, spec, className, sample }) => (
              <div
                key={token}
                className="grid gap-2 py-6 md:grid-cols-[12rem_minmax(0,1fr)] md:items-baseline md:gap-8"
              >
                <dt className="flex flex-col font-mono text-label text-ink-3">
                  <span className="text-ink">{token}</span>
                  {spec}
                </dt>
                <dd className={cx('min-w-0 text-ink', className)}>{sample}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          id="controls"
          number="03"
          title="Controls"
          intro="React Aria for behaviour, our own styles. Every control is 44 px or taller and shows its focus ring only for the keyboard."
        >
          <ThemePair>
            <div className="flex flex-col gap-4">
              <h3 className="text-small font-semibold text-ink-2">Buttons</h3>
              <div className="flex flex-wrap gap-3">
                <Button>Reserve</Button>
                <Button variant="secondary">Block dates</Button>
                <Button variant="quiet">Not now</Button>
                <Button variant="danger">Cancel booking</Button>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" isPending>
                  Confirming
                </Button>
                <Button size="lg" variant="secondary" isDisabled>
                  Sold out
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-5">
              <h3 className="text-small font-semibold text-ink-2">Fields</h3>
              <TextField
                label="Email"
                type="email"
                placeholder="you@example.com"
                description="Your confirmation and a private link to manage the booking go here."
              />
              <TextField
                label="Phone"
                type="tel"
                defaultValue="+20 100 123"
                isInvalid
                errorMessage="Enter the full number, with the country code."
              />
              <TextField label="Booking reference" defaultValue="W4L7N2KD" isDisabled />
            </div>
          </ThemePair>
        </Section>

        <Section
          id="status"
          number="04"
          title="Status tape"
          intro="Status is never colour alone. Each tape has its own fill, pattern, outline or dash, and always its name."
        >
          <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-paper">
            {statuses.map(({ status, meaning }) => (
              <li
                key={status}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
              >
                <span className="flex shrink-0 gap-2">
                  <span className="flex w-36 rounded-md bg-ground p-2">
                    <StatusTape status={status} />
                  </span>
                  <span
                    aria-hidden="true"
                    data-theme="dark"
                    className="flex w-36 rounded-md bg-ground p-2"
                  >
                    <StatusTape status={status} />
                  </span>
                </span>
                <span className="text-small text-ink-2">{meaning}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section
          id="states"
          number="05"
          title="States"
          intro="Every screen has a loading, empty, error and success state. Each one says what happened and what to do next, and states the guarantees plainly."
        >
          <ThemePair stacked>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col gap-3.5 rounded-lg border border-rule bg-paper p-6 sm:p-7">
                <span className="sr-only">Loading rooms</span>
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-auto h-11 w-full rounded-md" />
              </div>
              <StatePanel
                headingLevel={3}
                eyebrow="Sold out a moment ago"
                title="Someone just booked the last Garden Double"
                action={
                  <Button variant="secondary" className="w-full">
                    See Nile View Double
                  </Button>
                }
              >
                Nothing was held or charged. Nile View Double is still free for 16 to 20 December.
              </StatePanel>
              <StatePanel
                headingLevel={3}
                tone="danger"
                eyebrow="Connection lost"
                title="We could not confirm your booking"
                action={<Button className="w-full">Confirm again</Button>}
              >
                Your room is still held. Press Confirm again when you are back online. You will not
                be booked twice.
              </StatePanel>
              <StatePanel
                headingLevel={3}
                tone="success"
                eyebrow="Confirmed"
                title="You are booked, Laila."
                action={
                  <p className="flex items-baseline justify-between border-y-[1.5px] border-dashed border-rule-strong px-1 py-3 font-mono">
                    <span className="text-label text-ink-3">REFERENCE</span>
                    <span className="text-lead tracking-[0.06em] text-ink">W4L7N2KD</span>
                  </p>
                }
              >
                We sent your confirmation and a private link to manage the booking to
                laila.mostafa@example.com.
              </StatePanel>
            </div>
          </ThemePair>
        </Section>
      </main>

      <footer className="flex flex-wrap justify-between gap-x-6 gap-y-2 border-t border-rule py-5 text-small text-ink-3">
        <p>Tokens live in one stylesheet. Components use role names only, never raw colours.</p>
        <p className="font-mono text-label">Stay Flow · 2026</p>
      </footer>
    </div>
  );
}

interface SectionProps {
  id: string;
  number: string;
  title: string;
  intro: string;
  children: ReactNode;
}

function Section({ id, number, title, intro, children }: SectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-8 flex-col gap-8">
      <div className="flex flex-col gap-3 border-b border-rule pb-4 md:flex-row md:items-baseline md:gap-4">
        <div className="flex items-baseline gap-4">
          <span className="font-mono text-small text-ink-3">{number}</span>
          <h2 id={`${id}-title`} className="font-display text-title font-normal">
            {title}
          </h2>
        </div>
        <p className="text-small text-ink-2 md:ml-auto md:max-w-md md:text-right">{intro}</p>
      </div>
      {children}
    </section>
  );
}

/** Renders a sample twice: on the light guest theme and on the dark host theme. */
function ThemePair({ children, stacked = false }: { children: ReactNode; stacked?: boolean }) {
  return (
    <div className={cx('grid gap-4', !stacked && 'lg:grid-cols-2')}>
      <ThemeFrame theme="light" caption="Light · guest pages">
        {children}
      </ThemeFrame>
      <ThemeFrame theme="dark" caption="Dark · host dashboard">
        {children}
      </ThemeFrame>
    </div>
  );
}

function ThemeFrame({
  theme,
  caption,
  children,
}: {
  theme: 'light' | 'dark';
  caption: string;
  children: ReactNode;
}) {
  return (
    <figure
      data-theme={theme}
      className="flex flex-col gap-6 rounded-lg border border-rule bg-ground p-5 text-ink sm:p-6"
    >
      <figcaption className="font-mono text-label tracking-[0.06em] text-ink-3 uppercase">
        {caption}
      </figcaption>
      {children}
    </figure>
  );
}
