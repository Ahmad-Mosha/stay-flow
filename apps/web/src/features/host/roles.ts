import type { PropertyRole } from '@stay-flow/contracts';

const roleLabels: Record<PropertyRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front desk',
};

export function roleLabel(role: PropertyRole): string {
  return roleLabels[role];
}

const rolePlaces: Record<PropertyRole, string> = {
  owner: 'an owner',
  manager: 'a manager',
  front_desk: 'on the front desk',
};

/** The role as it follows "is now": "an owner", "on the front desk". */
export function rolePlace(role: PropertyRole): string {
  return rolePlaces[role];
}

/** The roles from most to least access, as the API's access policy grants them. */
export const roles: readonly { role: PropertyRole; can: string }[] = [
  { role: 'owner', can: 'Everything, including who is on the team.' },
  { role: 'manager', can: 'Rooms, rates and settings, and every booking.' },
  { role: 'front_desk', can: 'Bookings, check-in and check-out, and blocked dates.' },
];

/** "AS" for Amira Salem: the first letters of the first and last names. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
