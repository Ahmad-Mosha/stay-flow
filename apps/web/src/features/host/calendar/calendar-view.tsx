'use client';

import type { HostUnitTypeListResponse, RoomCalendarResponse } from '@stay-flow/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useRef, useState, type ReactNode } from 'react';
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { api } from '@/api/client';
import { formatDate, formatTime, plural } from '@/lib/format';
import { useMediaQuery } from '@/lib/use-media-query';
import { useServerNow } from '@/lib/use-server-now';
import { Button } from '@/ui/button';
import { cx } from '@/ui/cx';
import { ChevronLeftIcon, ChevronRightIcon } from '@/ui/icons';
import { Notice, type NoticeMessage } from '@/ui/notice';
import { Segmented } from '@/ui/segmented';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { Hint } from '@/ui/tooltip';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { todayAt } from '../property-time';
import { ReservationDetail } from '../reservations/reservation-detail';
import { BlockDialog, type BlockDraft } from './block-dialog';
import { BlockPanel, type BlockDetails } from './block-panel';
import {
  calendarViews,
  defaultStart,
  shiftWindow,
  windowFor,
  windowFromSearch,
  windowLabel,
  windowOf,
  type CalendarView as View,
  type CalendarWindow,
} from './tape';
import { TapeChart, type Selection } from './tape-chart';

/** Other staff take bookings and check guests in meanwhile, so the chart reads itself again. */
const REFRESH_MS = 30_000;

export interface CalendarViewProps {
  /** Read by the server for the first paint. */
  initial: { calendar: RoomCalendarResponse; unitTypes: HostUnitTypeListResponse };
}

function selectionFrom(search: URLSearchParams): Selection | null {
  const reservation = search.get('reservation');
  if (reservation) return { kind: 'stay', id: reservation };
  const block = search.get('block');
  return block ? { kind: 'block', id: block } : null;
}

function findBlock(calendar: RoomCalendarResponse, id: string): BlockDetails | null {
  for (const unitType of calendar.unitTypes) {
    for (const unit of unitType.units) {
      const bar = unit.bars.find((candidate) => candidate.kind === 'block' && candidate.id === id);
      if (bar?.kind === 'block') {
        return { ...bar, roomName: unit.name, unitTypeName: unitType.name };
      }
    }
  }
  return null;
}

/**
 * The room calendar. What it shows lives in the address (`?view=month&from=…&reservation=…`), so
 * a reload or a shared link opens the same dates and the same booking.
 */
