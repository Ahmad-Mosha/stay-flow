import type { Route } from 'next';
import type { ComponentType } from 'react';
import { routes } from '@/lib/routes';
import { CalendarIcon, DoorIcon, LedgerIcon, SunIcon, TagIcon } from '@/ui/icons';

export interface NavItem {
  label: string;
  href: Route;
  icon: ComponentType<{ className?: string }>;
  /** Pressed after G, as in G then T for Today. */
  shortcut?: string;
  /** Needs the width: the sidebar shrinks to a rail of icons. */
  wide?: boolean;
}

/** The dashboard's sections for one property. */
export function navFor(slug: string): NavItem[] {
  return [
    { label: 'Today', href: routes.today(slug), icon: SunIcon, shortcut: 't' },
    {
      label: 'Calendar',
      href: routes.calendar(slug),
      icon: CalendarIcon,
      shortcut: 'c',
      wide: true,
    },
    {
      label: 'Reservations',
      href: routes.reservations(slug),
      icon: LedgerIcon,
      shortcut: 'r',
    },
    { label: 'Rates', href: routes.rates(slug), icon: TagIcon, shortcut: 'p' },
    { label: 'Rooms', href: routes.rooms(slug), icon: DoorIcon, shortcut: 'o' },
  ];
}

/** The section a path is in, or undefined for a page outside them. */
export function activeItem(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
