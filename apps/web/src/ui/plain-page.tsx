import type { ReactNode } from 'react';
import { TextLink } from './link';
import { Wordmark } from './wordmark';

/** The frame for pages outside any one property, such as "not found". */
export function PlainPage({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-8 lg:px-12">
      <header className="flex items-center justify-between gap-6 border-b border-rule py-5">
        <Wordmark className="text-heading" />
        <TextLink href="/" className="text-small">
          Home
        </TextLink>
      </header>
      <main className="flex flex-1 flex-col justify-center py-16">
        <div className="w-full max-w-xl">{children}</div>
      </main>
    </div>
  );
}
