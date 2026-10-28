import { useSyncExternalStore } from 'react';

const subscribe = () => () => undefined;

/**
 * False while rendering on the server and hydrating, true after. For UI whose server HTML cannot
 * match the browser's, such as React Aria's calendar labels: Node and each browser ship different
 * ICU data, so the same date range can be spaced differently.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
