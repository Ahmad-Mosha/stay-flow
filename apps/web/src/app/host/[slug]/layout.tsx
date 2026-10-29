import { HostShell } from '@/features/host/shell/host-shell';
import { loadHostSession } from './property';

export default async function PropertyLayout({ children, params }: LayoutProps<'/host/[slug]'>) {
  const { slug } = await params;
  const { user, properties, property } = await loadHostSession(slug);
  return (
    <HostShell user={user} properties={properties} property={property}>
      {children}
    </HostShell>
  );
}
