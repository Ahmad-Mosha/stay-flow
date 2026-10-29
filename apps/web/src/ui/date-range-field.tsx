'use client';

import { parseDate } from '@internationalized/date';
import { useState } from 'react';
import {
  Button,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  DateInput,
  DateRangePicker,
  DateSegment,
  Dialog,
  FieldError,
  Group,
  Heading,
  Label,
  Popover,
  RangeCalendar,
  Text,
  type DateRangePickerProps,
  type DateValue,
  type RangeValue,
} from 'react-aria-components';
import { cx } from './cx';
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from './icons';

/** Dates as the API takes them: `start` is the first night, `end` the morning after the last. */
export interface DateRange {
  start: string;
  end: string;
}

interface DateRangeFieldProps extends Omit<
  DateRangePickerProps<DateValue>,
  'value' | 'onChange' | 'minValue' | 'className' | 'children'
> {
  label: string;
  description?: string | undefined;
  errorMessage?: string | undefined;
  value: DateRange | null;
  onChange: (range: DateRange) => void;
  /** The earliest date that can be picked. */
  minValue?: string | undefined;
  className?: string;
}

const segmentClass =
  'rounded-[3px] px-0.5 tabular-nums outline-hidden data-placeholder:text-ink-3 data-focused:bg-action data-focused:text-action-ink data-type-literal:px-0';

const navButton =
  'flex size-10 cursor-pointer items-center justify-center rounded-md border border-rule bg-raised text-ink outline-hidden data-disabled:cursor-default data-disabled:opacity-40 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:border-field-edge';

/**
 * Two dates typed or picked on a month grid. A single tapped day counts as one night, so the
 * range always covers at least one.
 */
export function DateRangeField({
  label,
  description,
  errorMessage,
  value,
  onChange,
  minValue,
  className,
  ...props
}: DateRangeFieldProps) {
  // The field keeps what is typed, even a half-typed end before the start (year 2 on the way to
  // 2027), and only whole ranges go up. It follows `value` when the parent changes it.
  const [shown, setShown] = useState(() => toPickerRange(value));
  const [synced, setSynced] = useState(value);
  if (value?.start !== synced?.start || value?.end !== synced?.end) {
    setSynced(value);
    setShown(toPickerRange(value));
  }

  return (
    <DateRangePicker
      {...props}
      value={shown}
      onChange={(range) => {
        if (!range || range.end.compare(range.start) < 0) {
          setShown(range);
          return;
        }
        const end = range.end.compare(range.start) > 0 ? range.end : range.start.add({ days: 1 });
        const next = { start: range.start.toString(), end: end.toString() };
        setShown({ start: range.start, end });
        setSynced(next);
        onChange(next);
      }}
      {...(minValue && { minValue: parseDate(minValue) })}
      className={cx('group flex flex-col gap-2', className)}
    >
      <Label className="text-small font-semibold text-ink">{label}</Label>
      <Group className="flex h-12 items-center gap-1 rounded-md border border-field-edge bg-raised pr-1 pl-4 text-body text-ink transition-[border-color,box-shadow] duration-150 group-data-invalid:border-danger data-disabled:opacity-50 data-focus-within:border-action data-focus-within:ring-1 data-focus-within:ring-action data-hovered:not-data-focus-within:border-ink-2">
        <DateInput slot="start" className="flex">
          {(segment) => <DateSegment segment={segment} className={segmentClass} />}
        </DateInput>
        <span aria-hidden="true" className="px-1.5 text-ink-3">
          –
        </span>
        <DateInput slot="end" className="flex flex-1">
          {(segment) => <DateSegment segment={segment} className={segmentClass} />}
        </DateInput>
        <Button className="flex size-10 cursor-pointer items-center justify-center rounded-sm text-ink-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink data-pressed:bg-ground-dim">
          <CalendarIcon className="size-4.5" />
        </Button>
      </Group>
      {description && (
        <Text slot="description" className="text-small text-ink-3">
          {description}
        </Text>
      )}
      <FieldError className="text-small text-danger">{errorMessage}</FieldError>
      <Popover
        offset={6}
        placement="bottom end"
        className="rounded-lg border border-rule bg-paper p-4 shadow-overlay outline-hidden data-entering:animate-popover-in"
      >
        <Dialog className="outline-hidden">
          <RangeCalendar className="flex w-[19rem] flex-col gap-3">
            <header className="flex items-center justify-between gap-2">
              <Button slot="previous" className={navButton}>
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Heading className="font-display text-[1.25rem] font-normal" />
              <Button slot="next" className={navButton}>
                <ChevronRightIcon className="size-4" />
              </Button>
            </header>
            <CalendarGrid weekdayStyle="short" className="w-full border-collapse">
              <CalendarGridHeader>
                {(day) => (
                  <CalendarHeaderCell className="pb-1.5 font-mono text-[0.6875rem] font-normal text-ink-3 uppercase">
                    {day}
                  </CalendarHeaderCell>
                )}
              </CalendarGridHeader>
              <CalendarGridBody>
                {(date) => (
                  <CalendarCell
                    date={date}
                    className={cx(
                      'flex h-10 cursor-pointer items-center justify-center text-small font-medium text-ink outline-hidden',
                      'data-today:underline data-today:decoration-2 data-today:underline-offset-4',
                      'data-hovered:bg-ground-dim data-focus-visible:outline-2 data-focus-visible:-outline-offset-2 data-focus-visible:outline-action',
                      'data-selected:bg-action-wash',
                      'data-selection-start:rounded-l-sm data-selection-start:bg-action data-selection-start:text-action-ink',
                      'data-selection-end:rounded-r-sm data-selection-end:bg-action data-selection-end:text-action-ink',
                      'data-disabled:cursor-default data-disabled:text-ink-3 data-disabled:opacity-50',
                      'data-outside-month:invisible',
                    )}
                  />
                )}
              </CalendarGridBody>
            </CalendarGrid>
          </RangeCalendar>
        </Dialog>
      </Popover>
    </DateRangePicker>
  );
}

function toPickerRange(range: DateRange | null): RangeValue<DateValue> | null {
  return range ? { start: parseDate(range.start), end: parseDate(range.end) } : null;
}
