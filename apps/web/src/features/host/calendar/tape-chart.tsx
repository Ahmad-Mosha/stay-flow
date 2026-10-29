'use client';

import type {
  CalendarBarResponse,
  HostUnitTypeResponse,
  RoomCalendarResponse,
} from '@stay-flow/contracts';
import { parseDate } from '@internationalized/date';
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { formatAmount, formatDate, formatStay, plural } from '@/lib/format';
import { cx } from '@/ui/cx';
import { tapeLabel } from '@/ui/status-tape';
import { minutesLeft } from '../today/rooms-tonight';
import {
  barLabel,
  daysBetween,
  freeRooms,
  placementOf,
  takesNight,
  type CalendarWindow,
  type Placement,
} from './tape';

/** A stay or a block the panel can show, by the id the address carries. */
export interface Selection {
  kind: 'stay' | 'block';
  id: string;
}

/** Nights a host has dragged across on one room, to block. */
export interface NightsPicked {
  unitId: string;
  from: string;
  to: string;
}

interface TapeChartProps {
  calendar: RoomCalendarResponse;
  unitTypes: HostUnitTypeResponse[] | undefined;
  range: CalendarWindow;
  today: string;
  now: number;
  currency: string;
  selected: Selection | null;
  onSelect: (selection: Selection) => void;
  onPickNights: (nights: NightsPicked) => void;
  /** Says something to screen readers, as when nights cannot be blocked. */
  onAnnounce: (message: string) => void;
}

interface PlacedBar {
  key: string;
  selection: Selection;
  bar: CalendarBarResponse;
  placement: Placement;
}

function keyOf(bar: CalendarBarResponse): Selection {
  return bar.kind === 'block'
    ? { kind: 'block', id: bar.id }
    : { kind: 'stay', id: bar.reservation.id };
}

/** The rooms column, `w-24`, which stays put while the nights scroll. */
const ROOM_COLUMN_PX = 96;

/** The share of the track a number of columns takes, for CSS. */
function percent(columns: number, total: number): string {
  return `${String((columns / total) * 100)}%`;
}

/**
 * The tape chart: rooms down the side, nights across the top, and every stay and block as a bar
 * from midday to midday. Arrow keys move between bars; dragging across free nights blocks them.
 */
