'use client';

import { parseDate, today, type CalendarDate } from '@internationalized/date';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Button,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
  RangeCalendar,
} from 'react-aria-components';
import { api } from '@/api/client';
import { formatAmount } from '@/lib/format';
import { useIsClient } from '@/lib/use-is-client';
import { Skeleton } from '@/ui/skeleton';
import { cx } from '@/ui/cx';

export interface StayDates {
  checkIn: string;
  checkOut: string;
}

interface PriceCalendarProps {
  slug: string;
  timeZone: string;
  guests: number;
  value: StayDates | null;
  onChange: (dates: StayDates) => void;
  className?: string;
}

function monthOf(date: CalendarDate): string {
  return date.toString().slice(0, 7);
}

const navButton =
  'flex size-11 items-center justify-center rounded-md border border-rule bg-raised text-ink outline-hidden transition-colors data-disabled:opacity-40 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-solid data-focus-visible:outline-action data-hovered:border-field-edge';

/**
 * Picks the stay's dates on a month grid that shows each night's lowest price. Checking out on a
 * night that is full is fine, so full nights stay selectable and the results explain the rest.
 */
export function PriceCalendar({
  slug,
  timeZone,
  guests,
  value,
  onChange,
  className,
}: PriceCalendarProps) {
  const [focused, setFocused] = useState<CalendarDate>(() =>
    value ? parseDate(value.checkIn) : today(timeZone),
  );
  const month = monthOf(focused);
  const isClient = useIsClient();

  const { data } = useQuery({
    queryKey: ['availability-calendar', slug, month, guests],
    queryFn: ({ signal }) =>
      api('getAvailabilityCalendar', { params: { slug }, query: { month, guests }, signal }),
    placeholderData: keepPreviousData,
  });
  const nights = new Map(data?.nights.map((night) => [night.date, night]));
  const earliest = data ? parseDate(data.checkInWindow.earliest) : today(timeZone);

  if (!isClient) return <CalendarPlaceholder className={className} />;

  return (
    <RangeCalendar
      aria-label="Stay dates"
      value={value ? { start: parseDate(value.checkIn), end: parseDate(value.checkOut) } : null}
      onChange={({ start, end }) => {
        // A stay is at least one night, so a single tapped day means "check in here".
        const checkOut = end.compare(start) > 0 ? end : start.add({ days: 1 });
        onChange({ checkIn: start.toString(), checkOut: checkOut.toString() });
      }}
      minValue={earliest}
      focusedValue={focused}
      onFocusChange={setFocused}
      className={cx('flex flex-col gap-4', className)}
    >
      <header className="flex items-center justify-between gap-2">
        <Button slot="previous" className={navButton}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <polyline points="15 5 8 12 15 19" />
          </svg>
        </Button>
        <Heading className="font-display text-heading font-normal sm:text-[1.625rem]" />
        <Button slot="next" className={navButton}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <polyline points="9 5 16 12 9 19" />
          </svg>
        </Button>
      </header>
      <CalendarGrid weekdayStyle="short" className="w-full border-separate border-spacing-1">
        <CalendarGridHeader>
          {(day) => (
            <CalendarHeaderCell className="pb-1 font-mono text-[0.6875rem] font-normal text-ink-3 uppercase">
              {day}
            </CalendarHeaderCell>
          )}
        </CalendarGridHeader>
        <CalendarGridBody>
          {(date) => {
            const night = nights.get(date.toString());
            return (
              <CalendarCell
                date={date}
                className={cx(
                  'flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-sm border border-transparent bg-raised text-ink outline-hidden transition-colors',
                  'data-hovered:border-field-edge data-focus-visible:outline-2 data-focus-visible:outline-offset-1 data-focus-visible:outline-solid data-focus-visible:outline-action',
                  'data-selected:border-action-wash data-selected:bg-action-wash',
                  'data-selection-start:border-action data-selection-start:bg-action data-selection-start:text-action-ink',
                  'data-selection-end:border-action data-selection-end:bg-raised data-selection-end:text-action',
                  'data-disabled:cursor-default data-disabled:bg-transparent data-disabled:text-ink-3 data-disabled:opacity-60',
                  'data-outside-month:invisible',
                )}
              >
                {({ formattedDate, isSelectionStart, isSelectionEnd, isDisabled }) => (
                  <>
                    <span className="text-small font-semibold leading-none">{formattedDate}</span>
                    <span
                      aria-hidden="true"
                      className={cx(
                        'numerals h-3.5 font-mono text-[0.625rem] leading-3.5',
                        isSelectionStart
                          ? 'text-action-ink'
                          : isSelectionEnd
                            ? 'text-action'
                            : 'text-ink-2',
                        night && !night.available && !isSelectionEnd && 'text-ink-3 line-through',
                      )}
                    >
                      {isSelectionEnd && !isSelectionStart
                        ? 'OUT'
                        : isDisabled || !night
                          ? ''
                          : night.available && night.fromRateMinor !== null && data
                            ? formatAmount(night.fromRateMinor, data.currency)
                            : 'full'}
                    </span>
                  </>
                )}
              </CalendarCell>
            );
          }}
        </CalendarGridBody>
      </CalendarGrid>
    </RangeCalendar>
  );
}

function CalendarPlaceholder({ className }: { className?: string | undefined }) {
  return (
    <div aria-hidden="true" className={cx('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="size-11 rounded-md" />
        <Skeleton className="h-6 w-36" />
        <Skeleton className="size-11 rounded-md" />
      </div>
      <div className="grid grid-cols-7 gap-1 p-1">
        {Array.from({ length: 35 }, (_, index) => (
          <Skeleton key={index} className="h-14 rounded-sm" />
        ))}
      </div>
    </div>
  );
}
