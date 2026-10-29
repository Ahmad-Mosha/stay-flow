import { redirect } from 'next/navigation';
import { hostApi } from '@/api/host-api';
import { routes } from '@/lib/routes';

/** Opens the host's first property, or sets one up when they have none yet. */
export default async function HostHomePage() {
  const { properties } = await hostApi('listHostProperties');
  const [first] = properties;
  redirect(first ? routes.today(first.slug) : routes.newProperty());
}
