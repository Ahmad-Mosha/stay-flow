'use client';

import { useEffect, useEffectEvent } from 'react';
import { AlertIcon, CheckIcon } from './icons';

export interface NoticeMessage {
  text: string;
  /** "done" confirms an action; "warning" says why something did not happen. */
  tone: 'done' | 'warning';
}

interface NoticeProps {
  /** Such as "Room 202 is back on sale." Null shows nothing. */
  message: NoticeMessage | null;
  onDismiss: () => void;
}

const SHOW_MS = 6000;

/**
 * A short confirmation at the bottom of the screen that leaves by itself. The live region stays
 * in the page, so screen readers announce each new message.
 */
export function Notice({ message, onDismiss }: NoticeProps) {
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(dismiss, SHOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [message]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
    >
      {message && (
        <p className="flex max-w-lg animate-popover-in items-center gap-2.5 rounded-md bg-ink px-4 py-3 text-small font-medium text-ground shadow-overlay">
          {message.tone === 'done' ? (
            <CheckIcon className="size-4" />
          ) : (
            <AlertIcon className="size-4" />
          )}
          {message.text}
        </p>
      )}
    </div>
  );
}
