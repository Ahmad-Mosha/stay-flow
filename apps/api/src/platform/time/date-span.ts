import { Temporal } from 'temporal-polyfill';

/** Calendar dates from `start` (included) to `end` (excluded), like the nights of a stay. */
export interface DateSpan {
  readonly start: Temporal.PlainDate;
  readonly end: Temporal.PlainDate;
}

export function dateSpan(start: Temporal.PlainDate, end: Temporal.PlainDate): DateSpan {
  if (Temporal.PlainDate.compare(start, end) >= 0) {
    throw new RangeError(
      `A date span must end after it starts: ${start.toString()}..${end.toString()}`,
    );
  }
  return { start, end };
}

export function spanContains(span: DateSpan, date: Temporal.PlainDate): boolean {
  return (
    Temporal.PlainDate.compare(span.start, date) <= 0 &&
    Temporal.PlainDate.compare(date, span.end) < 0
  );
}

export function nightCount(span: DateSpan): number {
  return span.start.until(span.end, { largestUnit: 'days' }).days;
}

export function nightsOf(span: DateSpan): Temporal.PlainDate[] {
  const nights: Temporal.PlainDate[] = [];
  for (let night = span.start; spanContains(span, night); night = night.add({ days: 1 })) {
    nights.push(night);
  }
  return nights;
}
