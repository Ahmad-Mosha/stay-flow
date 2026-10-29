'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import type { NavItem } from './nav';

/** How long after G the second key still counts. */
const CHORD_MS = 1500;

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.matches('input, textarea, select'))
  );
}

/**
 * Keyboard shortcuts for people at a desk all day: G then a letter opens a section, and / jumps
 * to the search field of the page, if it has one.
 */
export function useGoShortcuts(items: readonly NavItem[]) {
  const router = useRouter();
  useEffect(() => {
    let armedUntil = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === '/') {
        const search = document.querySelector<HTMLElement>('[data-shortcut="search"]');
        if (search) {
          event.preventDefault();
          search.focus();
        }
        return;
      }
      if (key === 'g') {
        armedUntil = event.timeStamp + CHORD_MS;
        return;
      }
      if (event.timeStamp > armedUntil) return;
      armedUntil = 0;
      const item = items.find((candidate) => candidate.shortcut === key);
      if (item) {
        event.preventDefault();
        router.push(item.href);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [items, router]);
}
