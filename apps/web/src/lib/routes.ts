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
};
