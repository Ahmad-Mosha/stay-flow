'use client';

import type {
  ConfirmReservationRequest,
  PropertyResponse,
  ReservationResponse,
} from '@stay-flow/contracts';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { api, isApiError } from '@/api/client';
import { routes } from '@/lib/routes';
import { useServerNow } from '@/lib/use-server-now';
import { Button } from '@/ui/button';
import { ButtonLink } from '@/ui/link';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { loadHold, updateHold, useStoredHold, type StoredHold } from '../hold-store';
import { staySearchQuery } from '../stay-search';
import { StayReceipt } from '../stay-receipt';
import { BookingSteps } from './booking-steps';
import { CancellationTerms } from './cancellation-terms';
import { ConfirmForm } from './confirm-form';

interface CheckoutViewProps {
  property: PropertyResponse;
  holdId: string;
}

export function CheckoutView({ property, holdId }: CheckoutViewProps) {
  const stored = useStoredHold(holdId);
  const now = useServerNow();

  if (stored === undefined) return <CheckoutSkeleton />;
  if (stored?.propertySlug !== property.slug) {
    return (
      <Layout steps={null}>
        <StatePanel
          eyebrow="Nothing held here"
          title="This checkout is not open in this tab"
          action={<ButtonLink href={routes.property(property.slug)}>Find a room</ButtonLink>}
          className="max-w-2xl"
        >
          A hold lives in the tab where you reserved the room. If that tab is closed, the hold ends
          by itself within 10 minutes, and nothing was charged.
        </StatePanel>
      </Layout>
    );
  }
  return <Checkout property={property} hold={stored} now={now} />;
}

function Checkout({
  property,
  hold,
  now,
}: {
  property: PropertyResponse;
  hold: StoredHold;
  now: number;
}) {
  const router = useRouter();
  const { reservation } = hold;
  const searchHref = routes.property(property.slug, staySearchQuery(reservation));
  const [ended, setEnded] = useState<'expired' | 'closed' | null>(null);
  const [leaving, setLeaving] = useState(false);

  const confirm = useMutation({
    mutationFn: (details: ConfirmReservationRequest) => {
      const last = loadHold(reservation.id)?.lastConfirm;
      const sameDetails =
        last?.guestName === details.guestName && last.guestEmail === details.guestEmail;
      const key = sameDetails ? last.key : crypto.randomUUID();
      updateHold(reservation.id, { lastConfirm: { key, ...details } });
      return api('confirmReservation', {
        params: { id: reservation.id },
        body: details,
        idempotencyKey: key,
      });
    },
    onSuccess: (confirmed) => {
      updateHold(reservation.id, { reservation: confirmed });
      window.scrollTo({ top: 0 });
    },
    onError: (error) => {
      if (isApiError(error, 'HOLD_EXPIRED')) setEnded('expired');
      else if (isApiError(error, 'RESERVATION_NOT_HELD', 'NOT_FOUND')) setEnded('closed');
    },
  });

  const receipt = (withTerms: boolean) => (
    <StayReceipt
      propertyName={property.name}
      reservation={reservation}
      checkInTime={property.checkInTime}
      checkOutTime={property.checkOutTime}
      footer={
        withTerms && <CancellationTerms property={property} reservation={reservation} now={now} />
      }
    />
  );

  if (reservation.status === 'confirmed') {
    return (
      <Layout steps="confirmed" summary={receipt(true)}>
        <Confirmed property={property} reservation={reservation} />
      </Layout>
    );
  }

  const expiresAt = reservation.holdExpiresAt ? Date.parse(reservation.holdExpiresAt) : 0;
  // The server decides: a press sent in the last second still counts, so wait for its answer.
  const timedOut = now >= expiresAt && !confirm.isPending;

  if (ended === 'closed') {
    return (
      <Layout steps={null} summary={receipt(false)}>
        <StatePanel
          announce
          eyebrow="Hold closed"
          title="This hold is no longer open"
          action={<ButtonLink href={searchHref}>Check these dates again</ButtonLink>}
        >
          If you confirmed it a moment ago, the confirmation is already in your email. Otherwise the
          room went back on sale, and nothing was charged.
        </StatePanel>
      </Layout>
    );
  }

  if (ended === 'expired' || timedOut) {
    return (
      <Layout steps={null} summary={receipt(false)}>
        <StatePanel
          announce
          eyebrow="Hold ended"
          title="Your 10 minutes are up"
          action={<ButtonLink href={searchHref}>Check these dates again</ButtonLink>}
        >
          The room went back on sale, and nothing was charged. It may well still be free: the same
          search shows you in a second.
        </StatePanel>
      </Layout>
    );
  }

  return (
    <Layout
      steps="details"
      summary={receipt(true)}
      heading={
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <h1 className="font-display text-[2.125rem] leading-10 font-normal tracking-[-0.015em] sm:text-title">
            Confirm your stay
          </h1>
          <Button
            variant="quiet"
            className="px-0"
            isPending={leaving}
            onPress={() => {
              setLeaving(true);
              // Gives the room back now instead of in 10 minutes, even as the page changes.
              void api('releaseReservation', {
                params: { id: reservation.id },
                keepalive: true,
              }).catch(() => undefined);
              router.push(searchHref);
            }}
          >
            Change room or dates
          </Button>
        </div>
      }
    >
      <ConfirmForm
        expiresAt={expiresAt}
        heldAt={hold.heldAt}
        now={now}
        timeZone={property.timeZone}
        pending={confirm.isPending}
        error={confirm.error}
        defaultValues={hold.lastConfirm}
        onConfirm={(details) => {
          confirm.mutate(details);
        }}
      />
    </Layout>
  );
}

