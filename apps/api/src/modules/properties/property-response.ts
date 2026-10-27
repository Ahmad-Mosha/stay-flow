import type { HostPropertyResponse, PropertyResponse } from '@stay-flow/contracts';
import type { PropertyRole } from '../access/policy.js';
import type { Property } from './property.js';

export function toPropertyResponse(property: Property): PropertyResponse {
  return {
    slug: property.slug,
    name: property.name,
    timeZone: property.timeZone,
    currency: property.currency,
    checkInTime: property.checkInTime.toString({ smallestUnit: 'minute' }),
    checkOutTime: property.checkOutTime.toString({ smallestUnit: 'minute' }),
    stayRules: property.stayRules,
  };
}

export function toHostPropertyResponse(
  property: Property,
  role: PropertyRole,
): HostPropertyResponse {
  return { ...toPropertyResponse(property), id: property.id, role };
}
