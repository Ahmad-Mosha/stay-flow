'use client';

import { useEffect } from 'react';
import { Button } from '@/ui/button';
import { PlainPage } from '@/ui/plain-page';
import { StatePanel } from '@/ui/state-panel';

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PlainPage>
      <StatePanel
        tone="danger"
        eyebrow="Something went wrong"
        title="This page could not load"
        headingLevel={1}
        action={
          <Button
            onPress={() => {
              retry();
            }}
          >
            Try again
          </Button>
        }
      >
        The booking system did not answer as expected. Nothing you did was lost: a held room stays
        held until its time runs out. Try again in a moment.
      </StatePanel>
    </PlainPage>
  );
}
