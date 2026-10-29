'use client';

import type { HostReservationDetailResponse } from '@stay-flow/contracts';
import { Link } from 'react-aria-components';
import { routes } from '@/lib/routes';
import { ArrowLeftIcon, CalendarIcon } from '@/ui/icons';
import { useHost } from '../host-context';
import { defaultStart } from '../calendar/tape';
import { ReservationDetail } from './reservation-detail';

const linkClass =
  'inline-flex h-10 items-center gap-2 rounded-md px-2 text-small font-medium text-ink-2 outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink';

/** A booking on its own page, to share with the team or open from the list. */
export function ReservationPage({ initial }: { initial: HostReservationDetailResponse }) {
  const { property } = useHost();
  const calendarQuery = new URLSearchParams({
    from: defaultStart(initial.checkIn),
    reservation: initial.id,
  }).toString();
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-8 lg:py-8">
      <nav aria-label="Booking" className="-mx-2 flex flex-wrap items-center justify-between gap-2">
        <Link href={routes.reservations(property.slug)} className={linkClass}>
          <ArrowLeftIcon className="size-4" />
          Reservations
        </Link>
        <Link href={routes.calendar(property.slug, calendarQuery)} className={linkClass}>
          <CalendarIcon className="size-4" />
          Show on the calendar
        </Link>
      </nav>
      <div className="rounded-lg border border-rule bg-paper">
        <ReservationDetail reservationId={initial.id} initial={initial} headingLevel={1} />
      </div>
    </div>
  );
}
