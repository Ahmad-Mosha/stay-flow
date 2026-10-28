'use client';

import type { ReactNode } from 'react';
import { Link as AriaLink, type LinkProps as AriaLinkProps } from 'react-aria-components';
import { buttonClasses, type ButtonStyleProps } from './button';
import { cx } from './cx';

interface LinkProps {
  /** Typed as a Next.js route (see app/providers.tsx), so a link to a missing page fails type checking. */
  href: NonNullable<AriaLinkProps['href']>;
  children: ReactNode;
  className?: string;
}

export function TextLink({ href, children, className }: LinkProps) {
  return (
    <AriaLink
      href={href}
      className={cx(
        'rounded-sm font-medium text-action underline decoration-action/40 underline-offset-4 transition-colors outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-hovered:text-ink data-hovered:decoration-ink',
        className,
      )}
    >
      {children}
    </AriaLink>
  );
}

/** A link that looks like a button, for navigation that is the main action on a screen. */
export function ButtonLink({
  href,
  children,
  variant,
  size,
  className,
}: LinkProps & ButtonStyleProps) {
  return (
    <AriaLink href={href} className={buttonClasses({ variant, size, className })}>
      {children}
    </AriaLink>
  );
}