export function TapeChart({
  calendar,
  unitTypes,
  range,
  today,
  now,
  currency,
  selected,
  onSelect,
  onPickNights,
  onAnnounce,
}: TapeChartProps) {
  const columns = range.days.length;
  const rows = calendar.unitTypes.flatMap((unitType) =>
    unitType.units.map((unit) => ({
      unit,
      bars: unit.bars
        .flatMap((bar): PlacedBar[] => {
          const placement = placementOf(bar.nights, range);
          const selection = keyOf(bar);
          return placement ? [{ key: selection.id, selection, bar, placement }] : [];
        })
        .toSorted((a, b) => a.placement.start - b.placement.start),
    })),
  );
  const allBars = rows.flatMap((row) => row.bars);
  const barRefs = useRef(new Map<string, HTMLButtonElement>());
  const [focusKey, setFocusKey] = useState<string | null>(null);
  // One bar in the chart takes Tab; arrow keys move from there.
  const tabStop =
    allBars.find((placed) => placed.key === (focusKey ?? selected?.id))?.key ?? allBars[0]?.key;

  const moveFocus = (event: KeyboardEvent, rowIndex: number, barIndex: number) => {
    const row = rows[rowIndex];
    const current = row?.bars[barIndex];
    if (!row || !current) return;
    let target: PlacedBar | undefined;
    if (event.key === 'ArrowRight') target = row.bars[barIndex + 1];
    else if (event.key === 'ArrowLeft') target = row.bars[barIndex - 1];
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // The nearest bar in the next room that has any, closest to the same night.
      for (let index = rowIndex + step; index >= 0 && index < rows.length; index += step) {
        const candidates = rows[index]?.bars ?? [];
        if (candidates.length === 0) continue;
        target = candidates.toSorted(
          (a, b) =>
            Math.abs(a.placement.start - current.placement.start) -
            Math.abs(b.placement.start - current.placement.start),
        )[0];
        break;
      }
    } else return;
    event.preventDefault();
    if (!target) return;
    setFocusKey(target.key);
    barRefs.current.get(target.key)?.focus();
  };

  // Dragging across the free nights of one room, to block them.
  const [drag, setDrag] = useState<{ unitId: string; anchor: number; current: number } | null>(
    null,
  );
  const firstOpenColumn = Math.max(daysBetween(range.from, today), 0);
  const columnAt = (event: PointerEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const column = Math.floor(((event.clientX - box.left) / box.width) * columns);
    return Math.min(Math.max(column, firstOpenColumn), columns - 1);
  };

  const free = freeRooms(calendar, range);
  const todayColumn = daysBetween(range.from, today);

  // When the chart is wider than the screen, open it at today rather than at the first night.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const columnWidth = (element.scrollWidth - ROOM_COLUMN_PX) / columns;
    const showsToday = todayColumn >= 0 && todayColumn < columns;
    element.scrollLeft = showsToday ? Math.max(todayColumn - 2, 0) * columnWidth : 0;
  }, [range.from, columns, todayColumn]);

  return (
    <div ref={scroller} className="overflow-x-auto rounded-lg border border-rule bg-paper">
      <div style={{ minWidth: `calc(6rem + ${String(columns)} * 2.25rem)` }}>
        <div className="flex border-b border-rule">
          <div className="sticky left-0 z-20 flex w-24 shrink-0 items-end bg-paper px-3.5 pb-2.5 font-mono text-[0.6875rem] text-ink-3">
            ROOM
          </div>
          <div
            className="grid flex-1"
            style={{ gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))` }}
          >
            {range.days.map((day, index) => (
              <DayHead key={day} day={day} first={index === 0} today={day === today} />
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 left-24"
          >
            {range.days.map((day, index) => {
              const weekday = parseDate(day).toDate('UTC').getUTCDay();
              // Friday and Saturday nights sell first, so they stand out.
              return weekday === 5 || weekday === 6 ? (
                <span
                  key={day}
                  className="absolute inset-y-0 bg-ink/[0.025]"
                  style={{ left: percent(index, columns), width: percent(1, columns) }}
                />
              ) : null;
            })}
            {todayColumn >= 0 && todayColumn < columns && (
              <span
                className="absolute inset-y-0 border-x border-action/45 bg-action/[0.07]"
                style={{ left: percent(todayColumn, columns), width: percent(1, columns) }}
              />
            )}
          </div>

          {calendar.unitTypes.map((unitType) => {
            const rate = unitTypes?.find(({ id }) => id === unitType.id)?.baseRateMinor;
            return (
              <Fragment key={unitType.id}>
                <div className="relative flex h-[1.875rem] items-center border-b border-rule/70">
                  <div className="sticky left-0 z-10 flex items-baseline gap-3 pl-3.5 whitespace-nowrap">
                    <span className="text-label font-semibold">{unitType.name}</span>
                    <span className="font-mono text-[0.6875rem] text-ink-3 uppercase">
                      {plural(unitType.units.length, 'room')}
                      {rate !== undefined && ` · base ${formatAmount(rate, currency)}`}
                    </span>
                  </div>
                </div>
                {unitType.units.map((unit) => {
                  const rowIndex = rows.findIndex((row) => row.unit.id === unit.id);
                  const row = rows[rowIndex];
                  const picking = drag?.unitId === unit.id ? drag : null;
                  return (
                    <div key={unit.id} className="relative flex h-11 border-b border-rule/70">
                      <div className="sticky left-0 z-10 flex w-24 shrink-0 items-center bg-paper px-3.5 font-mono text-small">
                        {unit.name}
                      </div>
                      <div
                        role="group"
                        aria-label={`Room ${unit.name}, ${unitType.name}`}
                        className="relative flex-1 cursor-crosshair touch-pan-x touch-pan-y select-none"
                        style={{
                          backgroundImage:
                            'linear-gradient(to right, color-mix(in oklab, var(--color-rule) 70%, transparent) 1px, transparent 1px)',
                          backgroundSize: `calc(100% / ${String(columns)}) 100%`,
                        }}
                        onPointerDown={(event) => {
                          // Mouse and pen only: on a touch screen a drag scrolls the chart.
                          if (event.button !== 0 || event.pointerType === 'touch') return;
                          if (event.target !== event.currentTarget) return;
                          if (firstOpenColumn >= columns) return;
                          event.currentTarget.setPointerCapture(event.pointerId);
                          const column = columnAt(event);
                          setDrag({ unitId: unit.id, anchor: column, current: column });
                        }}
                        onPointerMove={(event) => {
                          if (picking) setDrag({ ...picking, current: columnAt(event) });
                        }}
                        onPointerUp={() => {
                          if (!picking) return;
                          setDrag(null);
                          const first = Math.min(picking.anchor, picking.current);
                          const last = Math.max(picking.anchor, picking.current);
                          const nights = range.days.slice(first, last + 1);
                          const from = nights[0];
                          const lastNight = nights.at(-1);
                          if (!from || !lastNight) return;
                          if (
                            unit.bars.some((bar) => nights.some((night) => takesNight(bar, night)))
                          ) {
                            onAnnounce(`Room ${unit.name} is not free on all of those nights.`);
                            return;
                          }
                          onPickNights({
                            unitId: unit.id,
                            from,
                            to: parseDate(lastNight).add({ days: 1 }).toString(),
                          });
                        }}
                        onPointerCancel={() => {
                          setDrag(null);
                        }}
                      >
                        {picking && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-y-1 rounded-sm border-2 border-dashed border-action bg-action/10"
                            style={{
                              left: percent(Math.min(picking.anchor, picking.current), columns),
                              width: percent(
                                Math.abs(picking.current - picking.anchor) + 1,
                                columns,
                              ),
                            }}
                          />
                        )}
                        {row?.bars.map((placed, barIndex) => (
                          <Bar
                            key={placed.key}
                            placed={placed}
                            unitName={unit.name}
                            columns={columns}
                            today={today}
                            now={now}
                            selected={selected?.id === placed.key}
                            tabStop={tabStop === placed.key}
                            ref={(element) => {
                              if (element) barRefs.current.set(placed.key, element);
                              else barRefs.current.delete(placed.key);
                            }}
                            onPress={() => {
                              setFocusKey(placed.key);
                              onSelect(placed.selection);
                            }}
                            onKeyDown={(event) => {
                              moveFocus(event, rowIndex, barIndex);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>

        <div className="relative flex">
          <div className="sticky left-0 z-10 flex w-24 shrink-0 items-center bg-paper px-3.5 py-2.5 text-label text-ink-2">
            Free
          </div>
          <div
            className="grid flex-1"
            style={{ gridTemplateColumns: `repeat(${String(columns)}, minmax(0, 1fr))` }}
          >
            {free.map((count, index) => (
              <span
                key={range.days[index]}
                aria-label={`${formatDate(range.days[index] ?? range.from)}: ${plural(count, 'room')} free`}
                className={cx(
                  'numerals py-2.5 text-center font-mono text-label',
                  count === 0
                    ? 'font-medium text-danger'
                    : index === todayColumn
                      ? 'font-medium text-action'
                      : 'text-ink-2',
                )}
              >
                {count}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function DayHead({ day, first, today }: { day: string; first: boolean; today: boolean }) {
  const date = parseDate(day);
  return (
    <div
      className={cx(
        'flex flex-col items-center gap-0.5 border-l border-rule/70 py-2',
        today && 'bg-action/10 text-action',
      )}
    >
      <span className="h-3 font-mono text-[0.625rem] leading-3 text-ink-3 uppercase">
        {first || date.day === 1 ? formatDate(day, 'monthShort') : ''}
      </span>
      <span className="font-mono text-[0.625rem] leading-3 uppercase">
        {today ? 'Today' : formatDate(day, 'weekday').slice(0, 2)}
      </span>
      <span className={cx('numerals text-small', today ? 'font-bold' : 'font-medium')}>
        {date.day}
      </span>
    </div>
  );
}

const barStyles = {
  checked_in: 'border-tape-in bg-tape-in font-semibold text-tape-in-ink',
  confirmed: 'border-rule-strong bg-tape-stay font-medium text-ink',
  held: 'tape-hold border-hold font-semibold text-hold-ink',
  no_show: 'border-[1.5px] border-danger font-medium text-danger',
  ended: 'border-dashed border-rule-strong font-medium text-ink-3',
  block: 'tape-block border-block-line font-medium text-ink-2',
} as const;

interface BarProps {
  placed: PlacedBar;
  unitName: string;
  columns: number;
  today: string;
  now: number;
  selected: boolean;
  tabStop: boolean;
  ref: (element: HTMLButtonElement | null) => void;
  onPress: () => void;
  onKeyDown: (event: KeyboardEvent) => void;
}

function Bar({
  placed,
  unitName,
  columns,
  today,
  now,
  selected,
  tabStop,
  ref,
  onPress,
  onKeyDown,
}: BarProps) {
  const { bar, placement } = placed;
  const startInset = placement.clippedStart ? 0 : 2;
  const endInset = placement.clippedEnd ? 0 : 2;
  const stay = bar.kind === 'stay' ? bar.reservation : null;
  const arrives = stay?.status === 'confirmed' && stay.checkIn === today;
  const leaves = stay?.status === 'checked_in' && stay.checkOut === today;

  let style: string = barStyles.block;
  let text = barLabel(bar);
  let label = `Room ${unitName} blocked, ${formatStay(bar.nights.from, bar.nights.to)}: ${text}`;
  if (stay) {
    style =
      stay.status in barStyles ? barStyles[stay.status as keyof typeof barStyles] : barStyles.ended;
    if (stay.status === 'held') {
      const minutes = minutesLeft(Date.parse(stay.holdExpiresAt ?? stay.createdAt), now);
      text = `Held · ${String(minutes)} min`;
    }
    if (stay.status === 'no_show') text = `No-show · ${text}`;
    label = [
      stay.guest?.name ?? 'Held online',
      `room ${unitName}`,
      formatStay(stay.checkIn, stay.checkOut),
      tapeLabel(stay.status).toLowerCase(),
      arrives && 'arrives today',
      leaves && 'leaves today',
    ]
      .filter(Boolean)
      .join(', ');
  }

  return (
    <button
      type="button"
      ref={ref}
      data-bar={placed.key}
      tabIndex={tabStop ? 0 : -1}
      aria-label={label}
      {...(selected && { 'aria-current': 'true' })}
      onClick={onPress}
      onKeyDown={onKeyDown}
      className={cx(
        'absolute top-[7px] flex h-[1.875rem] cursor-pointer items-center truncate rounded-md border px-2 text-left text-label outline-hidden transition-shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action',
        style,
        placement.clippedStart && 'rounded-l-none',
        placement.clippedEnd && 'rounded-r-none',
        arrives && 'pl-3.5',
        leaves && 'pr-3.5',
        selected && 'ring-2 ring-action ring-offset-2 ring-offset-paper',
      )}
      style={{
        left: `calc(${percent(placement.start, columns)} + ${String(startInset)}px)`,
        width: `calc(${percent(placement.end - placement.start, columns)} - ${String(startInset + endInset)}px)`,
      }}
    >
      {arrives && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 left-1 h-4 w-1 rounded-full bg-action"
        />
      )}
      <span className="truncate">{text}</span>
      {leaves && (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1 h-4 w-1 rounded-full bg-action"
        />
      )}
    </button>
  );
}
