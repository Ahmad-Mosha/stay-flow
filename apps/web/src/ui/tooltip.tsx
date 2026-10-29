'use client';

import type { ReactNode } from 'react';
import { Tooltip as AriaTooltip, TooltipTrigger, type TooltipProps } from 'react-aria-components';

interface HintProps {
  /** The words, also the accessible name the trigger should carry itself. */
  label: string;
  placement?: TooltipProps['placement'];
  /** One React Aria button or link. */
  children: ReactNode;
}

/** A short label beside an icon-only control, on hover and on keyboard focus. */
export function Hint({ label, placement = 'end', children }: HintProps) {
  return (
    <TooltipTrigger delay={300} closeDelay={0}>
      {children}
      <AriaTooltip
        placement={placement}
        offset={8}
        className="rounded-sm bg-ink px-2 py-1 text-label font-medium text-ground shadow-overlay data-entering:animate-overlay-in"
      >
        {label}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
