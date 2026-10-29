'use client';

import {
  FieldError,
  Input,
  Label,
  Text,
  TextArea,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
  type ValidationResult,
} from 'react-aria-components';
import { cx } from './cx';

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'className' | 'children'> {
  label: string;
  /** Help that stays visible below the field, read out with it by screen readers. */
  description?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  placeholder?: string;
  /** A few lines of free text, such as a note to the hotel. */
  multiline?: boolean;
  className?: string;
}

const fieldClassName =
  'rounded-md border border-field-edge bg-raised px-4 text-body text-ink outline-hidden transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 data-disabled:opacity-50 data-focused:border-action data-focused:ring-1 data-focused:ring-action data-hovered:not-data-focused:border-ink-2 data-invalid:border-danger data-invalid:ring-danger';

export function TextField({
  label,
  description,
  errorMessage,
  placeholder,
  multiline = false,
  className,
  ...props
}: TextFieldProps) {
  const placeholderProps = placeholder === undefined ? {} : { placeholder };
  return (
    <AriaTextField {...props} className={cx('flex flex-col gap-2', className)}>
      <Label className="text-small font-semibold text-ink">{label}</Label>
      {multiline ? (
        <TextArea {...placeholderProps} rows={3} className={cx(fieldClassName, 'resize-y py-3')} />
      ) : (
        <Input {...placeholderProps} className={cx(fieldClassName, 'h-12')} />
      )}
      {description && (
        <Text slot="description" className="text-small text-ink-3">
          {description}
        </Text>
      )}
      <FieldError className="text-small text-danger">{errorMessage}</FieldError>
    </AriaTextField>
  );
}
