import type { Metadata } from 'next';
import { hostApi } from '@/api/host-api';
import { filtersFromSearch, listQuery } from '@/features/host/reservations/reservation-filters';
import { ReservationsView } from '@/features/host/reservations/reservations-view';
import { loadHostSession } from '../property';

export const metadata: Metadata = { title: 'Reservations' };

export default async function ReservationsPage({
  params,
  searchParams,
}: PageProps<'/host/[slug]/reservations'>) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const { property } = await loadHostSession(slug);
  const filters = filtersFromSearch({
    get: (key) => {
      const value = search[key];
      return (Array.isArray(value) ? value[0] : value) ?? null;
    },
  });
  const page = await hostApi('listReservations', {
    params: { propertyId: property.id },
    query: listQuery(filters),
  });
  return <ReservationsView initial={{ page, filters }} />;
}
