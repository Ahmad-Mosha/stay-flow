'use client';

import {
  Button as AriaButton,
  composeRenderProps,
  type ButtonProps as AriaButtonProps,
} from 'react-aria-components';
import { cx } from './cx';
import { Spinner } from './spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'md' | 'lg';

export interface ButtonStyleProps {
  /** Primary is the one action a screen asks for; it is the only place the accent colour appears. */
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  className?: string | undefined;
}

export interface ButtonProps extends Omit<AriaButtonProps, 'className'>, ButtonStyleProps {}

const base =
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors duration-150 outline-hidden data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus-visible:outline-2 data-focus-visible:outline-solid data-focus-visible:outline-offset-2 data-focus-visible:outline-action data-pending:cursor-progress';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-action text-action-ink data-hovered:bg-[color-mix(in_oklab,var(--color-action)_88%,var(--color-ink))] data-pressed:bg-[color-mix(in_oklab,var(--color-action)_80%,var(--color-ink))]',
  secondary:
    'border border-rule-strong bg-raised text-ink data-hovered:border-field-edge data-pressed:bg-paper',
  quiet:
    'text-ink-2 underline decoration-rule-strong underline-offset-4 data-hovered:text-ink data-hovered:decoration-ink-2',
  danger:
    'border border-danger bg-raised text-danger data-hovered:bg-[color-mix(in_oklab,var(--color-danger)_8%,var(--color-raised))]',
};

const sizes: Record<ButtonSize, string> = {
  md: 'h-11 px-4 text-small',
  lg: 'h-13 px-6 text-body',
};

/** Shared with `ButtonLink`, which gets the same data attributes from React Aria's `Link`. */
export function buttonClasses({ variant = 'primary', size = 'md', className }: ButtonStyleProps) {
  return cx(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <AriaButton {...props} className={buttonClasses({ variant, size, className })}>
      {composeRenderProps(children, (children, { isPending }) => (
        <>
          {isPending && <Spinner className="size-4" />}
          {children}
        </>
      ))}
    </AriaButton>
  );
}
