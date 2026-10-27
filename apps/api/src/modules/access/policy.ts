import type { PropertyRole } from '../../platform/database/database.generated.js';

export type { PropertyRole };

/** Which roles may do what at a property. Every host endpoint names one of these permissions. */
const allowedRoles = {
  'property.view': ['owner', 'manager', 'front_desk'],
  'property.manage': ['owner', 'manager'],
  'inventory.manage': ['owner', 'manager'],
  'blocks.manage': ['owner', 'manager', 'front_desk'],
  'team.view': ['owner', 'manager', 'front_desk'],
  'team.manage': ['owner'],
} as const satisfies Record<string, readonly PropertyRole[]>;

export type Permission = keyof typeof allowedRoles;

export function can(role: PropertyRole, permission: Permission): boolean {
  const roles: readonly PropertyRole[] = allowedRoles[permission];
  return roles.includes(role);
}
