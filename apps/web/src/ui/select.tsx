'use client';

import type { ReactNode } from 'react';
import {
  Button,
  FieldError,
  Header,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  Select as AriaSelect,
  SelectValue,
  Text,
  type ListBoxItemProps,
  type SelectProps as AriaSelectProps,
} from 'react-aria-components';
import { cx } from './cx';
import { CheckIcon, ChevronDownIcon } from './icons';

interface SelectProps<T extends object> extends Omit<AriaSelectProps<T>, 'className' | 'children'> {
  label: string;
  description?: string;
  errorMessage?: string;
  placeholder?: string;
  children: ReactNode;
  className?: string;
}

/** A labelled field that opens a list to pick one option from, such as a room. */
export function Select<T extends object>({
  label,
  description,
  errorMessage,
  placeholder = 'Choose one',
  children,
  className,
  ...props
}: SelectProps<T>) {
  return (
    <AriaSelect
      {...props}
      placeholder={placeholder}
      className={cx('group flex flex-col gap-2', className)}
    >
      <Label className="text-small font-semibold text-ink">{label}</Label>
      <Button className="flex h-12 cursor-pointer items-center justify-between gap-3 rounded-md border border-field-edge bg-raised px-4 text-left text-body text-ink outline-hidden transition-[border-color,box-shadow] duration-150 data-disabled:cursor-not-allowed data-disabled:opacity-50 data-focus-visible:border-action data-focus-visible:ring-1 data-focus-visible:ring-action data-hovered:border-ink-2 data-pressed:border-action group-data-invalid:border-danger">
        {/* The chosen option's words, without its check mark and detail. */}
        <SelectValue className="truncate data-placeholder:text-ink-3">
          {({ isPlaceholder, selectedText, defaultChildren }) =>
            isPlaceholder ? defaultChildren : selectedText
          }
        </SelectValue>
        <ChevronDownIcon className="size-4 shrink-0 text-ink-2" />
      </Button>
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
        <ListBox className="flex flex-col gap-0.5 outline-hidden">{children}</ListBox>
      </Popover>
    </AriaSelect>
  );
}

interface SelectItemProps extends Omit<ListBoxItemProps, 'className' | 'children'> {
  children: ReactNode;
  /** A quieter word at the end of the row, such as the room's type. */
  detail?: string;
}

export function SelectItem({ children, detail, ...props }: SelectItemProps) {
  return (
    <ListBoxItem
      {...(typeof children === 'string' && { textValue: children })}
      {...props}
      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-small text-ink outline-hidden data-disabled:cursor-default data-disabled:text-ink-3 data-focused:bg-ground-dim"
    >
      {({ isSelected }) => (
        <>
          <span className="flex-1 truncate font-medium">{children}</span>
          {detail && <span className="text-label text-ink-3">{detail}</span>}
          <CheckIcon className={cx('size-4 text-action', !isSelected && 'invisible')} />
        </>
      )}
    </ListBoxItem>
  );
}

/** A labelled group of options. The label is read out, but cannot be chosen. */
export function SelectGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ListBoxSection className="flex flex-col gap-0.5 not-first:mt-1.5">
      <Header className="px-3 pt-1.5 pb-1 font-mono text-label text-ink-3 uppercase">
        {title}
      </Header>
      {children}
    </ListBoxSection>
  );
}
