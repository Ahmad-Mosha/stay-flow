import type { PropertyResponse } from '@stay-flow/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Wordmark } from '@/ui/wordmark';

/** The property's own header: guests book with the hotel, so its name leads, not ours. */
export function PropertyHeader({
  property,
  children,
}: {
  property: PropertyResponse;
  children?: ReactNode;
}) {
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-8">
        <Link
          href={`/stay/${property.slug}`}
          className="rounded-sm font-display text-heading font-medium tracking-[-0.01em] text-ink outline-hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid focus-visible:outline-action sm:text-[1.75rem]"
        >
          {property.name}
        </Link>
        {children}
      </div>
    </header>
  );
}

export function PropertyFooter() {
  return (
    <footer className="border-t border-rule">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-5 text-small text-ink-2 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-sm outline-hidden focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-solid focus-visible:outline-action"
        >
          Booking engine by <Wordmark className="text-body" />
        </Link>
        <p>Payment is simulated in this demo</p>
      </div>
    </footer>
  );
}
