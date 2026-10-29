import type { Route } from 'next';
import { plural } from '@/lib/format';
import { routes } from '@/lib/routes';
import { cx } from '@/ui/cx';
import { ButtonLink, TextLink } from '@/ui/link';
import { useHost } from '../host-context';
import { canManage } from '../permissions';

interface Step {
  title: string;
  body: string;
  href: Route;
  action: string;
}

/**
 * Today, for a property with no rooms yet: the steps to its first booking, in order. It gives way
 * to the front desk as soon as there is a room to sell.
 */
export function SetupGuide() {
  const { property } = useHost();
  const { slug, stayRules, checkInTime, checkOutTime } = property;
  const steps: Step[] = [
    {
      title: 'Add your rooms',
      body: 'Each type of room, such as a Garden Double, with its price a night and its rooms. Guests can book as soon as there is one.',
      href: routes.rooms(slug),
      action: 'Add rooms',
    },
    {
      title: 'Set seasonal rates',
      body: 'Optional. Charge more over the holidays, or less in the quiet months.',
      href: routes.rates(slug),
      action: 'Open rates',
    },
    {
      title: 'Check the house rules',
      body: `Check-in from ${checkInTime}, check-out by ${checkOutTime}, stays of ${String(stayRules.minNights)} to ${plural(stayRules.maxNights, 'night')}, and free cancellation until ${plural(stayRules.freeCancellationHours, 'hour')} before arrival.`,
      href: routes.settings(slug),
      action: 'Open settings',
    },
    {
      title: 'Bring in your team',
      body: 'Add a manager, or the people on the front desk, with the email they signed up with.',
      href: routes.team(slug),
      action: 'Open team',
    },
  ];

  if (!canManage(property.role, 'inventory')) {
    return (
      <section
        aria-labelledby="setup-title"
        className="flex flex-col gap-2 rounded-lg border border-rule bg-paper p-6 sm:p-8"
      >
        <h2 id="setup-title" className="font-display text-headline font-normal">
          No rooms yet
        </h2>
        <p className="text-small text-ink-2">
          {property.name} has no rooms to sell yet. Once an owner or manager adds them, arrivals,
          departures and tonight’s rooms show here.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="setup-title"
      className="grid gap-8 rounded-lg border border-rule bg-paper p-6 sm:p-8 xl:grid-cols-[18rem_minmax(0,1fr)] xl:gap-12"
    >
      <div className="flex flex-col gap-3">
        <p className="font-mono text-label tracking-[0.06em] text-ink-3 uppercase">
          Getting started
        </p>
        <h2 id="setup-title" className="font-display text-[2rem] leading-[1.05] font-normal">
          A few steps to your first booking
        </h2>
        <p className="text-small text-ink-2">
          Your booking page is at{' '}
          <TextLink href={routes.property(slug)} className="font-mono">
            /stay/{slug}
          </TextLink>
          . It takes bookings once there is a room to sell.
        </p>
      </div>
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 gap-y-3 border-t border-rule py-5 first:border-t-0 first:pt-0 last:pb-0 sm:grid-cols-[2rem_minmax(0,1fr)_auto] sm:items-center"
          >
            <span
              className={cx(
                'flex size-8 items-center justify-center rounded-full font-mono text-label',
                index === 0 ? 'bg-action text-action-ink' : 'border border-rule-strong text-ink-2',
              )}
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-small text-ink-2">{step.body}</p>
            </div>
            <ButtonLink
              href={step.href}
              variant={index === 0 ? 'primary' : 'secondary'}
              size="sm"
              className="col-start-2 justify-self-start sm:col-start-3"
            >
              {step.action}
            </ButtonLink>
          </li>
        ))}
      </ol>
    </section>
  );
}
