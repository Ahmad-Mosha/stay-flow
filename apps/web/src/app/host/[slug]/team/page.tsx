import type { Metadata } from 'next';
import { hostApi } from '@/api/host-api';
import { TeamView } from '@/features/host/team/team-view';
import { loadHostSession } from '../property';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ params }: PageProps<'/host/[slug]/team'>) {
  const { slug } = await params;
  const { property } = await loadHostSession(slug);
  const team = await hostApi('listTeam', { params: { propertyId: property.id } });
  return <TeamView initial={team} />;
}
