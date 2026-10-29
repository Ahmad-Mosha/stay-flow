'use client';

import type {
  HostPropertyListResponse,
  HostPropertyResponse,
  UserResponse,
} from '@stay-flow/contracts';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import {
  Button as AriaButton,
  Dialog as AriaDialog,
  Link as AriaLink,
  MenuTrigger,
  Modal,
  ModalOverlay,
} from 'react-aria-components';
import { routes } from '@/lib/routes';
import { cx } from '@/ui/cx';
import {
  ChevronDownIcon,
  CloseIcon,
  MenuIcon,
  MoonIcon,
  PlusIcon,
  SignOutIcon,
  SunIcon,
} from '@/ui/icons';
import { Menu, MenuGroup, MenuItem, MenuSeparator } from '@/ui/menu';
import { Hint } from '@/ui/tooltip';
import { LogoMark, Wordmark } from '@/ui/wordmark';
import { useSignOut } from '@/features/auth/use-sign-out';
import { HostContext } from '../host-context';
import { initialsOf, roleLabel } from '../roles';
import { activeItem, navFor, navGroups, type NavItem } from './nav';
import { useTheme } from './theme';
import { useGoShortcuts } from './use-go-shortcuts';

interface HostShellProps {
  user: UserResponse;
  properties: HostPropertyListResponse['properties'];
  property: HostPropertyResponse;
  children: ReactNode;
}

/**
 * The dashboard around every host page: a sidebar from large screens up, and a top bar with a
 * drawer below that.
 */
export function HostShell({ user, properties, property, children }: HostShellProps) {
  const pathname = usePathname();
  const items = useMemo(() => navFor(property.slug), [property.slug]);
  const current = activeItem(items, pathname);
  // The drawer belongs to the page it was opened on, so choosing a link in it closes it.
  const [drawerPage, setDrawerPage] = useState<string | null>(null);
  const drawerOpen = drawerPage === pathname;
  const setDrawerOpen = (open: boolean) => {
    setDrawerPage(open ? pathname : null);
  };
  useGoShortcuts(items);

  const sidebar = (
    <Sidebar
      user={user}
      properties={properties}
      property={property}
      items={items}
      current={current}
    />
  );

  return (
    <HostContext value={{ user, property }}>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-paper px-4 py-3 font-semibold text-ink focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div
        className={cx(
          'lg:grid lg:min-h-dvh',
          current?.wide
            ? 'lg:grid-cols-[4.5rem_minmax(0,1fr)]'
            : 'lg:grid-cols-[15rem_minmax(0,1fr)]',
        )}
      >
        <div className="hidden border-r border-rule bg-ground-dim lg:block">
          <aside className="sticky top-0 h-dvh">
            {current?.wide ? (
              <Rail user={user} property={property} items={items} current={current} />
            ) : (
              sidebar
            )}
          </aside>
        </div>

        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-ground-dim px-2 sm:px-4 lg:hidden">
          <AriaButton
            aria-label="Open menu"
            onPress={() => {
              setDrawerOpen(true);
            }}
            className="flex size-11 cursor-pointer items-center justify-center rounded-md text-ink-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink"
          >
            <MenuIcon className="size-5" />
          </AriaButton>
          <LogoMark className="h-3.5 w-auto text-ink" />
          <span className="min-w-0 truncate text-small font-semibold">{property.name}</span>
          {current && (
            <span className="ml-auto pr-2 font-mono text-label text-ink-3 uppercase">
              {current.label}
            </span>
          )}
        </header>

        <main id="main" tabIndex={-1} className="min-w-0 outline-hidden">
          {children}
        </main>
      </div>

      <ModalOverlay
        isDismissable
        isOpen={drawerOpen}
        onOpenChange={setDrawerOpen}
        className="fixed inset-0 z-50 bg-[color-mix(in_oklab,var(--color-ink)_45%,transparent)] lg:hidden data-entering:animate-overlay-in data-exiting:animate-overlay-out"
      >
        <Modal className="h-full w-[min(18rem,86vw)] border-r border-rule bg-ground-dim shadow-overlay data-entering:animate-drawer-in data-exiting:animate-drawer-out">
          <AriaDialog aria-label="Menu" className="relative h-full outline-hidden">
            {({ close }) => (
              <>
                <AriaButton
                  aria-label="Close menu"
                  onPress={close}
                  className="absolute top-4 right-3 flex size-11 cursor-pointer items-center justify-center rounded-md text-ink-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink"
                >
                  <CloseIcon className="size-5" />
                </AriaButton>
                {sidebar}
              </>
            )}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </HostContext>
  );
}

