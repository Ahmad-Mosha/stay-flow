import { Temporal } from 'temporal-polyfill';
import { type DateSpan, nightsOf } from '../../platform/time/date-span.js';
import type {
  FreeUnitsOnNight,
  OverridesByUnitType,
  UnitTypeWithFreeUnits,
} from './inventory.repository.js';
import { nightlyRate, priceStay, type StayPrice } from './pricing.js';

export type UnitTypeOffer = UnitTypeWithFreeUnits & StayPrice;

export interface CalendarNight {
  readonly date: Temporal.PlainDate;
  readonly available: boolean;
  readonly fromRateMinor: number | null;
}

/** Prices the stay for each room type, cheapest first. */
export function offersFor(
  stay: DateSpan,
  unitTypes: readonly UnitTypeWithFreeUnits[],
  overrides: OverridesByUnitType,
): UnitTypeOffer[] {
  return unitTypes
    .map((unitType) => ({
      ...unitType,
      ...priceStay(stay, unitType.baseRateMinor, overrides.get(unitType.id) ?? []),
    }))
    .sort((a, b) => a.totalMinor - b.totalMinor || a.name.localeCompare(b.name));
}

/** Each night of `span`: bookable if it is not past and a room is free, priced at the cheapest one. */
export function calendarNights(
  span: DateSpan,
  freeUnits: readonly FreeUnitsOnNight[],
  overrides: OverridesByUnitType,
  today: Temporal.PlainDate,
): CalendarNight[] {
  const freeByNight = new Map<string, FreeUnitsOnNight[]>();
  for (const row of freeUnits) {
    if (row.freeUnits > 0) {
      const key = row.night.toString();
      freeByNight.set(key, [...(freeByNight.get(key) ?? []), row]);
    }
  }

  return nightsOf(span).map((date) => {
    const rates = (freeByNight.get(date.toString()) ?? []).map((row) =>
      nightlyRate(date, row.baseRateMinor, overrides.get(row.unitTypeId) ?? []),
    );
    const available = Temporal.PlainDate.compare(date, today) >= 0 && rates.length > 0;
    return { date, available, fromRateMinor: available ? Math.min(...rates) : null };
  });
}
