'use client';

import type {
  AvailabilityResponse,
  PropertyResponse,
  ReservationResponse,
} from '@stay-flow/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api, isApiError } from '@/api/client';
import { formatAmount, formatStay, plural } from '@/lib/format';
import { Button } from '@/ui/button';
import { cx } from '@/ui/cx';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { NightStrip } from './night-strip';
import { searchErrorCopy } from './stay-errors';

interface RoomResultsProps {
  property: PropertyResponse;
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  onHeld: (reservation: ReservationResponse) => void;
}

type UnitType = AvailabilityResponse['unitTypes'][number];

export function RoomResults({ property, checkIn, checkOut, guests, onHeld }: RoomResultsProps) {
  const slug = property.slug;
  const queryClient = useQueryClient();
  const search = checkIn && checkOut ? { checkIn, checkOut, guests } : null;

  const availability = useQuery({
    queryKey: ['availability', slug, search],
    queryFn: ({ signal }) =>
      // Only enabled once both dates are chosen.
      api('searchAvailability', {
        params: { slug },
        query: search ?? { checkIn: '', checkOut: '', guests },
        signal,
      }),
    enabled: search !== null,
    placeholderData: keepPreviousData,
  });

  // One key per room and stay, reused if the guest presses Reserve again after a dropped
  // connection, so a retry returns the first hold instead of taking a second room.
  const holdKeys = useRef(new Map<string, string>());
  const [lostRace, setLostRace] = useState<string | null>(null);
  const hold = useMutation({
    mutationFn: (unitType: string) => {
      if (!search) throw new Error('Choose dates first');
      const id = `${unitType}|${search.checkIn}|${search.checkOut}|${String(search.guests)}`;
      const key = holdKeys.current.get(id) ?? crypto.randomUUID();
      holdKeys.current.set(id, key);
      return api('placeHold', {
        params: { slug },
        body: { unitType, ...search },
        idempotencyKey: key,
      });
    },
    onMutate: () => {
      setLostRace(null);
    },
    onSuccess: (reservation) => {
      onHeld(reservation);
    },
    onError: (error, unitType) => {
      if (isApiError(error, 'SOLD_OUT')) {
        setLostRace(unitType);
        void queryClient.invalidateQueries({ queryKey: ['availability', slug] });
        void queryClient.invalidateQueries({ queryKey: ['availability-calendar', slug] });
      }
    },
  });

  if (!search) {
    return (
      <StatePanel
        eyebrow="Start here"
        title="Pick your nights on the calendar"
        className="min-h-64"
      >
        Choose the day you arrive, then the day you leave. Each room shows its price for every night
        of your stay before you hold it.
      </StatePanel>
    );
  }

  if (availability.isError && !availability.data) {
    return (
      <StatePanel
        tone="danger"
        eyebrow="No results"
        title="We could not show rooms for these dates"
        action={
          isApiError(availability.error) && availability.error.status < 500 ? undefined : (
            <Button variant="secondary" onPress={() => void availability.refetch()}>
              Try again
            </Button>
          )
        }
      >
        {searchErrorCopy(availability.error, property)}
      </StatePanel>
    );
  }

  const data = availability.data;
  const nights = data?.nights;
  const stale = availability.isPlaceholderData;

  return (
    <section aria-labelledby="results-title" className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="results-title" className="font-display text-headline font-normal sm:text-title">
          {data && !stale
            ? `${plural(data.nights, 'night')}, ${formatStay(data.checkIn, data.checkOut)}`
            : 'Finding rooms…'}
        </h2>
        <p aria-live="polite" className="text-small text-ink-2">
          {data && !stale
            ? `${plural(data.guests, 'guest')} · cheapest first · prices are the full total`
            : ''}
        </p>
      </div>

      {!data || stale ? (
        <div aria-hidden="true" className="flex flex-col gap-4">
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="flex flex-col gap-5 rounded-lg border border-rule bg-paper p-6 sm:p-7"
            >
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-18 w-full rounded-md" />
            </div>
          ))}
        </div>
      ) : data.unitTypes.length === 0 ? (
        <StatePanel eyebrow="No room fits" title={`No room here takes ${plural(guests, 'guest')}`}>
          Try fewer guests per room. You can book a second room for the rest of your party.
        </StatePanel>
      ) : (
        <>
          {data.unitTypes.every((type) => type.freeUnits === 0) && (
            <p className="rounded-md border border-dashed border-rule-strong bg-paper px-4 py-3 text-small text-ink-2">
              Every room is taken on at least one of these nights. Moving your dates by a day often
              helps: the calendar shows which nights are full.
            </p>
          )}
          <ul className="flex flex-col gap-4">
            {/* Cheapest first, as the API sends them, with sold-out rooms last. */}
            {data.unitTypes
              .toSorted((a, b) => Number(a.freeUnits === 0) - Number(b.freeUnits === 0))
              .map((type) => (
                <li key={type.slug}>
                  <RoomCard
                    type={type}
                    property={property}
                    currency={data.currency}
                    nights={nights ?? 0}
                    pending={hold.isPending && hold.variables === type.slug}
                    disabled={hold.isPending}
                    lostRace={lostRace === type.slug}
                    failed={
                      hold.isError &&
                      hold.variables === type.slug &&
                      !isApiError(hold.error, 'SOLD_OUT')
                    }
                    onReserve={() => {
                      hold.mutate(type.slug);
                    }}
                  />
                </li>
              ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface RoomCardProps {
  type: UnitType;
  property: PropertyResponse;
  currency: string;
  nights: number;
  pending: boolean;
  disabled: boolean;
  lostRace: boolean;
  failed: boolean;
  onReserve: () => void;
}

function RoomCard({
  type,
  property,
  currency,
  nights,
  pending,
  disabled,
  lostRace,
  failed,
  onReserve,
}: RoomCardProps) {
  const soldOut = type.freeUnits === 0;
  return (
    <article
      aria-labelledby={`room-${type.slug}`}
      className={cx(
        'flex flex-col gap-6 rounded-lg border border-rule bg-paper p-5 sm:p-7',
        soldOut && 'bg-transparent',
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-[1_1_18rem] flex-col gap-1.5">
          <h3
            id={`room-${type.slug}`}
            className={cx(
              'font-display text-headline font-normal sm:text-[1.875rem]',
              soldOut && 'text-ink-2',
            )}
          >
            {type.name}
          </h3>
          <p className="text-small text-ink-2 sm:text-body">{type.description}</p>
        </div>
        <div className="flex flex-col gap-1 sm:items-end">
          <span className="font-mono text-label text-ink-2 uppercase">
            Up to {plural(type.maxGuests, 'guest')}
          </span>
          {type.freeUnits === 1 && (
            <span className="text-small font-semibold text-ink">Last room for these dates</span>
          )}
        </div>
      </div>

      {soldOut ? (
        <p className="flex items-center gap-3 border-t border-dashed border-rule-strong pt-4 text-small text-ink-2">
          <span className="font-mono text-label text-ink-3 uppercase">Sold out</span>
          Taken on at least one of your nights.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
          <NightStrip
            nightlyRates={type.nightlyRates}
            currency={currency}
            checkInTime={property.checkInTime}
            checkOutTime={property.checkOutTime}
            className="flex-[999_1_22rem]"
          />
          <div className="flex flex-[1_1_15rem] flex-col gap-2.5">
            <p className="flex flex-col gap-1">
              <span className="font-mono text-label text-ink-2 uppercase">
                Total · {plural(nights, 'night')}
              </span>
              <span className="numerals text-headline font-semibold whitespace-nowrap">
                {formatAmount(type.totalMinor, currency)}{' '}
                <span className="text-small font-medium text-ink-2">{currency}</span>
              </span>
            </p>
            <Button
              size="lg"
              isPending={pending}
              isDisabled={disabled && !pending}
              onPress={onReserve}
            >
              {pending ? 'Holding your room' : 'Reserve'}
            </Button>
            <p className="text-center text-label text-ink-3">
              We hold it for 10 minutes while you confirm
            </p>
          </div>
        </div>
      )}

      {lostRace && (
        <p role="alert" className="border-t border-rule pt-4 text-small text-ink">
          <strong className="font-semibold">Someone just booked the last {type.name}.</strong>{' '}
          Nothing was held or charged. The list now shows what is still free.
        </p>
      )}
      {failed && (
        <p role="alert" className="border-t border-rule pt-4 text-small text-danger">
          We could not hold this room. Press Reserve to try again; you will not get two rooms.
        </p>
      )}
    </article>
  );
}
