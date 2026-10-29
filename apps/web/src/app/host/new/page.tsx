import type { Metadata } from 'next';
import { hostApi } from '@/api/host-api';
import { NewPropertyScreen } from '@/features/host/onboarding/new-property-screen';

export const metadata: Metadata = { title: 'New property' };

export default async function NewPropertyPage() {
  const [user, { properties }] = await Promise.all([
    hostApi('currentUser'),
    hostApi('listHostProperties'),
  ]);
  return <NewPropertyScreen user={user} properties={properties} />;
}
