'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { formatTime, plural, zoneLabel } from '@/lib/format';
import { cx } from '@/ui/cx';

interface HoldFrameProps {
  expiresAt: number;
  heldAt: number;
  now: number;
  children: ReactNode;
}

/** The frame sits this far outside the button, and follows its corners at that distance. */
const GAP = 6;
const STROKE = 2.5;
const BUTTON_RADIUS = 10;

/**
 * Wraps the Confirm button in a border that drains as the hold runs out: a calm signal with no
 * ticking seconds and no red, because the server, not the page, decides when a hold ends.
 */
export function HoldFrame({ expiresAt, heldAt, now, children }: HoldFrameProps) {
  const total = Math.max(expiresAt - heldAt, 1);
  const left = Math.min(Math.max((expiresAt - now) / total, 0), 1);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  // Drawn at the button's real size: a stretched SVG would bend the corners and the dash.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const width = (size?.width ?? 0) + GAP * 2;
  const height = (size?.height ?? 0) + GAP * 2;
  const rect = {
    x: STROKE / 2,
    y: STROKE / 2,
    width: Math.max(width - STROKE, 0),
    height: Math.max(height - STROKE, 0),
    rx: BUTTON_RADIUS + GAP - STROKE / 2,
    fill: 'none',
    strokeWidth: STROKE,
  };

  return (
    <div ref={ref} className="relative m-1.5">
      {children}
      {size && (
        <svg
          aria-hidden="true"
          width={width}
          height={height}
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          className="pointer-events-none absolute -top-1.5 -left-1.5 overflow-visible"
        >
          <rect {...rect} className="stroke-rule" />
          <rect
            {...rect}
            className="stroke-action transition-[stroke-dasharray] duration-1000 ease-linear"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${(left * 100).toFixed(2)} 100`}
          />
        </svg>
      )}
    </div>
  );
}

interface HoldStatusProps {
  expiresAt: number;
  now: number;
  timeZone: string;
}

/** "Held for you until 14:52 Cairo time · 8 min left", saying it plainly in the last minute. */
export function HoldStatus({ expiresAt, now, timeZone }: HoldStatusProps) {
  // Less a second: the server clock is known to the second, so a fresh hold would read "11 min".
  const minutesLeft = Math.ceil((expiresAt - now - 1000) / 60_000);
  const lastMinute = minutesLeft <= 1;
  return (
    <>
      <p role="timer" aria-live="off" className="text-body text-ink-2">
        Held for you until{' '}
        <span className="numerals font-mono text-ink">{formatTime(expiresAt, timeZone)}</span>{' '}
        <span className="whitespace-nowrap">{zoneLabel(timeZone)} ·</span>{' '}
        <span className={cx('whitespace-nowrap', lastMinute && 'font-semibold text-ink')}>
          {lastMinute ? 'less than a minute left' : `${plural(minutesLeft, 'min', 'min')} left`}
        </span>
      </p>
      {/* Announced once, not every tick: a countdown read aloud every second is noise. */}
      <p aria-live="polite" className="sr-only">
        {lastMinute ? 'Less than a minute left on your hold. Confirm now to keep the room.' : ''}
      </p>
    </>
  );
}
