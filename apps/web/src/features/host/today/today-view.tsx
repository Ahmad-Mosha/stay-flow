'use client';

import type { RoomCalendarResponse, TodayResponse } from '@stay-flow/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api } from '@/api/client';
import { formatDate, formatTime, zoneCity } from '@/lib/format';
import { useServerNow } from '@/lib/use-server-now';
import { Skeleton } from '@/ui/skeleton';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { Arrivals, Departures, InHouse } from './front-desk-lists';
import { MonthCard } from './month-card';
import { roomsTonight, tonightRange } from './rooms-tonight';
import { TonightCard } from './tonight-card';

/** The front desk keeps this page open all day, so it reads the day again every half minute. */
const REFRESH_MS = 30_000;

export interface TodayViewProps {
  /** Read by the server for the first paint. */
  initial: { today: TodayResponse; calendar: RoomCalendarResponse };
}

export function TodayView({ initial }: TodayViewProps) {
  const { property } = useHost();
  const queryClient = useQueryClient();
  const now = useServerNow(15_000);
  const [announcement, setAnnouncement] = useState('');

  const todayQuery = useQuery({
    queryKey: hostKeys.today(property.id),
    queryFn: ({ signal }) => api('getToday', { params: { propertyId: property.id }, signal }),
    initialData: initial.today,
    refetchInterval: REFRESH_MS,
  });
  const today = todayQuery.data;
  const range = tonightRange(today.date);

  const calendarQuery = useQuery({
    queryKey: hostKeys.calendar(property.id, range.from, range.to),
    queryFn: ({ signal }) =>
      api('getRoomCalendar', { params: { propertyId: property.id }, query: range, signal }),
    // The server's calendar is for tonight unless the day turned over since.
    initialData: initial.calendar.nights.from === range.from ? initial.calendar : undefined,
    refetchInterval: REFRESH_MS,
  });
  const rooms = calendarQuery.data ? roomsTonight(calendarQuery.data, today.date) : null;

  // A hold that runs out frees its room: read the day again the moment that happens.
  const nextExpiry = Math.min(
    ...(rooms ?? []).flatMap(({ state }) => (state.kind === 'held' ? [state.expiresAt] : [])),
  );
  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    const timer = setTimeout(
      () => {
        void queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });
      },
      Math.max(nextExpiry - Date.now(), 0) + 1000,
    );
    return () => {
      clearTimeout(timer);
    };
  }, [nextExpiry, property.id, queryClient]);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:gap-7 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-label tracking-[0.04em] text-ink-3 uppercase">
            {formatDate(today.date, 'weekdayLong')} · {zoneCity(property.timeZone)}{' '}
            <time suppressHydrationWarning dateTime={new Date(now).toISOString()}>
              {formatTime(now, property.timeZone)}
            </time>
          </p>
          <h1 className="font-display text-[2.5rem] leading-none font-normal tracking-[-0.02em] sm:text-[3rem]">
            Today, {formatDate(today.date, 'dayMonth')}
          </h1>
        </div>
        {todayQuery.isRefetchError && (
          <p role="status" className="text-small text-danger">
            Could not refresh. Showing the day as of{' '}
            {formatTime(todayQuery.dataUpdatedAt, property.timeZone)}.
          </p>
        )}
      </header>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      {/* Two columns from extra-large screens: the day's work, and a rail beside it. */}
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          {rooms ? (
            <TonightCard tonight={today.tonight} rooms={rooms} now={now} />
          ) : (
            <Skeleton className="h-72 rounded-lg" />
          )}
          <Arrivals today={today} property={property} onDone={setAnnouncement} />
          <Departures today={today} property={property} onDone={setAnnouncement} />
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <div className="order-2 xl:order-1">
            <MonthCard month={today.thisMonth} rooms={today.tonight.rooms} />
          </div>
          <div className="order-1 xl:order-2">
            <InHouse today={today} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TodaySkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading today"
      className="flex flex-col gap-7 px-4 py-6 sm:px-8 lg:px-10 lg:py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-12 w-80 max-w-full" />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
        <div className="flex flex-col gap-5">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-80 rounded-lg" />
          <Skeleton className="h-56 rounded-lg" />
        </div>
      </div>
    </div>
  );
}
