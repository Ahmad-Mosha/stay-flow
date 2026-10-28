'use client';

import type { PropertyResponse } from '@stay-flow/contracts';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDate, plural } from '@/lib/format';
import { Button } from '@/ui/button';
import { StepperField } from '@/ui/stepper-field';
import { serverNow } from '@/api/server-clock';
import { routes } from '@/lib/routes';
import { saveHold } from './hold-store';
import { PriceCalendar } from './price-calendar';
import { RoomResults } from './room-results';
import { MAX_GUESTS, readStaySearch, staySearchQuery, type StaySearch } from './stay-search';

/** The search half of the property page. The stay lives in the URL, so it can be shared or reloaded. */
export function BookingSearch({ property }: { property: PropertyResponse }) {
  const router = useRouter();
  const search = readStaySearch(useSearchParams());
  const dates =
    search.checkIn && search.checkOut
      ? { checkIn: search.checkIn, checkOut: search.checkOut }
      : null;

  const update = (change: Partial<StaySearch>) => {
    router.replace(routes.property(property.slug, staySearchQuery({ ...search, ...change })), {
      scroll: false,
    });
  };

  return (
    <div className="flex flex-col gap-8">
      <div
        role="group"
        aria-label="Your stay"
        className="grid grid-cols-2 overflow-hidden rounded-lg border border-rule-strong bg-paper sm:grid-cols-[1fr_1fr_auto]"
      >
        <SearchCell label="Check in" value={search.checkIn ? formatDate(search.checkIn) : null} />
        <SearchCell
          label="Check out"
          value={search.checkOut ? formatDate(search.checkOut) : null}
          className="border-l border-rule"
        />
        <div className="col-span-2 flex items-center justify-between gap-4 border-t border-rule bg-raised px-5 py-3 sm:col-span-1 sm:border-t-0 sm:border-l sm:py-2">
          <StepperField
            label="Guests"
            value={search.guests}
            minValue={1}
            maxValue={MAX_GUESTS}
            onChange={(guests) => {
              if (Number.isInteger(guests)) update({ guests });
            }}
            className="flex-row items-center gap-4"
          />
          {dates && (
            <Button
              variant="quiet"
              className="sm:hidden"
              onPress={() => {
                update({ checkIn: null, checkOut: null });
              }}
            >
              Clear dates
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <aside
          aria-label="Availability"
          className="flex flex-col gap-4 rounded-lg border border-rule bg-paper p-4 sm:p-5 lg:sticky lg:top-6 lg:w-[24rem] lg:shrink-0"
        >
          <PriceCalendar
            slug={property.slug}
            timeZone={property.timeZone}
            guests={search.guests}
            value={dates}
            onChange={(stay) => {
              update(stay);
            }}
          />
          <div className="flex flex-col gap-1.5 border-t border-rule pt-4 text-small text-ink-2">
            <p>
              Prices are per night, from the lowest free room for {plural(search.guests, 'guest')}.
            </p>
            {dates && (
              <Button
                variant="quiet"
                className="hidden self-start px-0 sm:inline-flex"
                onPress={() => {
                  update({ checkIn: null, checkOut: null });
                }}
              >
                Clear dates
              </Button>
            )}
          </div>
        </aside>

        <div id="rooms" className="min-w-0 flex-1 scroll-mt-6">
          <RoomResults
            property={property}
            checkIn={search.checkIn}
            checkOut={search.checkOut}
            guests={search.guests}
            onHeld={(reservation) => {
              saveHold({
                propertySlug: property.slug,
                reservation,
                heldAt: serverNow(),
              });
              router.push(routes.checkout(property.slug, reservation.id));
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SearchCell({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 bg-raised px-5 py-3.5 ${className ?? ''}`}>
      <span className="font-mono text-label text-ink-3 uppercase">{label}</span>
      <span className={value ? 'text-lead font-semibold text-ink' : 'text-lead text-ink-3'}>
        {value ?? 'Pick a date'}
      </span>
    </div>
  );
}
