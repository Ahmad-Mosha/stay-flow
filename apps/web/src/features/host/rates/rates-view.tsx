'use client';

import type {
  HostUnitTypeListResponse,
  HostUnitTypeResponse,
  RateOverrideListResponse,
} from '@stay-flow/contracts';
import { useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api } from '@/api/client';
import { formatAmount, formatDateSpan, formatMoney, plural } from '@/lib/format';
import { routes } from '@/lib/routes';
import { useServerNow } from '@/lib/use-server-now';
import { Button } from '@/ui/button';
import { cx } from '@/ui/cx';
import { PlusIcon } from '@/ui/icons';
import { ButtonLink } from '@/ui/link';
import { Notice, type NoticeMessage } from '@/ui/notice';
import { Skeleton } from '@/ui/skeleton';
import { StatePanel } from '@/ui/state-panel';
import { addDays, daysBetween } from '../calendar/tape';
import { useHost } from '../host-context';
import { hostKeys } from '../host-keys';
import { canManage } from '../permissions';
import { todayAt } from '../property-time';
import { BaseRateDialog } from './base-rate-dialog';
import { RemoveSeasonDialog } from './remove-season-dialog';
import { SeasonDialog } from './season-dialog';
import {
  coversTonight,
  formatChange,
  offsetOf,
  placeSeason,
  rateChange,
  rateChangeLabel,
  seasonWindow,
  type Season,
} from './seasons';

export interface RatesViewProps {
  /** Read by the server for the first paint. */
  initial: { unitTypes: HostUnitTypeListResponse; rateOverrides: RateOverrideListResponse };
}

type RatesDialog =
  | { kind: 'season' }
  | { kind: 'base'; unitType: HostUnitTypeResponse }
  | { kind: 'remove'; season: Season };

