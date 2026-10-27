import type {
  HostUnitTypeResponse,
  RateOverrideResponse,
  UnitResponse,
} from '@stay-flow/contracts';
import { toNights } from '../../platform/time/nights.js';
import type { RateOverride, UnitTypeWithUnits } from './host-inventory.repository.js';
import type { Unit } from './inventory.repository.js';

export function toHostUnitTypeResponse(unitType: UnitTypeWithUnits): HostUnitTypeResponse {
  return {
    id: unitType.id,
    slug: unitType.slug,
    name: unitType.name,
    description: unitType.description,
    maxGuests: unitType.maxGuests,
    baseRateMinor: unitType.baseRateMinor,
    units: unitType.units.map((unit) => ({ id: unit.id, name: unit.name })),
  };
}

export function toUnitResponse(unit: Unit): UnitResponse {
  return { id: unit.id, unitTypeId: unit.unitTypeId, name: unit.name };
}

export function toRateOverrideResponse(override: RateOverride): RateOverrideResponse {
  return {
    id: override.id,
    unitTypeId: override.unitTypeId,
    nights: toNights(override.nights),
    rateMinor: override.rateMinor,
    label: override.label,
  };
}
