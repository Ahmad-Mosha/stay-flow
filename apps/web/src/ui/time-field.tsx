'use client';

import { parseTime } from '@internationalized/date';
import {
  DateInput,
  DateSegment,
  FieldError,
  Label,
  Text,
  TimeField as AriaTimeField,
  type TimeFieldProps as AriaTimeFieldProps,
  type TimeValue,
} from 'react-aria-components';
import { cx } from './cx';

interface TimeFieldProps extends Omit<
  AriaTimeFieldProps<TimeValue>,
  'value' | 'onChange' | 'className' | 'children'
> {
  label: string;
  description?: string;
  errorMessage?: string | undefined;
  /** On the 24-hour clock, as the API takes it: `14:00`. */
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** A time of day, typed hour and minute, on the 24-hour clock. */
export function TimeField({
  label,
  description,
  errorMessage,
  value,
  onChange,
  className,
  ...props
}: TimeFieldProps) {
  return (
    <AriaTimeField
      {...props}
      hourCycle={24}
      shouldForceLeadingZeros
      value={parseTime(value)}
      onChange={(time) => {
        if (time) onChange(time.toString().slice(0, 5));
      }}
      className={cx('group flex flex-col gap-2', className)}
    >
      <Label className="text-small font-semibold text-ink">{label}</Label>
      <DateInput className="flex h-12 items-center rounded-md border border-field-edge bg-raised px-4 text-body text-ink transition-[border-color,box-shadow] duration-150 group-data-invalid:border-danger group-data-readonly:border-rule group-data-readonly:bg-ground-dim data-disabled:opacity-50 data-focus-within:border-action data-focus-within:ring-1 data-focus-within:ring-action data-hovered:not-data-focus-within:border-ink-2">
        {(segment) => (
          <DateSegment
            segment={segment}
            className="rounded-[3px] px-0.5 tabular-nums outline-hidden data-focused:bg-action data-focused:text-action-ink data-placeholder:text-ink-3 data-type-literal:px-0"
          />
        )}
      </DateInput>
      {description && (
        <Text slot="description" className="text-small text-ink-3">
          {description}
        </Text>
      )}
      <FieldError className="text-small text-danger">{errorMessage}</FieldError>
    </AriaTimeField>
  );
}
