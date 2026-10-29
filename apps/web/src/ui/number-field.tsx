'use client';

import {
  FieldError,
  Group,
  Input,
  Label,
  NumberField as AriaNumberField,
  Text,
  type NumberFieldProps as AriaNumberFieldProps,
} from 'react-aria-components';
import { cx } from './cx';

interface NumberFieldProps extends Omit<AriaNumberFieldProps, 'className' | 'children'> {
  label: string;
  description?: string;
  errorMessage?: string;
  /** A unit after the number, such as the currency. */
  suffix?: string;
  className?: string;
}

/** A number typed in full, such as a price. Arrow keys step it. */
export function NumberField({
  label,
  description,
  errorMessage,
  suffix,
  className,
  ...props
}: NumberFieldProps) {
  return (
    <AriaNumberField {...props} className={cx('group flex flex-col gap-2', className)}>
      <Label className="text-small font-semibold text-ink">{label}</Label>
      <Group className="flex h-12 items-center rounded-md border border-field-edge bg-raised px-4 transition-[border-color,box-shadow] duration-150 group-data-invalid:border-danger data-disabled:opacity-50 data-focus-within:border-action data-focus-within:ring-1 data-focus-within:ring-action data-hovered:not-data-focus-within:border-ink-2">
        <Input className="numerals min-w-0 flex-1 bg-transparent text-body text-ink outline-hidden" />
        {suffix && <span className="pl-2 font-mono text-small text-ink-3">{suffix}</span>}
      </Group>
      {description && (
        <Text slot="description" className="text-small text-ink-3">
          {description}
        </Text>
      )}
      <FieldError className="text-small text-danger">{errorMessage}</FieldError>
    </AriaNumberField>
  );
}
