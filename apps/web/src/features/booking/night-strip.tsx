import { parseDate } from '@internationalized/date';
import { cx } from '@/ui/cx';
import { formatAmount, formatDate, formatDayRange, plural } from '@/lib/format';

interface NightlyRate {
  date: string;
  rateMinor: number;
}

interface NightStripProps {
  nightlyRates: readonly NightlyRate[];
  currency: string;
  checkInTime: string;
  checkOutTime: string;
  className?: string;
}

/**
 * One cell of the strip: a single night, a run of nights in a row that share a price, or, when
 * prices change too often to show in order, every night at one price.
 */
type Cell =
  | { kind: 'night'; date: string; rateMinor: number }
  | { kind: 'run'; first: string; last: string; nights: number; rateMinor: number }
  | { kind: 'rate'; nights: number; rateMinor: number };

/** More cells than this do not fit a phone without cutting prices short. */
export const MAX_CELLS = 4;

export function cellsFor(rates: readonly NightlyRate[]): Cell[] {
  if (rates.length <= MAX_CELLS) {
    return rates.map(({ date, rateMinor }) => ({ kind: 'night', date, rateMinor }));
  }
  const runs: Extract<Cell, { kind: 'run' }>[] = [];
  for (const { date, rateMinor } of rates) {
    const previous = runs.at(-1);
    if (previous?.rateMinor === rateMinor) {
      previous.last = date;
      previous.nights += 1;
    } else {
      runs.push({ kind: 'run', first: date, last: date, nights: 1, rateMinor });
    }
  }
  if (runs.length <= MAX_CELLS) return runs;

  const nightsAt = new Map<number, number>();
  for (const { rateMinor } of rates) nightsAt.set(rateMinor, (nightsAt.get(rateMinor) ?? 0) + 1);
  return [...nightsAt]
    .sort(([a], [b]) => a - b)
    .map(([rateMinor, nights]) => ({ kind: 'rate', nights, rateMinor }));
}

/** Neighbouring cells that are all seasonal, or all not, so one bracket spans a seasonal stretch. */
function stretchesOf(cells: readonly Cell[], lowest: number) {
  const stretches: { seasonal: boolean; cells: number }[] = [];
  for (const cell of cells) {
    const seasonal = cell.rateMinor > lowest;
    const previous = stretches.at(-1);
    if (previous?.seasonal === seasonal) previous.cells += 1;
    else stretches.push({ seasonal, cells: 1 });
  }
  return stretches;
}

const capClassName =
  'flex w-9 shrink-0 flex-col items-center justify-center border-rule-strong font-mono text-[0.625rem] leading-4 text-ink-3 sm:w-10';

/**
 * The stay read like a ticket: check-in time, the price of each night, check-out time. Nights
 * above the stay's lowest price are tinted and bracketed, so a seasonal rate is never a surprise
 * in the total.
 */
export function NightStrip({
  nightlyRates,
  currency,
  checkInTime,
  checkOutTime,
  className,
}: NightStripProps) {
  const lowest = Math.min(...nightlyRates.map((night) => night.rateMinor));
  const cells = cellsFor(nightlyRates);
  const stretches = stretchesOf(cells, lowest);

  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {stretches.some((stretch) => stretch.seasonal) && (
        <div aria-hidden="true" className="flex font-mono text-[0.625rem] leading-4 text-ink-2">
          <span className="w-9 shrink-0 sm:w-10" />
          {stretches.map((stretch, index) => (
            <span
              key={index}
              style={{ flexGrow: stretch.cells }}
              className={cx(
                'h-4 min-w-0 basis-0 overflow-hidden text-center whitespace-nowrap',
                stretch.seasonal && 'rounded-t-sm border-x border-t border-ink-2',
              )}
            >
              {stretch.seasonal ? (stretch.cells > 1 ? 'SEASONAL RATE' : 'SEASONAL') : ''}
            </span>
          ))}
          <span className="w-9 shrink-0 sm:w-10" />
        </div>
      )}
      <ol aria-label="Price of each night" className="flex items-stretch">
        <li className={cx(capClassName, 'rounded-l-md border border-r-0')}>
          <span aria-hidden="true">IN</span>
          <span className="sr-only">Check in from</span>
          {checkInTime}
        </li>
        {cells.map((cell, index) => (
          <li
            key={
              cell.kind === 'night' ? cell.date : cell.kind === 'run' ? cell.first : cell.rateMinor
            }
            className={cx(
              'flex min-w-0 flex-1 basis-0 flex-col gap-0.5 border border-rule-strong px-2 py-2 sm:px-3',
              index > 0 && 'border-l-0',
              cell.rateMinor > lowest ? 'bg-ground-dim' : 'bg-raised',
            )}
          >
            <CellContent cell={cell} currency={currency} />
          </li>
        ))}
        <li className={cx(capClassName, 'rounded-r-md border border-l-0')}>
          <span aria-hidden="true">OUT</span>
          <span className="sr-only">Check out by</span>
          {checkOutTime}
        </li>
      </ol>
    </div>
  );
}

const labelClassName = 'font-mono text-[0.625rem] leading-4 text-ink-3 uppercase';
const priceClassName = 'numerals truncate font-mono text-[0.75rem] leading-5 sm:text-small';

function CellContent({ cell, currency }: { cell: Cell; currency: string }) {
  const amount = formatAmount(cell.rateMinor, currency);
  switch (cell.kind) {
    case 'night':
      return (
        <>
          <span aria-hidden="true" className={labelClassName}>
            {formatDate(cell.date, 'weekday')}
          </span>
          <span className="truncate text-small font-semibold">
            <span aria-hidden="true">{parseDate(cell.date).day}</span>
            <span className="sr-only">{formatDate(cell.date, 'long')}</span>
          </span>
          <span className={priceClassName}>
            {amount}
            <span className="sr-only"> {currency}</span>
          </span>
        </>
      );
    case 'run':
      return (
        <>
          <span className={labelClassName}>{plural(cell.nights, 'night')}</span>
          <span className="truncate text-small font-semibold">
            {cell.nights === 1 ? formatDate(cell.first) : formatDayRange(cell.first, cell.last)}
          </span>
          <span className={priceClassName}>
            {amount}
            <span className="sr-only"> {currency} a night</span>
          </span>
        </>
      );
    case 'rate':
      return (
        <>
          <span className={labelClassName}>{plural(cell.nights, 'night')}</span>
          <span className="numerals truncate text-small font-semibold">
            {amount}
            <span className="sr-only"> {currency}</span>
          </span>
          <span className="truncate font-mono text-[0.625rem] leading-5 text-ink-3">a night</span>
        </>
      );
  }
}