/** What each room type costs a night, and the seasons that price some nights differently. */
export function RatesView({ initial }: RatesViewProps) {
  const { property } = useHost();
  const editable = canManage(property.role, 'inventory');
  const today = todayAt(property.timeZone, useServerNow(60_000));
  const propertyParams = { propertyId: property.id };
  const { data: unitTypeList } = useQuery({
    queryKey: hostKeys.unitTypes(property.id),
    queryFn: ({ signal }) => api('listUnitTypes', { params: propertyParams, signal }),
    initialData: initial.unitTypes,
  });
  const { data: seasonList } = useQuery({
    queryKey: hostKeys.rateOverrides(property.id),
    queryFn: ({ signal }) => api('listRateOverrides', { params: propertyParams, signal }),
    initialData: initial.rateOverrides,
  });
  const [dialog, setDialog] = useState<RatesDialog | null>(null);
  // The season under the pointer or focus, lit up in both the chart and the list.
  const [active, setActive] = useState<string | null>(null);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);
  const done = (text: string) => {
    setNotice({ text, tone: 'done' });
  };
  const closeDialog = () => {
    setDialog(null);
  };

  const { unitTypes } = unitTypeList;
  const seasons = seasonList.rateOverrides.flatMap((season): Season[] => {
    const unitType = unitTypes.find((type) => type.id === season.unitTypeId);
    return unitType ? [{ ...season, unitType }] : [];
  });
  const thisYear = today.slice(0, 4);
  const spanOf = (season: Season) =>
    formatDateSpan(season.nights.from, addDays(season.nights.to, -1), thisYear);

  return (
    <div className="flex flex-col gap-8 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-2">
          <p className="font-mono text-label tracking-[0.04em] text-ink-3 uppercase">
            {property.name} · Prices a night in {property.currency}
          </p>
          <h1 className="font-display text-[2.5rem] leading-none font-normal tracking-[-0.02em]">
            Rates
          </h1>
        </div>
        {editable && unitTypes.length > 0 ? (
          <Button
            variant="secondary"
            size="sm"
            onPress={() => {
              setDialog({ kind: 'season' });
            }}
          >
            <PlusIcon className="size-4" />
            Add seasonal rate
          </Button>
        ) : (
          !editable && (
            <p className="text-small text-ink-3">Only owners and managers can change rates.</p>
          )
        )}
      </header>

      {unitTypes.length === 0 ? (
        <StatePanel
          eyebrow="Nothing to price yet"
          title="Add a room type first"
          action={
            editable && <ButtonLink href={routes.rooms(property.slug)}>Go to Rooms</ButtonLink>
          }
        >
          Rates belong to room types, such as “Garden Double”. Add one on the Rooms page with its
          base rate, then set seasonal rates here.
        </StatePanel>
      ) : (
        <>
          <section aria-labelledby="base-rates" className="flex flex-col gap-4">
            <SectionHeading id="base-rates" title="Base rates">
              What each room type costs a night, unless a seasonal rate covers the night.
            </SectionHeading>
            <ul className="divide-y divide-rule rounded-lg border border-rule bg-paper">
              {unitTypes.map((unitType) => {
                const seasonCount = seasons.filter(
                  (season) => season.unitTypeId === unitType.id,
                ).length;
                return (
                  <li
                    key={unitType.id}
                    className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 sm:px-6"
                  >
                    <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
                      <p className="truncate font-semibold">{unitType.name}</p>
                      <p className="text-small text-ink-3">
                        Sleeps {unitType.maxGuests} · {plural(unitType.units.length, 'room')} ·{' '}
                        {seasonCount === 0
                          ? 'No seasonal rates'
                          : plural(seasonCount, 'seasonal rate')}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-6 max-sm:w-full">
                      <p className="numerals flex items-baseline gap-1.5">
                        <span className="font-display text-headline">
                          {formatAmount(unitType.baseRateMinor, property.currency)}
                        </span>
                        <span className="font-mono text-label text-ink-3">{property.currency}</span>
                      </p>
                      {editable && (
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Change the base rate of ${unitType.name}`}
                          onPress={() => {
                            setDialog({ kind: 'base', unitType });
                          }}
                        >
                          Change
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="seasonal-rates" className="flex flex-col gap-4">
            <SectionHeading id="seasonal-rates" title="Seasonal rates">
              Another rate for chosen nights, such as the winter holidays. It wins over the base
              rate on those nights.
            </SectionHeading>
            {seasons.length === 0 ? (
              <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed border-rule-strong px-5 py-6 sm:px-6">
                <p className="max-w-prose text-small text-ink-2">
                  No seasonal rates ahead, so every night sells at its base rate. Add one for the
                  busy weeks, or for a quiet season with a lower price.
                </p>
                {editable && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onPress={() => {
                      setDialog({ kind: 'season' });
                    }}
                  >
                    <PlusIcon className="size-4" />
                    Add seasonal rate
                  </Button>
                )}
              </div>
            ) : (
              <>
                <SeasonChart
                  unitTypes={unitTypes}
                  seasons={seasons}
                  today={today}
                  active={active}
                  onActive={setActive}
                  spanOf={spanOf}
                />
                <ul
                  aria-label="Seasonal rates, soonest first"
                  className="divide-y divide-rule rounded-lg border border-rule bg-paper"
                >
                  {seasons.map((season) => (
                    <SeasonRow
                      key={season.id}
                      season={season}
                      span={spanOf(season)}
                      current={coversTonight(season.nights, today)}
                      active={active === season.id}
                      onActive={setActive}
                      onRemove={
                        editable
                          ? () => {
                              setDialog({ kind: 'remove', season });
                            }
                          : null
                      }
                    />
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}

      <Notice
        message={notice}
        onDismiss={() => {
          setNotice(null);
        }}
      />
      <SeasonDialog
        isOpen={dialog?.kind === 'season'}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeDialog();
        }}
        unitTypes={unitTypes}
        today={today}
        onAdded={done}
      />
      {dialog?.kind === 'base' && (
        <BaseRateDialog unitType={dialog.unitType} onClose={closeDialog} onSaved={done} />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveSeasonDialog
          season={dialog.season}
          span={spanOf(dialog.season)}
          onClose={closeDialog}
          onRemoved={done}
        />
      )}
    </div>
  );
}

function SectionHeading({ id, title, children }: { id: string; title: string; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="font-display text-headline font-normal">
        {title}
      </h2>
      <p className="max-w-prose text-small text-ink-2">{children}</p>
    </div>
  );
}

interface SeasonRowProps {
  season: Season;
  span: string;
  current: boolean;
  active: boolean;
  onActive: (id: string | null) => void;
  /** Null when the user may not change rates. */
  onRemove: (() => void) | null;
}

function SeasonRow({ season, span, current, active, onActive, onRemove }: SeasonRowProps) {
  const { property } = useHost();
  const change = rateChange(season.rateMinor, season.unitType.baseRateMinor);
  const light = () => {
    onActive(season.id);
  };
  const unlight = () => {
    onActive(null);
  };
  return (
    <li
      onPointerEnter={light}
      onPointerLeave={unlight}
      className={cx(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-4 transition-colors first:rounded-t-lg last:rounded-b-lg sm:px-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9rem_auto]',
        active && 'bg-ground-dim',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold">{season.label}</span>
          {current && (
            <span className="shrink-0 rounded-sm border border-ink px-1.5 font-mono text-[0.625rem] leading-4 uppercase">
              On now
            </span>
          )}
        </p>
        <p className="truncate text-small text-ink-3">{season.unitType.name}</p>
      </div>
      <div className="row-start-2 flex flex-col gap-0.5 text-small md:row-start-auto">
        <p>{span}</p>
        <p className="text-ink-3">
          {plural(daysBetween(season.nights.from, season.nights.to), 'night')}
        </p>
      </div>
      <div className="flex flex-col items-end gap-0.5 text-right">
        <p className="numerals font-semibold">{formatMoney(season.rateMinor, property.currency)}</p>
        <p
          className={cx(
            'font-mono text-label',
            change > 0 ? 'text-ink-2' : change < 0 ? 'text-success' : 'text-ink-3',
          )}
        >
          {rateChangeLabel(change)}
        </p>
      </div>
      {onRemove && (
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Remove ${season.label} for ${season.unitType.name}`}
          onPress={onRemove}
          className="row-start-2 justify-self-end md:row-start-auto"
        >
          Remove
        </Button>
      )}
    </li>
  );
}

interface SeasonChartProps {
  unitTypes: HostUnitTypeResponse[];
  seasons: Season[];
  today: string;
  active: string | null;
  onActive: (id: string | null) => void;
  spanOf: (season: Season) => string;
}

/**
 * The next twelve months, one row per room type, with each season as a tape. It repeats the
 * list below for the eye, so screen readers skip it.
 */
function SeasonChart({ unitTypes, seasons, today, active, onActive, spanOf }: SeasonChartProps) {
  const { property } = useHost();
  const chart = seasonWindow(today);
  const todayOffset = `${offsetOf(today, chart)}%`;
  return (
    <figure
      aria-hidden="true"
      className="hidden flex-col rounded-lg border border-rule bg-paper md:flex"
    >
      <div className="grid grid-cols-[10rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)]">
        <div className="border-b border-rule" />
        <div className="relative h-12 border-b border-rule">
          {chart.months.map((month) => (
            <span
              key={month.start}
              style={{ left: `${offsetOf(month.start, chart)}%` }}
              className="absolute inset-y-0 flex flex-col justify-center gap-0.5 border-l border-rule pl-1.5 font-mono text-[0.625rem] leading-3 text-ink-3 uppercase"
            >
              <span className="text-ink-2">{month.label}</span>
              <span>{month.year}</span>
            </span>
          ))}
          <span
            style={{ left: todayOffset }}
            className="absolute bottom-0 h-2 w-0.5 -translate-x-1/2 bg-action"
          />
        </div>
        {unitTypes.map((unitType) => (
          <Fragment key={unitType.id}>
            <div className="flex min-w-0 items-center border-b border-rule px-5 text-small font-semibold [&:nth-last-child(2)]:border-b-0">
              <span className="truncate">{unitType.name}</span>
            </div>
            <div className="relative h-14 border-b border-rule last:border-b-0">
              {chart.months.slice(1).map((month) => (
                <span
                  key={month.start}
                  style={{ left: `${offsetOf(month.start, chart)}%` }}
                  className="absolute inset-y-0 w-px bg-rule/70"
                />
              ))}
              <span
                style={{ left: todayOffset }}
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-action/70"
              />
              {seasons
                .filter((season) => season.unitTypeId === unitType.id)
                .map((season) => {
                  const place = placeSeason(season.nights, chart);
                  if (!place) return null;
                  const above = season.rateMinor > unitType.baseRateMinor;
                  return (
                    <div
                      key={season.id}
                      onPointerEnter={() => {
                        onActive(season.id);
                      }}
                      onPointerLeave={() => {
                        onActive(null);
                      }}
                      style={{ left: `${place.left}%`, width: `max(${place.width}%, 0.5rem)` }}
                      className={cx(
                        'group @container absolute inset-y-3 flex items-center rounded-sm border px-2 text-label transition-shadow',
                        above
                          ? 'border-tape-in bg-tape-in font-semibold text-tape-in-ink'
                          : 'border-field-edge bg-tape-stay font-medium text-ink',
                        active === season.id &&
                          'z-10 ring-2 ring-action ring-offset-2 ring-offset-paper',
                      )}
                    >
                      <span className="hidden font-mono @[2.75rem]:block @[7rem]:hidden">
                        {formatChange(rateChange(season.rateMinor, unitType.baseRateMinor))}
                      </span>
                      <span className="hidden min-w-0 truncate @[7rem]:block">{season.label}</span>
                      <span className="pointer-events-none absolute top-full left-0 z-20 mt-2 hidden rounded-sm bg-ink px-2 py-1 font-medium whitespace-nowrap text-ground shadow-overlay group-hover:block">
                        {season.label} · {spanOf(season)} ·{' '}
                        {formatMoney(season.rateMinor, property.currency)}
                      </span>
                    </div>
                  );
                })}
            </div>
          </Fragment>
        ))}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-rule px-5 py-3 text-label text-ink-3">
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded-[3px] bg-tape-in" />
          Above base rate
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-6 rounded-[3px] border border-field-edge bg-tape-stay" />
          At or below base rate
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-0.5 bg-action" />
          Today
        </span>
      </figcaption>
    </figure>
  );
}

export function RatesSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading rates"
      className="flex flex-col gap-8 px-4 py-6 sm:px-8 lg:px-10 lg:py-8"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-10 w-40" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
      <Skeleton className="h-72 rounded-lg" />
    </div>
  );
}
