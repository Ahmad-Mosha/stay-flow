'use client';

import type { HostReservationResponse, ReservationListResponse } from '@stay-flow/contracts';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useEffect, useEffectEvent, useState } from 'react';
import { Link, ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { api } from '@/api/client';
import { formatAmount, formatDate, formatDayTime, plural } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useServerNow } from '@/lib/use-server-now';
import { Button } from '@/ui/button';
import { cx } from '@/ui/cx';
import { SearchField } from '@/ui/search-field';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { StatusTape } from '@/ui/status-tape';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { todayAt } from '../property-time';
import {
  filtersFromSearch,
  listQuery,
  statusFilters,
  type ReservationFilters,
  type StatusFilter,
} from './reservation-filters';

export interface ReservationsViewProps {
  /** The first page for the address's filters, read by the server. */
  initial: { page: ReservationListResponse; filters: ReservationFilters };
}

/** Typing waits this long after the last key before it searches. */
const TYPING_MS = 300;

function sameFilters(a: ReservationFilters, b: ReservationFilters): boolean {
  return a.q === b.q && a.status === b.status;
}

/** Every booking, newest first, to find a guest by name, email or reference. */
export function ReservationsView({ initial }: ReservationsViewProps) {
  const { property } = useHost();
  const search = useSearchParams();
  const filters = filtersFromSearch(search);
  const [text, setText] = useState(filters.q ?? '');

  const replaceSearch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  };
  const searchFor = useEffectEvent((q: string | null) => {
    replaceSearch({ q });
  });
  useEffect(() => {
    const q = text.trim() || null;
    if (q === filters.q) return;
    const timer = setTimeout(() => {
      searchFor(q);
    }, TYPING_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text, filters.q]);

  const list = useInfiniteQuery({
    queryKey: hostKeys.reservations(property.id, filters),
    queryFn: ({ pageParam, signal }) =>
      api('listReservations', {
        params: { propertyId: property.id },
        query: listQuery(filters, pageParam),
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    ...(sameFilters(filters, initial.filters) && {
      initialData: { pages: [initial.page], pageParams: [undefined] },
    }),
    placeholderData: keepPreviousData,
  });
  const reservations = list.data?.pages.flatMap((page) => page.reservations) ?? [];
  const filtered = filters.q !== null || filters.status !== null;
  const clear = () => {
    setText('');
    replaceSearch({ q: null, status: null });
  };

  let results;
  if (list.isError && !list.data) {
    results = (
      <StatePanel
        tone="danger"
        eyebrow="Something went wrong"
        title="We could not load the bookings"
        action={
          <Button variant="secondary" onPress={() => void list.refetch()}>
            Try again
          </Button>
        }
      />
    );
  } else if (!list.data) {
    results = <ListSkeleton />;
  } else if (reservations.length === 0) {
    results = filtered ? (
      <StatePanel
        eyebrow="No matches"
        title={filters.q ? `No booking matches “${filters.q}”` : 'No bookings with this status'}
        action={
          <Button variant="secondary" onPress={clear}>
            Show every booking
          </Button>
        }
      >
        Search by the guest’s name or email, or the eight-letter reference on their confirmation.
      </StatePanel>
    ) : (
      <StatePanel eyebrow="Nothing yet" title="No bookings yet">
        Bookings made on your booking page show up here, newest first.
      </StatePanel>
    );
  } else {
    results = (
      <div
        aria-busy={list.isPlaceholderData}
        className={cx(
          'flex flex-col gap-4 transition-opacity duration-150',
          list.isPlaceholderData && 'opacity-60',
        )}
      >
        <ReservationTable reservations={reservations} />
        <ReservationCards reservations={reservations} />
        <div className="flex flex-col items-center gap-2 pt-1">
          {list.hasNextPage ? (
            <Button
              variant="secondary"
              isPending={list.isFetchingNextPage}
              onPress={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? 'Loading more' : 'Show more'}
            </Button>
          ) : (
            <p className="text-small text-ink-3">
              {filtered ? 'That is every match.' : 'That is every booking.'}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-col gap-2">
        <p className="font-mono text-label tracking-[0.04em] text-ink-3 uppercase">
          {property.name}
        </p>
        <h1 className="font-display text-[2.5rem] leading-none font-normal tracking-[-0.02em]">
          Reservations
        </h1>
      </header>

      <div className="flex flex-col gap-3">
        <SearchField
          label="Find a booking"
          placeholder="Guest name, email or reference"
          shortcut="/"
          value={text}
          onChange={setText}
          onSubmit={(value) => {
            replaceSearch({ q: value.trim() || null });
          }}
          className="w-full max-w-md"
        />
        <StatusChips
          value={filters.status ?? 'all'}
          onChange={(status) => {
            replaceSearch({ status: status === 'all' ? null : status });
          }}
        />
      </div>

      {results}
    </div>
  );
}

function StatusChips({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
}) {
  return (
    <ToggleButtonGroup
      aria-label="Status"
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const [next] = keys;
        const filter = statusFilters.find(({ id }) => id === next);
        if (filter) onChange(filter.id);
      }}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0"
    >
      {statusFilters.map((filter) => (
        <ToggleButton
          key={filter.id}
          id={filter.id}
          className="h-9 shrink-0 cursor-pointer rounded-full border border-rule-strong px-3.5 text-label font-medium whitespace-nowrap text-ink-2 outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:border-field-edge data-hovered:text-ink data-selected:border-ink data-selected:bg-ink data-selected:text-ground"
        >
          {filter.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function guestName(reservation: HostReservationResponse): string {
  return reservation.guest?.name ?? 'Held on the booking page';
}

function roomOf(reservation: HostReservationResponse): string {
  return reservation.unit
    ? `${reservation.unit.name} · ${reservation.unitType.name}`
    : reservation.unitType.name;
}

/** "29 Oct – 1 Nov", with the year when the stay is not in this one. */
function stayOf(reservation: HostReservationResponse, thisYear: string): string {
  const { checkIn, checkOut } = reservation;
  const from = formatDate(checkIn, 'dayShortMonth');
  const to = formatDate(checkOut, 'dayShortMonth');
  const [fromYear, toYear] = [checkIn.slice(0, 4), checkOut.slice(0, 4)];
  if (fromYear === thisYear && toYear === thisYear) return `${from} – ${to}`;
  if (fromYear === toYear) return `${from} – ${to} ${toYear}`;
  return `${from} ${fromYear} – ${to} ${toYear}`;
}

function ReservationTable({ reservations }: { reservations: HostReservationResponse[] }) {
  const { property } = useHost();
  const thisYear = todayAt(property.timeZone, useServerNow(60_000)).slice(0, 4);
  return (
    <div className="hidden overflow-hidden rounded-lg border border-rule bg-paper md:block">
      <table className="w-full table-fixed text-left text-small">
        <caption className="sr-only">Bookings, newest first</caption>
        <thead className="border-b border-rule font-mono text-[0.6875rem] text-ink-3 uppercase">
          <tr>
            <th scope="col" className="w-[25%] px-4 py-3 font-normal">
              Guest
            </th>
            <th scope="col" className="w-[12%] px-3 py-3 font-normal">
              Reference
            </th>
            <th scope="col" className="w-[18%] px-3 py-3 font-normal">
              Room
            </th>
            <th scope="col" className="w-[20%] px-3 py-3 font-normal">
              Stay
            </th>
            <th scope="col" className="w-[13%] px-3 py-3 font-normal">
              Status
            </th>
            <th scope="col" className="w-[12%] px-4 py-3 text-right font-normal">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {reservations.map((reservation) => (
            <tr
              key={reservation.id}
              className="relative border-b border-rule/70 transition-colors last:border-0 focus-within:bg-ground-dim/60 hover:bg-ground-dim/60"
            >
              <td className="px-4 py-3">
                <Link
                  href={routes.reservation(property.slug, reservation.id)}
                  className="block truncate font-semibold text-ink outline-hidden after:absolute after:inset-0 data-focus-visible:after:outline-2 data-focus-visible:after:-outline-offset-2 data-focus-visible:after:outline-action"
                >
                  {guestName(reservation)}
                </Link>
                <span className="block truncate text-label text-ink-3">
                  {reservation.guest?.email ??
                    `Booked ${formatDayTime(reservation.createdAt, property.timeZone)}`}
                </span>
              </td>
              <td className="px-3 py-3 font-mono text-label tracking-[0.04em] text-ink-2">
                {reservation.reference}
              </td>
              <td className="truncate px-3 py-3">{roomOf(reservation)}</td>
              <td className="px-3 py-3">
                <span className="block">{stayOf(reservation, thisYear)}</span>
                <span className="block text-label text-ink-3">
                  {plural(reservation.nights, 'night')} · {plural(reservation.guests, 'guest')}
                </span>
              </td>
              <td className="px-3 py-3">
                <StatusTape status={reservation.status} className="h-6 text-label" />
              </td>
              <td className="numerals px-4 py-3 text-right font-semibold">
                {formatAmount(reservation.totalMinor, reservation.currency)}{' '}
                <span className="text-label font-medium text-ink-3">{reservation.currency}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReservationCards({ reservations }: { reservations: HostReservationResponse[] }) {
  const { property } = useHost();
  const thisYear = todayAt(property.timeZone, useServerNow(60_000)).slice(0, 4);
  return (
    <ul aria-label="Bookings, newest first" className="flex flex-col gap-2.5 md:hidden">
      {reservations.map((reservation) => (
        <li key={reservation.id}>
          <Link
            href={routes.reservation(property.slug, reservation.id)}
            className="flex flex-col gap-2 rounded-lg border border-rule bg-paper p-4 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-pressed:bg-ground-dim"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0 truncate font-semibold">{guestName(reservation)}</span>
              <StatusTape status={reservation.status} className="h-6 shrink-0 text-label" />
            </span>
            <span className="text-small text-ink-2">
              {roomOf(reservation)} · {stayOf(reservation, thisYear)}
            </span>
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-label tracking-[0.04em] text-ink-3">
                {reservation.reference}
              </span>
              <span className="numerals text-small font-semibold">
                {formatAmount(reservation.totalMinor, reservation.currency)}{' '}
                <span className="text-label font-medium text-ink-3">{reservation.currency}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading bookings" className="flex flex-col gap-2">
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-16 rounded-md" />
      ))}
    </div>
  );
}

export function ReservationsSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading bookings"
      className="flex flex-col gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-10 w-64 max-w-full" />
      </div>
      <Skeleton className="h-10 w-full max-w-sm" />
      <ListSkeleton />
    </div>
  );
}
