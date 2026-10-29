import type { Route } from 'next';

/**
 * Checks a path against the app's real pages (Next.js typed routes), then widens it for React
 * Aria's links and router, which take one non-generic `Route` type.
 */
function route<T extends string>(path: Route<T>): Route {
  return path as Route;
}

export const routes = {
  property: (slug: string, query?: string) =>
    route(query ? `/stay/${slug}?${query}` : `/stay/${slug}`),
  checkout: (slug: string, holdId: string) => route(`/stay/${slug}/checkout/${holdId}`),
  signIn: (next?: string) => route(next ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'),
  today: (slug: string) => route(`/host/${slug}/today`),
  calendar: (slug: string, query?: string) =>
    route(query ? `/host/${slug}/calendar?${query}` : `/host/${slug}/calendar`),
  reservations: (slug: string, query?: string) =>
    route(query ? `/host/${slug}/reservations?${query}` : `/host/${slug}/reservations`),
  reservation: (slug: string, reservationId: string) =>
    route(`/host/${slug}/reservations/${reservationId}`),
};

/** A page to return to after signing in: only one of the host's own, never another site. */
export function returnPath(next: string | null | undefined): Route {
  return next === '/host' || next?.startsWith('/host/') ? (next as Route) : '/host';
}
