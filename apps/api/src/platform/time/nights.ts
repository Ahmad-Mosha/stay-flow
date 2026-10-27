import type { Nights } from '@stay-flow/contracts';
import { Temporal } from 'temporal-polyfill';
import { type DateSpan, dateSpan } from './date-span.js';

/** The span of a request's `{ from, to }` nights, which validation has already put in order. */
export function fromNights(nights: Nights): DateSpan {
  return dateSpan(Temporal.PlainDate.from(nights.from), Temporal.PlainDate.from(nights.to));
}

/** A span as the API's `{ from, to }` nights. */
export function toNights(span: DateSpan): Nights {
  return { from: span.start.toString(), to: span.end.toString() };
}
