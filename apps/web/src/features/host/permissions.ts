import type { PropertyRole } from '@stay-flow/contracts';

/** What each role may change, as the API's access policy has it. Everyone may look. */
const managers: Record<'property' | 'inventory' | 'team', readonly PropertyRole[]> = {
  property: ['owner', 'manager'],
  inventory: ['owner', 'manager'],
  team: ['owner'],
};

export function canManage(role: PropertyRole, area: keyof typeof managers): boolean {
  return managers[area].includes(role);
}
