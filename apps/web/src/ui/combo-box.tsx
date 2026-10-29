'use client';

import type { ReactNode } from 'react';
import {
  Button,
  ComboBox as AriaComboBox,
  FieldError,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Text,
  type ComboBoxProps as AriaComboBoxProps,
  type ListBoxItemProps,
} from 'react-aria-components';
import { cx } from './cx';
import { CheckIcon, ChevronDownIcon } from './icons';

interface ComboBoxProps<T extends object> extends Omit<
  AriaComboBoxProps<T>,
  'className' | 'children'
> {
  label: string;
  description?: string;
  errorMessage?: string | undefined;
  placeholder?: string;
  children: ReactNode | ((item: T) => ReactNode);
  className?: string;
}

/** A field to type in that narrows a long list to pick one option from, such as a time zone. */
export function ComboBox<T extends object>({
  label,
  description,
  errorMessage,
  placeholder,
  children,
  className,
  ...props
}: ComboBoxProps<T>) {
  return (
    <AriaComboBox {...props} className={cx('group flex flex-col gap-2', className)}>
      <Label className="text-small font-semibold text-ink">{label}</Label>
      <div className="relative">
        <Input
          {...(placeholder !== undefined && { placeholder })}
          className="h-12 w-full rounded-md border border-field-edge bg-raised pr-12 pl-4 text-body text-ink outline-hidden transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 data-disabled:opacity-50 data-focused:border-action data-focused:ring-1 data-focused:ring-action data-hovered:not-data-focused:border-ink-2 group-data-invalid:border-danger"
        />
        <Button className="absolute inset-y-0 right-1 my-auto flex size-10 cursor-pointer items-center justify-center rounded-sm text-ink-2 outline-hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink">
          <ChevronDownIcon className="size-4" />
        </Button>
      </div>
      {description && (
        <Text slot="description" className="text-small text-ink-3">
          {description}
        </Text>
      )}
      <FieldError className="text-small text-danger">{errorMessage}</FieldError>
      <Popover
        offset={6}
        maxHeight={320}
        className="min-w-(--trigger-width) overflow-y-auto rounded-md border border-rule bg-paper p-1.5 shadow-overlay outline-hidden data-entering:animate-popover-in"
      >
        <ListBox
          className="flex flex-col gap-0.5 outline-hidden"
          renderEmptyState={() => (
            <p className="px-3 py-2.5 text-small text-ink-3">Nothing matches what you typed.</p>
          )}
        >
          {children}
        </ListBox>
      </Popover>
    </AriaComboBox>
  );
}

interface ComboBoxItemProps extends Omit<ListBoxItemProps, 'className' | 'children'> {
  children: ReactNode;
  /** A quieter word at the end of the row, such as the time zone's offset. */
  detail?: string;
}

export function ComboBoxItem({ children, detail, ...props }: ComboBoxItemProps) {
  return (
    <ListBoxItem
      {...(typeof children === 'string' && { textValue: children })}
      {...props}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-small text-ink outline-hidden data-focused:bg-ground-dim"
    >
      {({ isSelected }) => (
        <>
          <span className="flex-1 truncate font-medium">{children}</span>
          {detail && <span className="shrink-0 font-mono text-label text-ink-3">{detail}</span>}
          <CheckIcon className={cx('size-4 shrink-0 text-action', !isSelected && 'invisible')} />
        </>
      )}
    </ListBoxItem>
  );
}
