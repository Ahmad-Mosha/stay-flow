import type { Route } from 'next';
import type { ComponentType } from 'react';
import { routes } from '@/lib/routes';
import { SunIcon } from '@/ui/icons';

export interface NavItem {
  label: string;
  href: Route;
  icon: ComponentType<{ className?: string }>;
  /** Pressed after G, as in G then T for Today. */
  shortcut?: string;
}

/** The dashboard's sections for one property. */
export function navFor(slug: string): NavItem[] {
  return [{ label: 'Today', href: routes.today(slug), icon: SunIcon, shortcut: 't' }];
}

/** The section a path is in, or undefined for a page outside them. */
export function activeItem(items: readonly NavItem[], pathname: string): NavItem | undefined {
  return items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
}
