import { parseDate } from '@internationalized/date';
import type { CalendarBarResponse, RoomCalendarResponse } from '@stay-flow/contracts';

/** How much of the calendar shows at once. */
export type CalendarView = '2w' | '3w' | 'month';

export const calendarViews: { id: CalendarView; label: string }[] = [
  { id: '2w', label: '2 weeks' },
  { id: '3w', label: '3 weeks' },
  { id: 'month', label: 'Month' },
];

/** The nights the calendar shows: one column per date, starting at `from`. */
export interface CalendarWindow {
  view: CalendarView;
  from: string;
  /** The day after the last night, as the API takes it. */
  to: string;
  days: string[];
}

/** The date a number of days after `date`, or before it when `days` is negative. */
export function addDays(date: string, days: number): string {
  return parseDate(date).add({ days }).toString();
}

/** Days from `a` to `b`: positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  return parseDate(b).compare(parseDate(a));
}

/**
 * The window for a view. Weeks start a few days before `anchor`, so the nights just past stay in
 * sight; a month starts on its first day.
 */
export function windowFor(view: CalendarView, anchor: string): CalendarWindow {
  const date = parseDate(anchor);
  const from = view === 'month' ? date.set({ day: 1 }).toString() : anchor;
  const nights = view === 'month' ? date.calendar.getDaysInMonth(date) : view === '2w' ? 14 : 21;
  return {
    view,
    from,
    to: addDays(from, nights),
    days: Array.from({ length: nights }, (_, index) => addDays(from, index)),
  };
}

/** The window a calendar answer covers, to draw it while the next one loads. */
export function windowOf(nights: { from: string; to: string }, view: CalendarView): CalendarWindow {
  return {
    view,
    from: nights.from,
    to: nights.to,
    days: Array.from({ length: daysBetween(nights.from, nights.to) }, (_, index) =>
      addDays(nights.from, index),
    ),
  };
}

/** Where a week view opens by default: three nights before today. */
export function defaultStart(today: string): string {
  return addDays(today, -3);
}

function isDate(value: string): boolean {
  try {
    return parseDate(value).toString() === value;
  } catch {
    return false;
  }
}

/** The window an address asks for, as `?view=month&from=2026-11-01`, or the default one. */
export function windowFromSearch(
  search: { view?: string | null | undefined; from?: string | null | undefined },
  today: string,
): CalendarWindow {
  const view = calendarViews.find(({ id }) => id === search.view)?.id ?? '3w';
  const from = search.from && isDate(search.from) ? search.from : undefined;
  return windowFor(view, from ?? (view === 'month' ? today : defaultStart(today)));
}

/** The address of a window, the other way round. */
export function searchFor(window: CalendarWindow): { view: string; from: string } {
  return { view: window.view, from: window.from };
}

/** The window one step earlier or later: a week, or a month. */
export function shiftWindow(window: CalendarWindow, step: -1 | 1): CalendarWindow {
  if (window.view === 'month') {
    return windowFor('month', parseDate(window.from).add({ months: step }).toString());
  }
  return windowFor(window.view, addDays(window.from, step * 7));
}

/**
 * A bar's place on the grid, in columns. A stay runs from midday on its first day to midday on
 * the day it ends, as check-in and check-out do, so it starts and ends half a column in.
 */
export interface Placement {
  start: number;
  end: number;
  /** It carries on past the left or right edge of the window. */
  clippedStart: boolean;
  clippedEnd: boolean;
}

export function placementOf(
  nights: { from: string; to: string },
  window: CalendarWindow,
): Placement | null {
  const columns = window.days.length;
  const rawStart = daysBetween(window.from, nights.from) + 0.5;
  const rawEnd = daysBetween(window.from, nights.to) + 0.5;
  if (rawEnd <= 0 || rawStart >= columns) return null;
  return {
    start: Math.max(rawStart, 0),
    end: Math.min(rawEnd, columns),
    clippedStart: rawStart < 0,
    clippedEnd: rawEnd > columns,
  };
}

/** Whether a bar takes the room on the night of `date`. */
export function takesNight(bar: CalendarBarResponse, date: string): boolean {
  return bar.nights.from <= date && date < bar.nights.to;
}

/** Rooms free on each night of the window. */
export function freeRooms(calendar: RoomCalendarResponse, window: CalendarWindow): number[] {
  const rooms = calendar.unitTypes.flatMap((unitType) => unitType.units);
  return window.days.map(
    (date) => rooms.filter((room) => !room.bars.some((bar) => takesNight(bar, date))).length,
  );
}

/** "26 Oct – 15 Nov 2026": the dates the window shows, first to last. */
export function windowLabel(window: CalendarWindow, format: (date: string) => string): string {
  const last = window.days.at(-1) ?? window.from;
  return `${format(window.from)} – ${format(last)} ${last.slice(0, 4)}`;
}

/** Whether a bar is the guest's stay or the host's block, with the words for it. */
export function barLabel(bar: CalendarBarResponse): string {
  if (bar.kind === 'block') return bar.reason;
  return bar.reservation.guest?.name ?? 'Held online';
}
