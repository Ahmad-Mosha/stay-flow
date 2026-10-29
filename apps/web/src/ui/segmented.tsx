'use client';

import { ToggleButton, ToggleButtonGroup } from 'react-aria-components';
import { cx } from './cx';

interface SegmentedProps<T extends string> {
  /** Read out for the group, as it has no visible label. */
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

/** A few buttons of which exactly one is on, such as how much of the calendar shows. */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: SegmentedProps<T>) {
  return (
    <ToggleButtonGroup
      aria-label={label}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const [next] = keys;
        const option = options.find(({ id }) => id === next);
        if (option) onChange(option.id);
      }}
      className={cx('flex h-10 rounded-md border border-rule bg-paper p-[3px]', className)}
    >
      {options.map((option) => (
        <ToggleButton
          key={option.id}
          id={option.id}
          className="flex cursor-pointer items-center rounded-[0.4375rem] px-3 text-label whitespace-nowrap text-ink-2 outline-hidden transition-colors data-focus-visible:outline-2 data-focus-visible:outline-offset-1 data-focus-visible:outline-action data-hovered:text-ink data-selected:bg-tape-stay data-selected:font-semibold data-selected:text-ink"
        >
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
