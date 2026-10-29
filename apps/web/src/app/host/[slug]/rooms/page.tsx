import type { Metadata } from 'next';
import { hostApi } from '@/api/host-api';
import { RoomsView } from '@/features/host/rooms/rooms-view';
import { loadHostSession } from '../property';

export const metadata: Metadata = { title: 'Rooms' };

export default async function RoomsPage({ params }: PageProps<'/host/[slug]/rooms'>) {
  const { slug } = await params;
  const { property } = await loadHostSession(slug);
  const unitTypes = await hostApi('listUnitTypes', { params: { propertyId: property.id } });
  return <RoomsView initial={unitTypes} />;
}
