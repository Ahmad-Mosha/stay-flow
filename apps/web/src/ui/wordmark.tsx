import { cx } from './cx';

/** One stay on a ruled line. It starts half a night in, like a bar on the tape chart. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 44 24" fill="currentColor" className={className}>
      <rect x="7" y="6" width="10" height="9" rx="2" />
      <rect x="19" y="6" width="10" height="9" rx="2" />
      <rect x="31" y="6" width="7" height="9" rx="2" />
      <line x1="0" y1="20" x2="44" y2="20" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-2.5 text-ink', className)}>
      <LogoMark className="h-[0.75em] w-auto" />
      <span className="font-display leading-none font-medium tracking-[-0.01em]">
        Stay <em className="font-normal">Flow</em>
      </span>
    </span>
  );
}
