import type { PropertyRole } from '@stay-flow/contracts';

const roleLabels: Record<PropertyRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  front_desk: 'Front desk',
};

export function roleLabel(role: PropertyRole): string {
  return roleLabels[role];
}

/** "AS" for Amira Salem: the first letters of the first and last names. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0]?.[0] ?? '';
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}