function Confirmed({
  property,
  reservation,
}: {
  property: PropertyResponse;
  reservation: ReservationResponse;
}) {
  const firstName = reservation.guest?.name.split(' ')[0];
  return (
    <section aria-labelledby="confirmed-title" className="flex flex-col gap-8">
      <div role="status" className="flex flex-col gap-4">
        <p className="flex items-center gap-2 font-mono text-label tracking-[0.06em] text-success uppercase">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <polyline points="5 12.5 10 17 19 7" />
          </svg>
          Booking confirmed
        </p>
        <h1
          id="confirmed-title"
          className="font-display text-[2.5rem] leading-[1.05] font-normal tracking-[-0.02em] text-balance sm:text-[3.5rem]"
        >
          You are booked{firstName ? `, ${firstName}` : ''}.
        </h1>
      </div>

      <div className="flex flex-col overflow-hidden rounded-lg border border-rule bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-rule px-5 py-5 sm:px-7">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-label text-ink-3 uppercase">Booking reference</span>
            <span className="numerals font-mono text-[1.75rem] leading-9 font-medium tracking-[0.12em] text-ink">
              {reservation.reference}
            </span>
          </div>
          <span className="text-small text-ink-2">Quote it at the front desk</span>
        </div>
        <div className="flex flex-col gap-2 px-5 py-5 sm:px-7">
          <p className="font-semibold text-ink">
            We emailed the confirmation to{' '}
            <span className="[overflow-wrap:anywhere]">{reservation.guest?.email}</span>
          </p>
          <p className="text-small text-ink-2">
            It has a private link to view this booking or cancel it. No account or password needed.
            If it is not there in a few minutes, look in your spam folder.
          </p>
        </div>
      </div>

      <ButtonLink href={routes.property(property.slug)} variant="secondary" className="self-start">
        Back to {property.name}
      </ButtonLink>
    </section>
  );
}

interface LayoutProps {
  steps: 'details' | 'confirmed' | null;
  heading?: ReactNode;
  summary?: ReactNode;
  children: ReactNode;
}

/** Action first on a phone, with the receipt below; side by side from large screens up. */
function Layout({ steps, heading, summary, children }: LayoutProps) {
  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      {steps && <BookingSteps current={steps} />}
      {heading}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12">
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        {summary && <div className="lg:sticky lg:top-6">{summary}</div>}
      </div>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-8 sm:gap-10">
      <Skeleton className="h-5 w-64" />
      <Skeleton className="h-12 w-80 max-w-full" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12">
        <Skeleton className="h-96 rounded-lg" />
        <Skeleton className="h-96 rounded-lg" />
      </div>
    </div>
  );
}
