'use client';

import {
  Button,
  Group,
  Input,
  Label,
  NumberField,
  type NumberFieldProps,
} from 'react-aria-components';
import { cx } from './cx';

interface StepperFieldProps extends Omit<NumberFieldProps, 'className' | 'children'> {
  label: string;
  className?: string;
}

const stepButton =
  'flex size-11 shrink-0 items-center justify-center rounded-md border border-rule-strong bg-raised text-ink outline-hidden transition-colors data-disabled:opacity-40 data-focus-visible:outline-2 data-focus-visible:outline-offset-2 data-focus-visible:outline-solid data-focus-visible:outline-action data-hovered:border-field-edge data-pressed:bg-paper';

/** A whole number with − and + buttons, for counts like guests. Arrow keys work in the input too. */
export function StepperField({ label, className, ...props }: StepperFieldProps) {
  return (
    <NumberField {...props} className={cx('flex flex-col gap-1', className)}>
      <Label className="font-mono text-label text-ink-3 uppercase">{label}</Label>
      <Group className="flex items-center gap-2">
        <Button slot="decrement" className={stepButton}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-4"
          >
            <line x1="6" y1="12" x2="18" y2="12" />
          </svg>
        </Button>
        <Input className="numerals h-11 w-12 min-w-0 rounded-md bg-transparent text-center text-lead font-semibold text-ink outline-hidden data-focused:ring-2 data-focused:ring-action" />
        <Button slot="increment" className={stepButton}>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-4"
          >
            <line x1="6" y1="12" x2="18" y2="12" />
            <line x1="12" y1="6" x2="12" y2="18" />
          </svg>
        </Button>
      </Group>
    </NumberField>
  );
}
