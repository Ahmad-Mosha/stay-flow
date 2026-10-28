import { cx } from './cx';

/** A placeholder block while data loads. Mark the loading region itself with `aria-busy`. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx('block animate-pulse rounded-sm bg-rule', className)} />
  );
}
