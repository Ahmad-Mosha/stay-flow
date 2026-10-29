'use client';

import type { GuestReservationResponse, PropertyResponse } from '@stay-flow/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api, isApiError } from '@/api/client';
import { formatDate, formatDateTime, formatMoney, zoneLabel } from '@/lib/format';
import { routes } from '@/lib/routes';
import { Button } from '@/ui/button';
import { ButtonLink, TextLink } from '@/ui/link';
import { PlainPage } from '@/ui/plain-page';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { StatusTape } from '@/ui/status-tape';
import { PropertyFooter, PropertyHeader } from '../booking/property-chrome';
import { StayReceipt } from '../booking/stay-receipt';
import { CancelDialog } from './cancel-dialog';
import { useGuestToken } from './guest-link';
import { RefundLines } from './refund-lines';

export function ManageView() {
  const token = useGuestToken();
  if (token === undefined) return <PropertyFrame property={null} />;
  if (token === null) {
    return (
      <PlainPage>
        <StatePanel
          eyebrow="Manage a booking"
          title="Open the link from your confirmation email"
          action={<ButtonLink href="/">Go to the home page</ButtonLink>}
        >
          Every confirmation email has a private link to view or cancel the booking. Open it on this
          device: no account or password is needed.
        </StatePanel>
      </PlainPage>
    );
  }
  return <Booking token={token} />;
}

