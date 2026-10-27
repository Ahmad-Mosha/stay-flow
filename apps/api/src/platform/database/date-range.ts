import { Temporal } from 'temporal-polyfill';
import { type DateSpan, dateSpan } from '../time/date-span.js';

const DATE_RANGE_PATTERN = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})\)$/;

/** Formats a span as a PostgreSQL daterange literal, e.g. `[2026-12-01,2026-12-04)`. */
export function toDateRange(span: DateSpan): string {
  return `[${span.start.toString()},${span.end.toString()})`;
}

/** Parses the canonical daterange text PostgreSQL returns for bounded ranges. */
export function fromDateRange(value: string): DateSpan {
  const [, start, end] = DATE_RANGE_PATTERN.exec(value) ?? [];
  if (start === undefined || end === undefined) {
    throw new TypeError(`Not a bounded daterange: ${value}`);
  }
  return dateSpan(Temporal.PlainDate.from(start), Temporal.PlainDate.from(end));
}
