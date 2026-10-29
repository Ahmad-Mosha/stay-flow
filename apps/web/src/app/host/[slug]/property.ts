import { notFound } from 'next/navigation';
import { cache } from 'react';
import { hostApi } from '@/api/host-api';

/**
 * The signed-in host, their properties, and the one in the address. Cached for the request, so
 * the layout and the page share one set of calls.
 */
export const loadHostSession = cache(async (slug: string) => {
  const [user, { properties }] = await Promise.all([
    hostApi('currentUser'),
    hostApi('listHostProperties'),
  ]);
  const summary = properties.find((candidate) => candidate.slug === slug);
  if (!summary) notFound();
  const property = await hostApi('getHostProperty', { params: { propertyId: summary.id } });
  return { user, properties, property };
});
