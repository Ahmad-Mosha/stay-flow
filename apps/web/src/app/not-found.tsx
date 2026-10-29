import type { Metadata } from 'next';
import { ButtonLink } from '@/ui/link';
import { PlainPage } from '@/ui/plain-page';
import { StatePanel } from '@/ui/state-panel';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <PlainPage>
      <StatePanel
        eyebrow="404 · Not found"
        title="There is no page at this address"
        headingLevel={1}
        action={<ButtonLink href="/">Go to the home page</ButtonLink>}
      >
        If you followed a link to a hotel, its address may have changed. Check the link, or start
        from the home page.
      </StatePanel>
    </PlainPage>
  );
}
