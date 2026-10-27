import type { Temporal } from 'temporal-polyfill';
import type { DateSpan } from '../../platform/time/date-span.js';
import type { FreeUnit } from './inventory.repository.js';

interface Fit {
  /** How many of the stay's ends meet a neighbouring stay or block: 0, 1 or 2. */
  readonly touching: number;
  /** Free nights left around the stay in this room; Infinity when a side has no neighbour. */
  readonly leftover: number;
}

/**
 * Orders free rooms best fit first: rooms where the stay meets its neighbours, then the one
 * that leaves the fewest free nights around it, then by name. Filling gaps tightly keeps long
 * free runs open for long stays.
 */
export function bestFitOrder(stay: DateSpan, units: readonly FreeUnit[]): FreeUnit[] {
  return units
    .map((unit) => ({ unit, fit: fitOf(stay, unit) }))
    .sort(
      (a, b) =>
        b.fit.touching - a.fit.touching ||
        compareNumbers(a.fit.leftover, b.fit.leftover) ||
        a.unit.name.localeCompare(b.unit.name, 'en', { numeric: true }),
    )
    .map(({ unit }) => unit);
}

function fitOf(stay: DateSpan, unit: FreeUnit): Fit {
  const before = unit.freeFrom === null ? Infinity : daysBetween(unit.freeFrom, stay.start);
  const after = unit.freeUntil === null ? Infinity : daysBetween(stay.end, unit.freeUntil);
  return { touching: Number(before === 0) + Number(after === 0), leftover: before + after };
}

function daysBetween(from: Temporal.PlainDate, to: Temporal.PlainDate): number {
  return from.until(to, { largestUnit: 'days' }).days;
}

// Unlike subtraction, safe when both are Infinity.
function compareNumbers(a: number, b: number): number {
  return a === b ? 0 : a < b ? -1 : 1;
}
