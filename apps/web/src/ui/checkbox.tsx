'use client';

import {
  CheckboxButton,
  CheckboxField,
  Text,
  type CheckboxFieldProps,
} from 'react-aria-components';
import { cx } from './cx';
import { CheckIcon } from './icons';

interface CheckboxProps extends Omit<CheckboxFieldProps, 'className' | 'children'> {
  label: string;
  /** A quieter line under the label, read out with it. */
  description?: string;
  className?: string;
}

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  return (
    <CheckboxField {...props} className={cx('group flex flex-col gap-0.5', className)}>
      <CheckboxButton className="flex cursor-pointer items-start gap-3 group-data-disabled:cursor-not-allowed group-data-disabled:opacity-50">
        {({ isSelected, isFocusVisible }) => (
          <>
            <span
              aria-hidden="true"
              className={cx(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-sm border transition-colors',
                isSelected
                  ? 'border-action bg-action text-action-ink'
                  : 'border-field-edge bg-raised',
                isFocusVisible && 'outline-2 outline-offset-2 outline-action',
              )}
            >
              {isSelected && <CheckIcon className="size-3.5" />}
            </span>
            <span className="text-small font-semibold text-ink">{label}</span>
          </>
        )}
      </CheckboxButton>
      {description && (
        <Text slot="description" className="pl-8 text-small text-ink-3">
          {description}
        </Text>
      )}
    </CheckboxField>
  );
}
