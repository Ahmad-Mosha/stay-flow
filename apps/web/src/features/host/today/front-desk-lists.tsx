'use client';

import type {
  HostPropertyResponse,
  HostReservationResponse,
  TodayResponse,
} from '@stay-flow/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api, isApiError } from '@/api/client';
import { formatDate, plural } from '@/lib/format';
import { Button } from '@/ui/button';
import { cx } from '@/ui/cx';
import { CheckIcon, TurnoverIcon } from '@/ui/icons';
import { StatusTape } from '@/ui/status-tape';
import { hostKeys } from '../host-keys';

interface ListProps {
  today: TodayResponse;
  property: HostPropertyResponse;
  /** Announces a finished check-in or check-out to screen readers. */
  onDone: (message: string) => void;
}

export function Arrivals({ today, property, onDone }: ListProps) {
  return (
    <ListCard
      id="arrivals"
      title="Arrivals"
      count={today.arrivals.length}
      meta={`from ${property.checkInTime}`}
      empty="No one is due to arrive today."
    >
      {today.arrivals.map((reservation) => {
        // The room is still someone else's until they check out.
        const leaving = today.departures.find(
          (departure) =>
            departure.status === 'checked_in' && departure.unit?.id === reservation.unit?.id,
        );
        return (
          <Row
            key={reservation.id}
            reservation={reservation}
            note={
              leaving &&
              reservation.status === 'confirmed' &&
              `Turnover: ${firstName(leaving)} leaves the room by ${property.checkOutTime}`
            }
            action={
              reservation.status === 'confirmed' ? (
                <FrontDeskAction
                  kind="checkIn"
                  reservation={reservation}
                  propertyId={property.id}
                  onDone={onDone}
                />
              ) : reservation.status === 'checked_in' ? (
                <Done>Checked in</Done>
              ) : (
                <StatusTape status={reservation.status} />
              )
            }
          />
        );
      })}
    </ListCard>
  );
}

export function Departures({ today, property, onDone }: ListProps) {
  return (
    <ListCard
      id="departures"
      title="Departures"
      count={today.departures.length}
      meta={`by ${property.checkOutTime}`}
      empty="No one is due to leave today."
    >
      {today.departures.map((reservation) => (
        <Row
          key={reservation.id}
          reservation={reservation}
          action={
            reservation.status === 'checked_in' ? (
              <FrontDeskAction
                kind="checkOut"
                reservation={reservation}
                propertyId={property.id}
                onDone={onDone}
              />
            ) : reservation.status === 'checked_out' ? (
              <Done>Checked out</Done>
            ) : (
              <StatusTape status={reservation.status} />
            )
          }
        />
      ))}
    </ListCard>
  );
}

