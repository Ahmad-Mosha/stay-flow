'use client';

import type {
  HostPropertyResponse,
  HostReservationDetailResponse,
  ReservationEventResponse,
  ReservationStatus,
} from '@stay-flow/contracts';
import { parseDate } from '@internationalized/date';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { api, isApiError } from '@/api/client';
import {
  formatAmount,
  formatDate,
  formatDateTime,
  formatDayTime,
  formatMoney,
  formatTime,
  plural,
} from '@/lib/format';
import { useServerNow } from '@/lib/use-server-now';
import { Button } from '@/ui/button';
import { cx } from '@/ui/cx';
import { CloseIcon } from '@/ui/icons';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { StatusTape } from '@/ui/status-tape';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { todayAt } from '../property-time';
import { minutesLeft } from '../today/rooms-tonight';
import { HostCancelDialog } from './host-cancel-dialog';

interface ReservationDetailProps {
  reservationId: string;
  /** Shown as a close button, in the calendar's side panel. */
  onClose?: () => void;
}

/** One reservation as the front desk sees it: the stay, what to do next, and its history. */
export function ReservationDetail({ reservationId, onClose }: ReservationDetailProps) {
  const { property } = useHost();
  const detail = useQuery({
    queryKey: hostKeys.reservation(property.id, reservationId),
    queryFn: ({ signal }) =>
      api('getReservation', { params: { propertyId: property.id, reservationId }, signal }),
  });

  if (detail.isError) {
    const missing = isApiError(detail.error, 'NOT_FOUND');
    return (
      <StatePanel
        tone={missing ? 'neutral' : 'danger'}
        eyebrow={missing ? 'Not found' : 'Something went wrong'}
        title={missing ? 'This booking is not at this property' : 'We could not open this booking'}
        headingLevel={2}
        action={
          missing ? undefined : (
            <Button variant="secondary" onPress={() => void detail.refetch()}>
              Try again
            </Button>
          )
        }
      />
    );
  }
  if (!detail.data) return <DetailSkeleton />;
  return <Detail reservation={detail.data} property={property} onClose={onClose} />;
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading booking" className="flex flex-col gap-5 p-6">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

interface DetailProps {
  reservation: HostReservationDetailResponse;
  property: HostPropertyResponse;
  onClose: (() => void) | undefined;
}

function Detail({ reservation, property, onClose }: DetailProps) {
  const now = useServerNow(15_000);
  const today = todayAt(property.timeZone, now);
  const [announcement, setAnnouncement] = useState('');
  const room = reservation.unit
    ? `${reservation.unit.name} · ${reservation.unitType.name}`
    : reservation.unitType.name;

  return (
    <article aria-labelledby="reservation-guest" className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-small tracking-[0.06em] text-ink-2">
          {reservation.reference}
        </span>
        {onClose && (
          <AriaButton
            aria-label="Close booking"
            onPress={onClose}
            className="flex size-10 cursor-pointer items-center justify-center rounded-md border border-rule text-ink-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink"
          >
            <CloseIcon className="size-4" />
          </AriaButton>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        <h2
          id="reservation-guest"
          className="font-display text-[2rem] leading-[1.05] font-normal tracking-[-0.01em] text-balance"
        >
          {reservation.guest?.name ?? 'Held on the booking page'}
        </h2>
        <div className="flex flex-wrap gap-2">
          <StatusTape status={reservation.status} className="h-6.5 text-label" />
          <DueChip reservation={reservation} today={today} now={now} timeZone={property.timeZone} />
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-small">
        <Fact label="Room">{room}</Fact>
        <Fact label="Stay">
          {formatDate(reservation.checkIn)} – {formatDate(reservation.checkOut)}
        </Fact>
        <Fact label="Guests">
          {plural(reservation.guests, 'guest')} · {plural(reservation.nights, 'night')}
        </Fact>
        <Fact label="Email">
          {reservation.guest ? (
            <a
              href={`mailto:${reservation.guest.email}`}
              className="block truncate underline decoration-rule-strong underline-offset-4 hover:decoration-ink-2"
            >
              {reservation.guest.email}
            </a>
          ) : (
            <span className="text-ink-3">Not given yet</span>
          )}
        </Fact>
      </dl>

      <div className="flex flex-col gap-2.5">
        <NightStrip nights={reservation.nightlyRates} currency={reservation.currency} />
        <p className="flex items-baseline justify-between gap-4">
          <span className="text-small text-ink-2">Total, at booked prices</span>
          <span className="numerals text-heading font-semibold">
            {formatAmount(reservation.totalMinor, reservation.currency)}{' '}
            <span className="text-small font-medium text-ink-2">{reservation.currency}</span>
          </span>
        </p>
      </div>

      <p
        role="status"
        className={announcement ? 'text-small font-semibold text-success' : 'sr-only'}
      >
        {announcement}
      </p>

      <StayActions
        reservation={reservation}
        property={property}
        today={today}
        onDone={setAnnouncement}
      />

      <History reservation={reservation} today={today} timeZone={property.timeZone} />
    </article>
  );
}

/** The nights as one strip of tape, a week to a row, each with the price it was booked at. */
function NightStrip({
  nights,
  currency,
}: {
  nights: HostReservationDetailResponse['nightlyRates'];
  currency: string;
}) {
  const perRow = Math.min(nights.length, 7);
  // Empty cells finish the last row, so the strip stays a clean rectangle.
  const filler = (perRow - (nights.length % perRow)) % perRow;
  return (
    <ul
      aria-label="Price of each night"
      className="grid gap-px overflow-hidden rounded-sm border border-rule bg-rule"
      style={{ gridTemplateColumns: `repeat(${String(perRow)}, minmax(0, 1fr))` }}
    >
      {nights.map((night) => (
        <li key={night.date} className="flex flex-col items-center gap-0.5 bg-paper py-2">
          <span className="font-mono text-[0.625rem] leading-3 text-ink-3 uppercase">
            {formatDate(night.date, 'weekday')}
          </span>
          <span className="text-small font-semibold">{parseDate(night.date).day}</span>
          <span className="numerals font-mono text-[0.625rem] leading-3 text-ink-2">
            {formatAmount(night.rateMinor, currency)}
          </span>
        </li>
      ))}
      {Array.from({ length: filler }, (_, index) => (
        <li key={`filler-${String(index)}`} aria-hidden="true" className="bg-paper" />
      ))}
    </ul>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="font-mono text-[0.6875rem] text-ink-3 uppercase">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function DueChip({
  reservation,
  today,
  now,
  timeZone,
}: {
  reservation: HostReservationDetailResponse;
  today: string;
  now: number;
  timeZone: string;
}) {
  const { status, checkIn, checkOut, policy, holdExpiresAt } = reservation;
  let text: string | null = null;
  let tone = 'border-action text-action';
  if (status === 'confirmed' && checkIn === today)
    text = `Arrives today from ${policy.checkInTime}`;
  else if (status === 'confirmed' && checkIn < today) {
    text = `Due since ${formatDate(checkIn)}`;
    tone = 'border-danger text-danger';
  } else if (status === 'checked_in' && checkOut === today) {
    text = `Leaves today by ${policy.checkOutTime}`;
  } else if (status === 'held' && holdExpiresAt) {
    const expiresAt = Date.parse(holdExpiresAt);
    text = `Hold ends ${formatTime(expiresAt, timeZone)}, in ${plural(minutesLeft(expiresAt, now), 'min', 'min')}`;
    tone = 'border-hold text-ink';
  }
  if (!text) return null;
  return (
    <span
      className={cx(
        'inline-flex h-6.5 items-center rounded-sm border px-2 text-label font-semibold',
        tone,
      )}
    >
      {text}
    </span>
  );
}

type Step = 'checkIn' | 'checkOut' | 'markNoShow';

const stepCopy: Record<Step, { label: string; pending: string; done: string }> = {
  checkIn: { label: 'Check in', pending: 'Checking in', done: 'Checked in.' },
  checkOut: { label: 'Check out', pending: 'Checking out', done: 'Checked out.' },
  markNoShow: {
    label: 'Mark as no-show',
    pending: 'Marking as no-show',
    done: 'Marked as a no-show. The room is back on sale.',
  },
};

function StayActions({
  reservation,
  property,
  today,
  onDone,
}: {
  reservation: HostReservationDetailResponse;
  property: HostPropertyResponse;
  today: string;
  onDone: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const params = { propertyId: property.id, reservationId: reservation.id };
  const refresh = () => queryClient.invalidateQueries({ queryKey: hostKeys.property(property.id) });

  const step = useMutation({
    mutationFn: (name: Step) => api(name, { params }),
    onSuccess: async (updated, name) => {
      queryClient.setQueryData(hostKeys.reservation(property.id, reservation.id), updated);
      onDone(stepCopy[name].done);
      await refresh();
    },
    onError: async (error) => {
      if (isApiError(error, 'INVALID_TRANSITION', 'STAY_ENDED', 'ARRIVAL_NOT_DUE')) await refresh();
    },
  });

  const { status, checkIn, checkOut, refund, policy } = reservation;
  const arrived = checkIn <= today;
  const over = checkOut <= today;
  const button = (name: Step, variant: 'primary' | 'secondary') => (
    <Button
      variant={variant}
      size={variant === 'primary' ? 'lg' : 'md'}
      className="w-full"
      isPending={step.isPending && step.variables === name}
      isDisabled={step.isPending}
      onPress={() => {
        step.mutate(name);
      }}
    >
      {step.isPending && step.variables === name ? stepCopy[name].pending : stepCopy[name].label}
    </Button>
  );

  let actions: ReactNode = null;
  let note: ReactNode = null;
  if (status === 'confirmed' && !over) {
    actions = (
      <>
        {arrived && button('checkIn', 'primary')}
        {arrived && button('markNoShow', 'secondary')}
        <Button
          variant="danger"
          className="w-full"
          isDisabled={step.isPending}
          onPress={() => {
            setCancelOpen(true);
          }}
        >
          Cancel booking
        </Button>
      </>
    );
    note = (
      <>
        {!arrived && (
          <span>
            Check-in opens on {formatDate(checkIn)}, from {policy.checkInTime}.{' '}
          </span>
        )}
        {refund &&
          (refund.feeMinor === 0
            ? `Free cancellation until ${formatDateTime(refund.freeUntil, property.timeZone)}. Cancelling now refunds all ${formatMoney(reservation.totalMinor, reservation.currency)}.`
            : `Free cancellation ended ${formatDateTime(refund.freeUntil, property.timeZone)}. Cancelling now keeps the first night: refund ${formatMoney(refund.refundMinor, reservation.currency)}, fee ${formatMoney(refund.feeMinor, reservation.currency)}.`)}
      </>
    );
  } else if (status === 'checked_in') {
    actions = button('checkOut', 'primary');
    if (checkOut > today) {
      note = `Due to leave on ${formatDate(checkOut)}. Checking out now gives back the nights from tonight.`;
    }
  } else if (status === 'held') {
    note = 'The guest is on the booking page. The hold ends by itself if they do not confirm.';
  }

  if (!actions && !note) return null;
  return (
    <div className="flex flex-col gap-2">
      {actions}
      {step.isError && (
        <p role="alert" className="text-small text-danger">
          {isApiError(step.error, 'INVALID_TRANSITION', 'STAY_ENDED', 'ARRIVAL_NOT_DUE')
            ? 'This booking changed meanwhile. What you see now is up to date.'
            : 'That did not go through. Nothing has changed. Try again in a moment.'}
        </p>
      )}
      {note && <p className="pt-0.5 text-small text-ink-2">{note}</p>}
      {status === 'confirmed' && (
        <HostCancelDialog
          reservation={reservation}
          propertyId={property.id}
          isOpen={cancelOpen}
          onOpenChange={setCancelOpen}
          onCancelled={onDone}
        />
      )}
    </div>
  );
}

const statusWords: Record<ReservationStatus, string> = {
  held: 'Held',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  expired: 'Hold expired',
  released: 'Released',
};

function actorWords(event: ReservationEventResponse, userId: string): string {
  if (event.actor === 'guest') return 'by the guest';
  if (event.actor === 'system') return 'automatically';
  return event.userId === userId ? 'by you' : 'by staff';
}

function nextStep(
  reservation: HostReservationDetailResponse,
  today: string,
  timeZone: string,
): { title: string; when: string } | null {
  const { status, checkIn, checkOut, policy, holdExpiresAt } = reservation;
  const day = (date: string) => (date === today ? 'today' : formatDate(date));
  if (status === 'confirmed') {
    return { title: 'Check-in due', when: `${day(checkIn)} from ${policy.checkInTime}` };
  }
  if (status === 'checked_in') {
    return { title: 'Check-out due', when: `${day(checkOut)} by ${policy.checkOutTime}` };
  }
  if (status === 'held' && holdExpiresAt) {
    return { title: 'Hold ends', when: formatTime(holdExpiresAt, timeZone) };
  }
  return null;
}

function History({
  reservation,
  today,
  timeZone,
}: {
  reservation: HostReservationDetailResponse;
  today: string;
  timeZone: string;
}) {
  const { user } = useHost();
  const next = nextStep(reservation, today, timeZone);
  return (
    <section
      aria-labelledby="history-title"
      className="flex flex-col border-t-[1.5px] border-dashed border-rule pt-4"
    >
      <h3 id="history-title" className="pb-3 text-small font-semibold">
        History
      </h3>
      <ol className="flex flex-col font-mono text-label">
        {reservation.events.map((event, index) => {
          const last = index === reservation.events.length - 1 && !next;
          return (
            <li key={`${event.toStatus}-${event.occurredAt}`} className="flex gap-3">
              <span aria-hidden="true" className="flex flex-col items-center">
                <span className="mt-1 size-2 rounded-full bg-ink" />
                {!last && <span className="w-px flex-1 bg-rule-strong" />}
              </span>
              <span className="flex flex-1 flex-col gap-1 pb-3.5">
                <span className="flex justify-between gap-3">
                  <span>
                    {statusWords[event.toStatus]}{' '}
                    <span className="font-sans text-ink-2">{actorWords(event, user.id)}</span>
                  </span>
                  <time dateTime={event.occurredAt} className="whitespace-nowrap text-ink-3">
                    {formatDayTime(event.occurredAt, timeZone)}
                  </time>
                </span>
                {event.note && (
                  <span className="font-sans text-small text-ink-2">“{event.note}”</span>
                )}
              </span>
            </li>
          );
        })}
        {next && (
          <li className="flex gap-3">
            <span aria-hidden="true" className="flex flex-col items-center">
              <span className="mt-1 size-2 rounded-full border-[1.5px] border-action" />
            </span>
            <span className="flex flex-1 justify-between gap-3">
              <span className="text-action">{next.title}</span>
              <span className="text-ink-3">{next.when}</span>
            </span>
          </li>
        )}
      </ol>
    </section>
  );
}