export function CalendarView({ initial }: CalendarViewProps) {
  const { property } = useHost();
  const now = useServerNow(15_000);
  const today = todayAt(property.timeZone, now);
  const search = useSearchParams();
  const range = windowFromSearch({ view: search.get('view'), from: search.get('from') }, today);
  const selection = selectionFrom(search);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const done = (text: string) => {
    setNotice({ text, tone: 'done' });
  };
  const [blocking, setBlocking] = useState<{ draft: BlockDraft | null } | null>(null);
  // Side by side from 80rem; below that the panel slides over the chart.
  const wide = useMediaQuery('(min-width: 80rem)');
  const focusPanel = useRef(false);

  const calendarQuery = useQuery({
    queryKey: hostKeys.calendar(property.id, range.from, range.to),
    queryFn: ({ signal }) =>
      api('getRoomCalendar', {
        params: { propertyId: property.id },
        query: { from: range.from, to: range.to },
        signal,
      }),
    initialData:
      initial.calendar.nights.from === range.from && initial.calendar.nights.to === range.to
        ? initial.calendar
        : undefined,
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  });
  const unitTypesQuery = useQuery({
    queryKey: hostKeys.unitTypes(property.id),
    queryFn: ({ signal }) => api('listUnitTypes', { params: { propertyId: property.id }, signal }),
    initialData: initial.unitTypes,
  });
  const calendar = calendarQuery.data;
  const rooms = (calendar ?? initial.calendar).unitTypes;
  const roomCount = rooms.reduce((count, unitType) => count + unitType.units.length, 0);

  const replaceSearch = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    // Next.js syncs `useSearchParams` with the history API, without a server round trip.
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
  };

  const showWindow = (next: CalendarWindow) => {
    const fallback = windowFromSearch({ view: next.view }, today);
    replaceSearch({
      view: next.view === '3w' ? null : next.view,
      from: next.from === fallback.from ? null : next.from,
    });
  };

  const changeView = (view: View) => {
    const showsToday = range.from <= today && today < range.to;
    const anchor = showsToday ? (view === 'month' ? today : defaultStart(today)) : range.from;
    showWindow(windowFor(view, anchor));
  };

  const select = (next: Selection | null) => {
    replaceSearch({
      reservation: next?.kind === 'stay' ? next.id : null,
      block: next?.kind === 'block' ? next.id : null,
    });
  };

  const closePanel = () => {
    const bar = selection?.id;
    select(null);
    if (bar) document.querySelector<HTMLElement>(`[data-bar="${bar}"]`)?.focus();
  };

  const block = selection?.kind === 'block' && calendar ? findBlock(calendar, selection.id) : null;
  let panel: ReactNode = null;
  if (selection?.kind === 'stay') {
    panel = (
      <ReservationDetail key={selection.id} reservationId={selection.id} onClose={closePanel} />
    );
  } else if (block) {
    panel = (
      <BlockPanel
        key={block.id}
        block={block}
        today={today}
        onClose={closePanel}
        onReleased={(message) => {
          done(message);
          select(null);
        }}
      />
    );
  }
  const stepWord = range.view === 'month' ? 'month' : 'week';

  return (
    <div className="flex flex-col gap-5 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-label tracking-[0.04em] text-ink-3 uppercase">
            {property.name} · {plural(roomCount, 'room')}
          </p>
          <h1 className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-display text-[2.5rem] leading-none font-normal tracking-[-0.02em]">
              Calendar
            </span>
            <span className="font-mono text-small font-normal text-ink-2">
              {windowLabel(range, (date) => formatDate(date, 'dayShortMonth'))}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              showWindow(windowFromSearch({ view: range.view }, today));
            }}
          >
            Today
          </Button>
          <StepButton
            label={`Previous ${stepWord}`}
            onPress={() => {
              showWindow(shiftWindow(range, -1));
            }}
          >
            <ChevronLeftIcon className="size-4" />
          </StepButton>
          <StepButton
            label={`Next ${stepWord}`}
            onPress={() => {
              showWindow(shiftWindow(range, 1));
            }}
          >
            <ChevronRightIcon className="size-4" />
          </StepButton>
          <Segmented
            label="How much to show"
            options={calendarViews}
            value={range.view}
            onChange={changeView}
          />
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setBlocking({ draft: null });
            }}
          >
            Block dates
          </Button>
        </div>
      </header>

      <Legend />

      {calendarQuery.isRefetchError && (
        <p role="status" className="text-small text-danger">
          Could not refresh. Showing the calendar as of{' '}
          {formatTime(calendarQuery.dataUpdatedAt, property.timeZone)}.
        </p>
      )}

      <div
        className={cx('grid items-start gap-5', wide && panel && 'grid-cols-[minmax(0,1fr)_23rem]')}
      >
        <div
          aria-busy={calendarQuery.isFetching && calendarQuery.isPlaceholderData}
          className={cx(
            'min-w-0 transition-opacity duration-150',
            calendarQuery.isPlaceholderData && 'opacity-60',
          )}
        >
          {calendar ? (
            <TapeChart
              calendar={calendar}
              unitTypes={unitTypesQuery.data.unitTypes}
              range={windowOf(calendar.nights, range.view)}
              today={today}
              now={now}
              currency={property.currency}
              selected={selection}
              onSelect={(next) => {
                focusPanel.current = true;
                select(next);
              }}
              onPickNights={({ unitId, from, to }) => {
                setBlocking({ draft: { unitId, nights: { from, to } } });
              }}
              onAnnounce={(text) => {
                setNotice({ text, tone: 'warning' });
              }}
            />
          ) : calendarQuery.isError ? (
            <StatePanel
              tone="danger"
              eyebrow="Something went wrong"
              title="We could not load the calendar"
              headingLevel={2}
              action={
                <Button variant="secondary" onPress={() => void calendarQuery.refetch()}>
                  Try again
                </Button>
              }
            />
          ) : (
            <ChartSkeleton />
          )}
        </div>

        {wide && panel && (
          // A dialog that leaves the chart usable beside it, so the keyboard can move between both.
          <section
            role="dialog"
            aria-modal="false"
            aria-label={selection?.kind === 'block' ? 'Block' : 'Booking'}
            tabIndex={-1}
            ref={(element) => {
              if (!element) return;
              // Opening a booking from the chart takes the keyboard to it; Escape comes back.
              if (focusPanel.current) {
                focusPanel.current = false;
                element.focus();
              }
              // A native listener: Escape in the cancel dialog, a portal, does not bubble here.
              const onKeyDown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') closePanel();
              };
              element.addEventListener('keydown', onKeyDown);
              return () => {
                element.removeEventListener('keydown', onKeyDown);
              };
            }}
            className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto rounded-lg border border-rule bg-paper outline-hidden"
          >
            {panel}
          </section>
        )}
      </div>

      <ModalOverlay
        isOpen={!wide && panel !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) select(null);
        }}
        isDismissable
        className="fixed inset-0 z-50 flex items-end justify-end bg-[color-mix(in_oklab,var(--color-ink)_45%,transparent)] sm:items-stretch data-entering:animate-overlay-in data-exiting:animate-overlay-out"
      >
        <Modal className="max-h-[92dvh] w-full overflow-y-auto rounded-t-lg border border-rule bg-paper shadow-overlay sm:max-h-none sm:max-w-md sm:rounded-none sm:border-y-0 sm:border-r-0 data-entering:animate-dialog-in data-exiting:animate-dialog-out sm:data-entering:animate-sheet-in sm:data-exiting:animate-sheet-out">
          <AriaDialog
            aria-label={selection?.kind === 'block' ? 'Block' : 'Booking'}
            className="outline-hidden"
          >
            {panel}
          </AriaDialog>
        </Modal>
      </ModalOverlay>

      <Notice
        message={notice}
        onDismiss={() => {
          setNotice(null);
        }}
      />

      {blocking && (
        <BlockDialog
          isOpen
          onOpenChange={(isOpen) => {
            if (!isOpen) setBlocking(null);
          }}
          rooms={rooms}
          today={today}
          draft={blocking.draft}
          onBlocked={(_, message) => {
            done(message);
          }}
        />
      )}
    </div>
  );
}

function StepButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Hint label={label} placement="bottom">
      <AriaButton
        aria-label={label}
        onPress={onPress}
        className="flex size-10 cursor-pointer items-center justify-center rounded-md border border-rule-strong bg-raised text-ink outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:border-field-edge"
      >
        {children}
      </AriaButton>
    </Hint>
  );
}

const legend = [
  { label: 'In house', swatch: 'border-tape-in bg-tape-in' },
  { label: 'Confirmed', swatch: 'border-rule-strong bg-tape-stay' },
  {
    label: 'Arrives or leaves today',
    swatch: 'border-rule-strong bg-tape-stay',
    cap: true,
  },
  { label: 'Held', swatch: 'tape-hold border-hold' },
  { label: 'Blocked', swatch: 'tape-block border-block-line' },
  { label: 'No-show', swatch: 'border-[1.5px] border-danger' },
  { label: 'Checked out', swatch: 'border-dashed border-rule-strong' },
];

function Legend() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4.5 gap-y-2">
        {legend.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-label text-ink-2">
            <span
              aria-hidden="true"
              className={cx('relative h-3 w-5.5 rounded-[3px] border', item.swatch)}
            >
              {item.cap && (
                <span className="absolute top-px left-px h-2 w-[3px] rounded-[1px] bg-action" />
              )}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
      <p className="hidden text-label text-ink-3 pointer-fine:block">
        Drag across empty nights to block a room · arrow keys move between stays
      </p>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading the calendar" className="flex flex-col gap-2">
      <Skeleton className="h-14 rounded-lg" />
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton key={index} className="h-11 rounded-md" />
      ))}
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading the calendar"
      className="flex flex-col gap-5 px-4 py-6 sm:px-8 lg:px-10 lg:py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-10 w-72 max-w-full" />
      </div>
      <Skeleton className="h-4 w-full max-w-2xl" />
      <Skeleton className="h-[34rem] rounded-lg" />
    </div>
  );
}
