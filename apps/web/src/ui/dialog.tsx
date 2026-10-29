'use client';

import type { ReactNode } from 'react';
import {
  Dialog as AriaDialog,
  Heading,
  Modal,
  ModalOverlay,
  type ModalOverlayProps,
} from 'react-aria-components';

interface DialogProps extends Omit<ModalOverlayProps, 'children' | 'className'> {
  title: string;
  /** "alertdialog" for a choice that cannot be undone, so screen readers treat it as urgent. */
  role?: 'dialog' | 'alertdialog';
  children: (close: () => void) => ReactNode;
}

/** A modal that rises as a sheet from the bottom on phones and sits centred on larger screens. */
export function Dialog({ title, role = 'dialog', children, ...props }: DialogProps) {
  return (
    <ModalOverlay
      {...props}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_oklab,var(--color-ink)_45%,transparent)] sm:items-center sm:p-6 data-entering:animate-overlay-in data-exiting:animate-overlay-out"
    >
      <Modal className="max-h-[92dvh] w-full overflow-y-auto rounded-t-lg border border-rule bg-paper shadow-overlay sm:max-w-lg sm:rounded-lg data-entering:animate-dialog-in data-exiting:animate-dialog-out">
        <AriaDialog
          ref={keepFocus}
          role={role}
          className="flex flex-col gap-5 p-6 outline-hidden sm:p-7"
        >
          {({ close }) => (
            <>
              <Heading slot="title" className="font-display text-headline font-normal text-ink">
                {title}
              </Heading>
              {children(close)}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}

/**
 * A form that disables its fields while it saves drops focus to the page when the focused field
 * goes disabled, out of reach of Escape and Tab. This hands focus back as soon as the field is
 * enabled again, or to the dialog when the field is gone.
 */
function keepFocus(dialog: HTMLElement | null) {
  if (!dialog) return;
  let observer: MutationObserver | null = null;
  const onFocusOut = (event: FocusEvent) => {
    const field = event.target;
    if (event.relatedTarget !== null || !(field instanceof HTMLElement)) return;
    if (!field.matches(':disabled')) return;
    observer?.disconnect();
    observer = new MutationObserver(() => {
      if (document.activeElement !== document.body) {
        observer?.disconnect();
      } else if (!field.isConnected) {
        observer?.disconnect();
        dialog.focus();
      } else if (!field.matches(':disabled')) {
        observer?.disconnect();
        field.focus();
      }
    });
    observer.observe(dialog, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['disabled'],
    });
  };
  dialog.addEventListener('focusout', onFocusOut);
  return () => {
    dialog.removeEventListener('focusout', onFocusOut);
    observer?.disconnect();
  };
}