export function InHouse({ today }: { today: TodayResponse }) {
  const guests = today.inHouse.reduce((sum, reservation) => sum + reservation.guests, 0);
  const rows = today.inHouse.toSorted((a, b) =>
    (a.unit?.name ?? '').localeCompare(b.unit?.name ?? '', 'en', { numeric: true }),
  );
  return (
    <ListCard
      id="in-house"
      title="In house"
      count={today.inHouse.length}
      meta={plural(guests, 'guest')}
      empty="No one is checked in right now."
    >
      {rows.length > 0 && (
        <table className="w-full border-collapse text-small">
          <thead>
            <tr className="text-left font-mono text-[0.6875rem] text-ink-3 uppercase">
              <th scope="col" className="border-t border-rule py-2 font-normal">
                Room
              </th>
              <th scope="col" className="border-t border-rule py-2 font-normal">
                Guest
              </th>
              <th scope="col" className="border-t border-rule py-2 text-right font-normal">
                Leaves
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((reservation) => {
              const leavesToday = reservation.checkOut === today.date;
              return (
                <tr key={reservation.id}>
                  <td className="border-t border-rule py-3 pr-3 font-mono">
                    {reservation.unit?.name ?? '–'}
                  </td>
                  <td className="border-t border-rule py-3 pr-3 font-medium">
                    {reservation.guest?.name ?? reservation.reference}
                  </td>
                  <td
                    className={cx(
                      'border-t border-rule py-3 text-right whitespace-nowrap',
                      leavesToday ? 'font-semibold text-action' : 'text-ink-2',
                    )}
                  >
                    {leavesToday ? 'Today' : formatDate(reservation.checkOut)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ListCard>
  );
}

interface ListCardProps {
  id: string;
  title: string;
  count: number;
  meta: string;
  empty: string;
  children: ReactNode;
}

function ListCard({ id, title, count, meta, empty, children }: ListCardProps) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="@container flex min-w-0 flex-col rounded-lg border border-rule bg-paper px-5 pt-5 pb-2 sm:px-6"
    >
      <div className="flex items-baseline justify-between gap-4 pb-3">
        <h2 id={`${id}-title`} className="text-[1.0625rem] font-semibold">
          {title} <span className="numerals font-normal text-ink-3">{count}</span>
        </h2>
        <span className="text-small text-ink-2">{meta}</span>
      </div>
      {count === 0 ? (
        <p className="border-t border-rule py-5 text-small text-ink-3">{empty}</p>
      ) : (
        <div>{children}</div>
      )}
    </section>
  );
}

function firstName(reservation: HostReservationResponse): string {
  return reservation.guest?.name.split(' ')[0] ?? 'the guest';
}

interface RowProps {
  reservation: HostReservationResponse;
  note?: ReactNode;
  action: ReactNode;
}

/** The room number in the colours of the tape chart: booked, in house, or done. */
function badgeStyle(status: HostReservationResponse['status']): string {
  if (status === 'checked_in') return 'bg-tape-in text-tape-in-ink';
  if (status === 'confirmed') return 'bg-tape-stay text-ink';
  return 'border border-dashed border-rule-strong text-ink-3';
}

/** Side by side in a wide card; in a narrow one, the action moves under the guest. */
function Row({ reservation, note, action }: RowProps) {
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3.5 gap-y-3 border-t border-rule py-3.5 @lg:grid-cols-[auto_minmax(0,1fr)_auto]">
      <span
        className={cx(
          'flex h-10 w-12 items-center justify-center self-start rounded-md font-mono text-small @lg:self-center',
          badgeStyle(reservation.status),
        )}
      >
        <span className="sr-only">Room </span>
        {reservation.unit?.name ?? '–'}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[0.9375rem] font-semibold">
          {reservation.guest?.name ?? 'Guest not named yet'}
        </span>
        <span className="text-[0.8125rem] leading-5 text-ink-2">
          {reservation.unitType.name} · {plural(reservation.nights, 'night')} ·{' '}
          {plural(reservation.guests, 'guest')}
        </span>
        <span className="font-mono text-label tracking-[0.04em] text-ink-3">
          {reservation.reference}
        </span>
        {note && (
          <span className="flex items-center gap-1.5 pt-1 text-label font-medium text-ink-2">
            <TurnoverIcon className="size-3.5" />
            {note}
          </span>
        )}
      </div>
      <div className="col-start-2 flex flex-col items-start @lg:col-start-3 @lg:items-end">
        {action}
      </div>
    </div>
  );
}

function Done({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-small font-semibold text-success">
      <CheckIcon className="size-4" />
      {children}
    </span>
  );
}

interface FrontDeskActionProps {
  kind: 'checkIn' | 'checkOut';
  reservation: HostReservationResponse;
  propertyId: string;
  onDone: (message: string) => void;
}

const actions = {
  checkIn: { label: 'Check in', done: 'is checked in', room: 'to room' },
  checkOut: { label: 'Check out', done: 'is checked out', room: 'of room' },
} as const;

function FrontDeskAction({ kind, reservation, propertyId, onDone }: FrontDeskActionProps) {
  const queryClient = useQueryClient();
  const { label, done, room } = actions[kind];
  const guest = reservation.guest?.name ?? reservation.reference;
  const message = reservation.unit
    ? `${guest} ${done} ${room} ${reservation.unit.name}.`
    : `${guest} ${done}.`;
  const refresh = () => queryClient.invalidateQueries({ queryKey: hostKeys.property(propertyId) });

  const action = useMutation({
    mutationFn: () => api(kind, { params: { propertyId, reservationId: reservation.id } }),
    // Stays pending until the lists are fresh, so the row changes once, from button to done.
    onSuccess: async () => {
      onDone(message);
      await refresh();
    },
    onError: async (error) => {
      // A colleague got there first, or the stay moved on: show what is true now.
      if (isApiError(error, 'INVALID_TRANSITION', 'STAY_ENDED', 'ARRIVAL_NOT_DUE')) {
        await refresh();
      }
    },
  });

  return (
    <>
      <Button
        variant={kind === 'checkIn' ? 'primary' : 'secondary'}
        aria-label={`${label} ${guest}`}
        isPending={action.isPending}
        onPress={() => {
          action.mutate();
        }}
      >
        {label}
      </Button>
      {action.isError && (
        <p role="alert" className="max-w-56 pt-1.5 text-label text-danger @lg:text-right">
          {isApiError(action.error, 'INVALID_TRANSITION', 'STAY_ENDED')
            ? 'This booking changed meanwhile. The list is up to date now.'
            : `Could not ${label.toLowerCase()}. Try again.`}
        </p>
      )}
    </>
  );
}
