import { useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'stay-flow:guest-link';

function stored(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function read(): string | null {
  return window.location.hash.slice(1) || stored();
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => {
    window.removeEventListener('hashchange', onChange);
  };
}

/**
 * The guest's manage-booking token, from `/manage#token`: undefined while rendering on the server,
 * null when this tab has none. The token rides in the fragment, which browsers never send to a
 * server or in a Referer. Once read it is kept for this tab and taken off the address, so a copied
 * address or a screenshot does not hand the booking to someone else.
 */
export function useGuestToken(): string | null | undefined {
  const token = useSyncExternalStore(subscribe, read, () => undefined);

  useEffect(() => {
    const fromAddress = window.location.hash.slice(1);
    if (!fromAddress) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, fromAddress);
      window.history.replaceState(window.history.state, '', window.location.pathname);
    } catch {
      // Private mode: leave the token in the address, so a reload still opens the booking.
    }
  }, [token]);

  return token;
}