function Booking({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const queryKey = ['guest-reservation', token];
  const booking = useQuery({
    queryKey,
    queryFn: ({ signal }) => api('getGuestReservation', { bearer: token, signal }),
  });
  const slug = booking.data?.property.slug;
  const property = useQuery({
    queryKey: ['property', slug],
    queryFn: ({ signal }) => api('getProperty', { params: { slug: slug ?? '' }, signal }),
    enabled: slug !== undefined,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [justCancelled, setJustCancelled] = useState(false);
  const cancel = useMutation({
    mutationFn: ({
      expectedRefundMinor,
      reason,
    }: {
      expectedRefundMinor: number;
      reason?: string | undefined;
    }) =>
      api('cancelGuestReservation', {
        bearer: token,
        body: { expectedRefundMinor, ...(reason && { reason }) },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      setDialogOpen(false);
      setJustCancelled(true);
    },
    onError: (error) => {
      // The refund moved, or the stay moved on (checked in, say): show what is true now.
      if (isApiError(error, 'REFUND_CHANGED', 'INVALID_TRANSITION', 'STAY_ENDED')) {
        void booking.refetch();
      }
      if (isApiError(error, 'INVALID_TRANSITION', 'STAY_ENDED')) setDialogOpen(false);
    },
  });

  if (booking.isError) {
    const expired = isApiError(booking.error, 'INVALID_GUEST_LINK');
    return (
      <PlainPage>
        <StatePanel
          tone={expired ? 'neutral' : 'danger'}
          eyebrow={expired ? 'Link not valid' : 'Something went wrong'}
          title={expired ? 'This booking link no longer works' : 'We could not open your booking'}
          action={
            expired ? undefined : <Button onPress={() => void booking.refetch()}>Try again</Button>
          }
        >
          {expired
            ? 'A link stops working 30 days after check-out. If your stay is still ahead, open the newest email from the hotel and use the link in it.'
            : 'The booking system did not answer. Your booking has not changed. Try again in a moment.'}
        </StatePanel>
      </PlainPage>
    );
  }

  if (!booking.data || !property.data) return <PropertyFrame property={property.data ?? null} />;

  const data = booking.data;
  return (
    <PropertyFrame property={property.data}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12">
        <div className="flex min-w-0 flex-col gap-8">
          <Summary booking={data} justCancelled={justCancelled} />
          {data.status === 'confirmed' && data.refund && (
            <section
              aria-labelledby="cancel-title"
              className="flex flex-col gap-4 rounded-lg border border-rule bg-paper px-5 py-6 sm:px-7"
            >
              <h2 id="cancel-title" className="font-display text-headline font-normal">
                Change of plans?
              </h2>
              <CancelTerms booking={data} timeZone={property.data.timeZone} />
              <Button
                variant="danger"
                className="self-start"
                onPress={() => {
                  cancel.reset();
                  setDialogOpen(true);
                  // Read the refund again: it changes the moment free cancellation ends.
                  void booking.refetch();
                }}
              >
                Cancel booking
              </Button>
            </section>
          )}
          {data.status === 'cancelled' && data.refund && (
            <section aria-labelledby="refund-title" className="flex flex-col gap-4">
              <h2 id="refund-title" className="font-display text-headline font-normal">
                Your refund
              </h2>
              <RefundLines
                totalMinor={data.totalMinor}
                feeMinor={data.refund.feeMinor}
                refundMinor={data.refund.refundMinor}
                currency={data.currency}
                refundLabel="Refunded"
              />
              <p className="text-small text-ink-3">
                Payment is simulated in this demo, so no money moves.
              </p>
            </section>
          )}
          {(data.status === 'cancelled' || data.status === 'checked_out') && (
            <TextLink href={routes.property(data.property.slug)} className="self-start">
              Book another stay at {data.property.name}
            </TextLink>
          )}
        </div>
        <div className="lg:sticky lg:top-6">
          <StayReceipt
            propertyName={data.property.name}
            reservation={data}
            checkInTime={data.policy.checkInTime}
            checkOutTime={data.policy.checkOutTime}
          />
        </div>
      </div>
      <CancelDialog
        booking={data}
        isOpen={dialogOpen}
        onOpenChange={setDialogOpen}
        refreshing={booking.isFetching}
        pending={cancel.isPending}
        error={cancel.error}
        onCancel={(reason) => {
          if (data.refund) cancel.mutate({ expectedRefundMinor: data.refund.refundMinor, reason });
        }}
      />
    </PropertyFrame>
  );
}

function headlineOf(booking: GuestReservationResponse): { title: string; lead: string } {
  const firstName = booking.guest?.name.split(' ')[0] ?? 'there';
  const { checkInTime, checkOutTime } = booking.policy;
  switch (booking.status) {
    case 'confirmed':
      return {
        title: `See you on ${formatDate(booking.checkIn, 'dayMonth')}, ${firstName}.`,
        lead: `Check in from ${checkInTime} on ${formatDate(booking.checkIn)}. Your room is ready for you then.`,
      };
    case 'checked_in':
      return {
        title: `Welcome, ${firstName}.`,
        lead: `You are checked in. Check out is by ${checkOutTime} on ${formatDate(booking.checkOut)}.`,
      };
    case 'checked_out':
      return {
        title: `Thank you for staying, ${firstName}.`,
        lead: 'Your receipt stays here for 30 days after check-out.',
      };
    case 'cancelled':
      return {
        title: 'This booking is cancelled',
        lead: 'The room has gone back on sale. The refund is below.',
      };
    case 'no_show':
      return {
        title: 'This booking was marked as a no-show',
        lead: `The hotel did not see you arrive on ${formatDate(booking.checkIn)}. If that is wrong, contact the hotel.`,
      };
    default:
      return { title: 'This booking is not active', lead: 'It was never confirmed.' };
  }
}

function Summary({
  booking,
  justCancelled,
}: {
  booking: GuestReservationResponse;
  justCancelled: boolean;
}) {
  const { title, lead } = headlineOf(booking);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <StatusTape status={booking.status} />
        <span className="font-mono text-label text-ink-2 uppercase">
          Booking <span className="tracking-[0.12em] text-ink">{booking.reference}</span>
        </span>
      </div>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[2.5rem] leading-[1.05] font-normal tracking-[-0.02em] text-balance sm:text-[3.25rem]">
          {title}
        </h1>
        <p className="max-w-xl text-lead text-ink-2">{lead}</p>
      </div>
      <p
        role="status"
        className={justCancelled ? 'text-small font-semibold text-success' : 'sr-only'}
      >
        {justCancelled ? `Cancelled. We emailed a note to ${booking.guest?.email ?? 'you'}.` : ''}
      </p>
      {booking.guest && (
        <dl className="grid gap-x-8 gap-y-3 border-t border-rule pt-5 text-small sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="font-mono text-label text-ink-3 uppercase">Booked by</dt>
            <dd className="font-semibold text-ink">{booking.guest.name}</dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="font-mono text-label text-ink-3 uppercase">Email</dt>
            <dd className="font-semibold text-ink [overflow-wrap:anywhere]">
              {booking.guest.email}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function CancelTerms({
  booking,
  timeZone,
}: {
  booking: GuestReservationResponse;
  timeZone: string;
}) {
  const refund = booking.refund;
  if (!refund) return null;
  const deadline = `${formatDateTime(refund.freeUntil, timeZone)} ${zoneLabel(timeZone)}`;
  return refund.feeMinor === 0 ? (
    <div className="flex flex-col gap-1.5">
      <p className="text-body text-ink">
        Cancelling now is free: you get back the full{' '}
        <strong className="font-semibold">
          {formatMoney(refund.refundMinor, booking.currency)}
        </strong>
        .
      </p>
      <p className="text-small text-ink-2">
        Free until {deadline}. After that, the hotel keeps the first night.
      </p>
    </div>
  ) : (
    <div className="flex flex-col gap-1.5">
      <p className="text-body text-ink">
        Cancelling now keeps the first night ({formatMoney(refund.feeMinor, booking.currency)}). You
        get back{' '}
        <strong className="font-semibold">
          {formatMoney(refund.refundMinor, booking.currency)}
        </strong>
        .
      </p>
      <p className="text-small text-ink-2">Free cancellation ended on {deadline}.</p>
    </div>
  );
}

/** The hotel's own header and footer around the booking, with a placeholder while it loads. */
function PropertyFrame({
  property,
  children,
}: {
  property: PropertyResponse | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      {property ? (
        <PropertyHeader property={property}>
          <span className="font-mono text-label text-ink-2">Your booking</span>
        </PropertyHeader>
      ) : (
        <header className="border-b border-rule bg-paper">
          <div className="mx-auto flex max-w-7xl items-center px-4 py-4 sm:px-8">
            <Skeleton className="h-8 w-56" />
          </div>
        </header>
      )}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-8 pb-16 sm:px-8 sm:pt-12 sm:pb-20">
        {children ?? (
          <div
            aria-hidden="true"
            className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-12"
          >
            <div className="flex flex-col gap-5">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-14 w-full max-w-lg" />
              <Skeleton className="h-5 w-80 max-w-full" />
            </div>
            <Skeleton className="h-96 rounded-lg" />
          </div>
        )}
      </main>
      <PropertyFooter />
    </div>
  );
}
