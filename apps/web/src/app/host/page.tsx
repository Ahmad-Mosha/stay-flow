import { redirect } from 'next/navigation';
import { hostApi } from '@/api/host-api';
import { routes } from '@/lib/routes';
import { PlainPage } from '@/ui/plain-page';
import { StatePanel } from '@/ui/state-panel';

export default async function HostHomePage() {
  const { properties } = await hostApi('listHostProperties');
  const [first] = properties;
  if (first) redirect(routes.today(first.slug));
  return (
    <PlainPage>
      <StatePanel eyebrow="No property yet" title="You are not on a property’s team">
        Ask the owner of your hotel to add you to its team with this email address. You will see its
        front desk here as soon as they do.
      </StatePanel>
    </PlainPage>
  );
}
