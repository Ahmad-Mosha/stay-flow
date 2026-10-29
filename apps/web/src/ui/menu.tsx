'use client';

import type { ReactNode } from 'react';
import {
  Header,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection,
  Popover,
  Separator,
  type MenuItemProps as AriaMenuItemProps,
  type MenuProps as AriaMenuProps,
  type MenuSectionProps,
  type PopoverProps,
} from 'react-aria-components';
import { cx } from './cx';
import { CheckIcon } from './icons';

interface MenuProps<T> extends Omit<AriaMenuProps<T>, 'className'> {
  placement?: PopoverProps['placement'];
  className?: string;
}

/** A list of actions in a popover, opened by the button before it inside a `MenuTrigger`. */
export function Menu<T extends object>({
  placement = 'bottom start',
  className,
  ...props
}: MenuProps<T>) {
  return (
    <Popover
      placement={placement}
      offset={6}
      className="min-w-(--trigger-width) rounded-md border border-rule bg-paper p-1.5 shadow-overlay outline-hidden data-entering:animate-popover-in"
    >
      <AriaMenu {...props} className={cx('flex flex-col gap-0.5 outline-hidden', className)} />
    </Popover>
  );
}

interface MenuItemProps extends Omit<AriaMenuItemProps, 'className' | 'children'> {
  children: ReactNode;
  /** A second, quieter line, such as the user's role at a property. */
  description?: string;
}

export function MenuItem({ children, description, ...props }: MenuItemProps) {
  return (
    <AriaMenuItem
      {...props}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-small text-ink outline-hidden data-disabled:cursor-default data-disabled:text-ink-3 data-focused:bg-ground-dim"
    >
      {({ isSelected, selectionMode }) => (
        <>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate font-medium">{children}</span>
            {description && <span className="text-label text-ink-3">{description}</span>}
          </span>
          {selectionMode !== 'none' && (
            <CheckIcon className={cx('size-4 text-action', !isSelected && 'invisible')} />
          )}
        </>
      )}
    </AriaMenuItem>
  );
}

interface MenuGroupProps extends Omit<MenuSectionProps<object>, 'className' | 'children'> {
  title: string;
  children: ReactNode;
}

/**
 * A labelled group of items. The label is read out, but cannot be chosen. A group can pick one of
 * its items while the rest of the menu holds actions.
 */
export function MenuGroup({ title, children, ...props }: MenuGroupProps) {
  return (
    <MenuSection {...props} className="flex flex-col gap-0.5">
      <Header className="px-3 pt-1.5 pb-1 font-mono text-label text-ink-3 uppercase">
        {title}
      </Header>
      {children}
    </MenuSection>
  );
}

/** A thin rule between parts of a menu, such as a list and the action after it. */
export function MenuSeparator() {
  return <Separator className="mx-1.5 my-1 h-px bg-rule" />;
}
