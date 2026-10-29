import type { ReservationStatus } from '@stay-flow/contracts';

/** One status to list, or every booking but holds that never became one. */
export type StatusFilter = ReservationStatus | 'all';

export const statusFilters: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'checked_in', label: 'In house' },
  { id: 'held', label: 'Held' },
  { id: 'checked_out', label: 'Checked out' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'no_show', label: 'No-show' },
];

export interface ReservationFilters {
  /** A reference, or part of a guest's name or email. */
  q: string | null;
  status: ReservationStatus | null;
}

/** The filters an address asks for, as `?q=lind&status=confirmed`, ignoring what it cannot read. */
export function filtersFromSearch(search: {
  get: (key: string) => string | null;
}): ReservationFilters {
  const q = search.get('q')?.trim().slice(0, 200) ?? '';
  const wanted = search.get('status');
  const status = statusFilters.find(({ id }) => id !== 'all' && id === wanted)?.id ?? 'all';
  return { q: q === '' ? null : q, status: status === 'all' ? null : status };
}

/** The list endpoint's query for the filters, one page after `cursor`. */
export function listQuery(filters: ReservationFilters, cursor?: string) {
  return {
    ...(filters.q && { q: filters.q }),
    ...(filters.status && { status: filters.status }),
    ...(cursor && { cursor }),
  };
}
