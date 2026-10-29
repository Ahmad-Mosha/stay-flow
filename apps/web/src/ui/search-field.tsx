'use client';

import {
  Button,
  Input,
  Label,
  SearchField as AriaSearchField,
  type SearchFieldProps as AriaSearchFieldProps,
} from 'react-aria-components';
import { cx } from './cx';
import { CloseIcon, SearchIcon } from './icons';

interface SearchFieldProps extends Omit<AriaSearchFieldProps, 'className' | 'children'> {
  label: string;
  placeholder?: string;
  /** The key that jumps here, shown at the end of the empty field. */
  shortcut?: string;
  className?: string;
}

/** A search box with a clear button. Escape clears it too. */
export function SearchField({
  label,
  placeholder,
  shortcut,
  className,
  ...props
}: SearchFieldProps) {
  return (
    <AriaSearchField {...props} className={cx('group relative flex flex-col', className)}>
      <Label className="sr-only">{label}</Label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
      <Input
        {...(placeholder !== undefined && { placeholder })}
        {...(shortcut && { 'data-shortcut': 'search', 'aria-keyshortcuts': shortcut })}
        className="h-10 w-full rounded-md border border-rule-strong bg-raised pr-10 pl-10 text-small text-ink outline-hidden transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 data-focused:border-action data-focused:ring-1 data-focused:ring-action data-hovered:not-data-focused:border-field-edge [&::-webkit-search-cancel-button]:hidden"
      />
      {shortcut && (
        <kbd
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 hidden h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-[4px] border border-rule-strong px-1 font-mono text-[0.6875rem] text-ink-3 group-data-empty:pointer-fine:flex"
        >
          {shortcut}
        </kbd>
      )}
      <Button className="absolute top-1/2 right-1 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-sm text-ink-3 outline-hidden group-data-empty:hidden data-focus-visible:outline-2 data-focus-visible:outline-action data-hovered:text-ink">
        <CloseIcon className="size-4" />
      </Button>
    </AriaSearchField>
  );
}
