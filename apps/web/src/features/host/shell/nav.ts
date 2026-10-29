import type { Route } from 'next';
import type { ComponentType } from 'react';
import { routes } from '@/lib/routes';
import {
  CalendarIcon,
  DoorIcon,
  LedgerIcon,
  PeopleIcon,
  SlidersIcon,
  SunIcon,
  TagIcon,
} from '@/ui/icons';

export interface NavItem {
  label: string;
  href: Route;
  icon: ComponentType<{ className?: string }>;
  /** Pressed after G, as in G then T for Today. */
  shortcut?: string;
  /** Needs the width: the sidebar shrinks to a rail of icons. */
  wide?: boolean;
  /** The day's work, or how the property is set up. */
  group: 'desk' | 'property';
}

/** The dashboard's sections for one property. */
export function navFor(slug: string): NavItem[] {
  return [
    { label: 'Today', href: routes.today(slug), icon: SunIcon, shortcut: 't', group: 'desk' },
    {
      label: 'Calendar',
      href: routes.calendar(slug),
      icon: CalendarIcon,
      shortcut: 'c',
      wide: true,
      group: 'desk',
    },
    {
      label: 'Reservations',
      href: routes.reservations(slug),
      icon: LedgerIcon,
      shortcut: 'r',
      group: 'desk',
    },
    { label: 'Rooms', href: routes.rooms(slug), icon: DoorIcon, shortcut: 'o', group: 'property' },
    { label: 'Rates', href: routes.rates(slug), icon: TagIcon, shortcut: 'p', group: 'property' },
    { label: 'Team', href: routes.team(slug), icon: PeopleIcon, shortcut: 'm', group: 'property' },
    {
      label: 'Settings',
      href: routes.settings(slug),
      icon: SlidersIcon,
      shortcut: 's',
      group: 'property',
    },
  ];
}

/** How the sidebar groups the sections, with a heading for all but the first. */
export const navGroups: readonly { id: NavItem['group']; title: string | null }[] = [
  { id: 'desk', title: null },
  { id: 'property', title: 'Property' },
];

/** The section a path is in, or undefined for a page outside them. */
export function activeItem(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
