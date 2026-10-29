'use client';

import type { HostPropertyListResponse, UserResponse } from '@stay-flow/contracts';
import { useSignOut } from '@/features/auth/use-sign-out';
import { routes } from '@/lib/routes';
import { Button } from '@/ui/button';
import { TextLink } from '@/ui/link';
import { Wordmark } from '@/ui/wordmark';
import { NewPropertyForm } from './new-property-form';

interface NewPropertyScreenProps {
  user: UserResponse;
  properties: HostPropertyListResponse['properties'];
}

/** Where a new host lands after signing up, and where any host adds another property. */
export function NewPropertyScreen({ user, properties }: NewPropertyScreenProps) {
  const signOut = useSignOut();
  const [first] = properties;
  const firstName = user.name.trim().split(/\s+/)[0] ?? user.name;
  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 sm:px-8 lg:px-12">
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-rule py-5">
        <Wordmark className="text-heading" />
        <div className="flex items-center gap-5">
          {first && (
            <TextLink href={routes.today(first.slug)} className="text-small">
              Back to {first.name}
            </TextLink>
          )}
          <span className="hidden text-small text-ink-3 md:inline">{user.email}</span>
          <Button
            variant="secondary"
            size="sm"
            isPending={signOut.isPending}
            onPress={() => {
              signOut.mutate();
            }}
          >
            {signOut.isPending ? 'Signing out' : 'Sign out'}
          </Button>
        </div>
      </header>
      <main className="flex flex-1 flex-col gap-10 py-10 sm:gap-12 sm:py-14">
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="font-mono text-label tracking-[0.08em] text-ink-2 uppercase">
            {first ? 'Another property' : `Welcome, ${firstName}`}
          </p>
          <h1 className="font-display text-[clamp(2.5rem,5vw,3.5rem)] leading-none font-normal tracking-[-0.02em]">
            Set up your property
          </h1>
          <p className="text-body text-pretty text-ink-2">
            {first
              ? 'It gets its own booking page, rooms, rates and team. You can switch between your properties at any time.'
              : 'A few details for your booking page. Then add your rooms and their rates, and guests can book.'}
          </p>
          {!first && (
            <p className="text-small text-ink-3">
              Joining a hotel’s team instead? Ask its owner to add {user.email}. Their property
              shows here as soon as they do.
            </p>
          )}
        </div>
        <NewPropertyForm />
      </main>
    </div>
  );
}
