import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BookingSearch } from '@/features/booking/booking-search';
import { PropertyFooter, PropertyHeader } from '@/features/booking/property-chrome';
import { plural } from '@/lib/format';
import { TextLink } from '@/ui/link';
import { StatePanel } from '@/ui/state-panel';
import { getProperty } from './property';

export async function generateMetadata({ params }: PageProps<'/stay/[slug]'>): Promise<Metadata> {
  const property = await getProperty((await params).slug);
  return {
    title: `Book ${property.name}`,
    description: `Book a room at ${property.name} directly, with the price of every night shown before you hold it.`,
  };
}

const steps = [
  { title: 'Pick your nights', body: 'Every night shows its price before you choose a room.' },
  { title: 'Hold a room', body: 'It is yours for 10 minutes. Nobody else can book it meanwhile.' },
  {
    title: 'Confirm with your email',
    body: 'No account needed. A private link lets you manage it later.',
  },
];

export default async function PropertyPage({ params }: PageProps<'/stay/[slug]'>) {
  const property = await getProperty((await params).slug);
  const words = property.name.split(' ');
  const lastWord = words.pop();

  return (
    <div className="flex min-h-dvh flex-col">
      <PropertyHeader property={property}>
        <div className="flex items-center gap-5">
          <span className="hidden font-mono text-label text-ink-2 sm:inline">
            Prices in {property.currency}
          </span>
          <TextLink href="/manage" className="text-small">
            Manage a booking
          </TextLink>
        </div>
      </PropertyHeader>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-10 px-4 pt-10 pb-16 sm:gap-12 sm:px-8 sm:pt-16 sm:pb-20">
        <section className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-end">
          <div className="flex flex-col gap-6">
            <p className="font-mono text-label tracking-[0.08em] text-ink-2 uppercase">
              Book direct with the hotel
            </p>
            <h1 className="font-display text-[clamp(2.75rem,7vw,4.75rem)] leading-[0.98] font-normal tracking-[-0.025em] text-balance">
              {words.join(' ')} {lastWord && <em>{lastWord}</em>}
            </h1>
            <dl className="flex flex-wrap gap-x-8 gap-y-3 text-small">
              <Fact label="Check in" value={`from ${property.checkInTime}`} />
              <Fact label="Check out" value={`by ${property.checkOutTime}`} />
              <Fact
                label="Cancellation"
                value={
                  property.stayRules.freeCancellationHours > 0
                    ? `Free until ${plural(property.stayRules.freeCancellationHours, 'hour')} before arrival`
                    : 'The first night is kept if you cancel'
                }
              />
            </dl>
          </div>
          <ol
            aria-label="How booking works"
            className="flex flex-col rounded-lg border border-rule bg-paper"
          >
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-4 border-b border-rule px-5 py-4 last:border-b-0"
              >
                <span className="pt-0.5 font-mono text-label text-ink-3">0{index + 1}</span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-small font-semibold text-ink">{step.title}</span>
                  <span className="text-small text-ink-2">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {property.acceptingBookings ? (
          <Suspense>
            <BookingSearch property={property} />
          </Suspense>
        ) : (
          <StatePanel eyebrow="Opening soon" title="Not taking bookings yet" className="max-w-2xl">
            {property.name} is still setting up its rooms. Its nights and prices show here as soon
            as they are ready.
          </StatePanel>
        )}
      </main>

      <PropertyFooter />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-label text-ink-3 uppercase">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
