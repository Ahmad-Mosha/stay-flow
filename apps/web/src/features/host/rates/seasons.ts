import { parseDate, startOfMonth } from '@internationalized/date';
import type { HostUnitTypeResponse, RateOverrideResponse } from '@stay-flow/contracts';
import { formatDate } from '@/lib/format';
import { daysBetween } from '../calendar/tape';

/** A seasonal rate with the room type it prices. */
export interface Season extends RateOverrideResponse {
  unitType: HostUnitTypeResponse;
}

/** The months the season chart shows, from the first day of this one. */
export interface SeasonWindow {
  from: string;
  /** The first day after the last month. */
  to: string;
  months: { start: string; label: string; year: string | null }[];
}

export function seasonWindow(today: string, count = 12): SeasonWindow {
  const first = startOfMonth(parseDate(today));
  const months = Array.from({ length: count }, (_, index) => {
    const start = first.add({ months: index });
    return {
      start: start.toString(),
      label: formatDate(start, 'monthShort'),
      // The year shows where the chart starts and where it turns over.
      year: index === 0 || start.month === 1 ? String(start.year) : null,
    };
  });
  return { from: first.toString(), to: first.add({ months: count }).toString(), months };
}

/** How far into the window a date is, from 0 to 100. */
export function offsetOf(date: string, window: SeasonWindow): number {
  const total = daysBetween(window.from, window.to);
  const days = Math.min(Math.max(daysBetween(window.from, date), 0), total);
  return (days / total) * 100;
}

/** Where some nights sit on the chart, in percent of its width, or null when none are in it. */
export function placeSeason(
  nights: { from: string; to: string },
  window: SeasonWindow,
): { left: number; width: number } | null {
  if (nights.to <= window.from || nights.from >= window.to) return null;
  const left = offsetOf(nights.from, window);
  return { left, width: offsetOf(nights.to, window) - left };
}

/** A seasonal rate against the base rate, in whole percent: 25 for a quarter more. */
export function rateChange(rateMinor: number, baseMinor: number): number {
  return baseMinor === 0 ? 0 : Math.round(((rateMinor - baseMinor) / baseMinor) * 100);
}

/** "+25%", "−10%" or "0%". */
export function formatChange(change: number): string {
  return `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change)}%`;
}

/** "+25% on base", "−10% on base", or "Same as base". */
export function rateChangeLabel(change: number): string {
  return change === 0 ? 'Same as base' : `${formatChange(change)} on base`;
}

/** Whether the nights include tonight. */
export function coversTonight(nights: { from: string; to: string }, today: string): boolean {
  return nights.from <= today && today < nights.to;
}