interface SidebarProps {
  user: UserResponse;
  properties: HostPropertyListResponse['properties'];
  property: HostPropertyResponse;
  items: NavItem[];
  current: NavItem | undefined;
}

function Sidebar({ user, properties, property, items, current }: SidebarProps) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto px-4 py-6">
      <AriaLink
        href={items[0]?.href ?? '/host'}
        aria-label="Stay Flow, Today"
        className="self-start rounded-sm px-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-action"
      >
        <Wordmark className="text-[1.375rem]" />
      </AriaLink>

      <PropertySwitcher properties={properties} property={property} current={current} />

      <nav aria-label="Dashboard" className="flex flex-col gap-5">
        {navGroups.map((group) => (
          <div key={group.id} className="flex flex-col gap-1.5">
            {group.title && (
              <p
                id={`nav-${group.id}`}
                className="px-2.5 font-mono text-[0.6875rem] tracking-[0.04em] text-ink-3 uppercase"
              >
                {group.title}
              </p>
            )}
            <ul
              {...(group.title && { 'aria-labelledby': `nav-${group.id}` })}
              className="flex flex-col gap-0.5"
            >
              {items
                .filter((item) => item.group === group.id)
                .map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} active={item === current} />
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto flex items-center gap-2 border-t border-rule pt-4">
        <AccountMenu user={user} role={property.role} />
        <ThemeToggle />
      </div>
    </div>
  );
}

/** The sidebar as a column of icons, for pages that need the width, like the calendar. */
function Rail({ user, property, items, current }: Omit<SidebarProps, 'properties'>) {
  return (
    <div className="flex h-full flex-col items-center gap-6 overflow-y-auto py-6">
      <Hint label="Today">
        <AriaLink
          href={items[0]?.href ?? '/host'}
          aria-label="Stay Flow, Today"
          className="flex h-8 items-center rounded-sm px-1 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action"
        >
          <LogoMark className="h-3.5 w-auto text-ink" />
        </AriaLink>
      </Hint>
      <nav aria-label="Dashboard">
        <ul className="flex flex-col gap-1">
          {items.map((item, index) => {
            const Icon = item.icon;
            const active = item === current;
            const startsGroup = index > 0 && items[index - 1]?.group !== item.group;
            return (
              <li key={item.href} className={cx(startsGroup && 'mt-2 border-t border-rule pt-3')}>
                <Hint
                  label={
                    item.shortcut ? `${item.label} · G ${item.shortcut.toUpperCase()}` : item.label
                  }
                >
                  <AriaLink
                    href={item.href}
                    aria-label={item.label}
                    {...(active && { 'aria-current': 'page' })}
                    className={cx(
                      'flex size-11 items-center justify-center rounded-md outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-action',
                      active
                        ? 'bg-paper text-ink shadow-[0_1px_0_var(--color-rule)]'
                        : 'text-ink-2 data-hovered:bg-paper/60 data-hovered:text-ink',
                    )}
                  >
                    <Icon />
                  </AriaLink>
                </Hint>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto flex flex-col items-center gap-2">
        <ThemeToggle />
        <AccountMenu user={user} role={property.role} compact />
      </div>
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <AriaLink
      href={item.href}
      {...(active && { 'aria-current': 'page' })}
      {...(item.shortcut && { 'aria-keyshortcuts': `G ${item.shortcut.toUpperCase()}` })}
      className={cx(
        'flex min-h-11 items-center gap-3 rounded-md px-2.5 text-small outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-action',
        active
          ? 'bg-paper font-semibold text-ink shadow-[0_1px_0_var(--color-rule)]'
          : 'text-ink-2 data-hovered:bg-paper/60 data-hovered:text-ink',
      )}
    >
      <Icon />
      <span className="flex-1">{item.label}</span>
      {item.shortcut && (
        <span aria-hidden="true" className="hidden font-mono text-label text-ink-3 lg:inline">
          G {item.shortcut.toUpperCase()}
        </span>
      )}
    </AriaLink>
  );
}

function PropertySwitcher({
  properties,
  property,
  current,
}: {
  properties: HostPropertyListResponse['properties'];
  property: HostPropertyResponse;
  current: NavItem | undefined;
}) {
  const router = useRouter();
  return (
    <MenuTrigger>
      <AriaButton className="flex min-h-13 w-full cursor-pointer items-center gap-2.5 rounded-md border border-rule-strong bg-paper px-3 py-2 text-left outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:border-field-edge">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-small font-semibold text-ink">{property.name}</span>
          <span className="truncate font-mono text-[0.6875rem] leading-4 text-ink-3 uppercase">
            {property.timeZone} · {property.currency}
          </span>
        </span>
        <ChevronDownIcon className="size-4 text-ink-2" />
        <span className="sr-only">Switch property</span>
      </AriaButton>
      <Menu aria-label="Your properties">
        <MenuGroup
          title="Your properties"
          selectionMode="single"
          selectedKeys={[property.slug]}
          disallowEmptySelection
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const [slug] = keys;
            if (typeof slug !== 'string' || slug === property.slug) return;
            // Stay in the same section: from one property's calendar to the other's.
            const section = navFor(slug).find((item) => item.label === current?.label);
            router.push(section?.href ?? navFor(slug)[0]?.href ?? '/host');
          }}
        >
          {properties.map((option) => (
            <MenuItem key={option.slug} id={option.slug} description={roleLabel(option.role)}>
              {option.name}
            </MenuItem>
          ))}
        </MenuGroup>
        <MenuSeparator />
        <MenuItem id="new" href={routes.newProperty()} textValue="Add a property">
          <span className="flex items-center gap-2.5">
            <PlusIcon className="size-4 text-ink-2" />
            Add a property
          </span>
        </MenuItem>
      </Menu>
    </MenuTrigger>
  );
}

function AccountMenu({
  user,
  role,
  compact = false,
}: {
  user: UserResponse;
  role: HostPropertyResponse['role'];
  /** Just the initials, in the rail. */
  compact?: boolean;
}) {
  const signOut = useSignOut();
  return (
    <MenuTrigger>
      <AriaButton
        className={cx(
          'flex min-w-0 cursor-pointer items-center gap-2.5 rounded-md p-1.5 text-left outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:bg-paper/60',
          !compact && 'flex-1',
        )}
      >
        {/* The initials come from CSS to keep them out of the label: voice control users say the name. */}
        <span
          aria-hidden="true"
          data-initials={initialsOf(user.name)}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tape-stay text-label font-semibold text-ink before:content-[attr(data-initials)]"
        />
        <span className={compact ? 'sr-only' : 'flex min-w-0 flex-col'}>
          <span className="sr-only">Account: </span>
          <span className="truncate text-small font-semibold text-ink">{user.name}</span>
          <span className="truncate text-label text-ink-3">{roleLabel(role)}</span>
        </span>
      </AriaButton>
      <Menu
        aria-label="Account"
        placement={compact ? 'end bottom' : 'top start'}
        onAction={(key) => {
          if (key === 'sign-out') signOut.mutate();
        }}
      >
        <MenuGroup title={user.email}>
          <MenuItem id="sign-out" textValue="Sign out" isDisabled={signOut.isPending}>
            <span className="flex items-center gap-2.5">
              <SignOutIcon className="size-4 text-ink-2" />
              {signOut.isPending ? 'Signing out' : 'Sign out'}
            </span>
          </MenuItem>
        </MenuGroup>
      </Menu>
    </MenuTrigger>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <AriaButton
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onPress={toggle}
      className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-md border border-rule-strong bg-paper text-ink-2 outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink"
    >
      {dark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
    </AriaButton>
  );
}
