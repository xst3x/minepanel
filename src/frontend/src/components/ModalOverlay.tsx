import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { HTMLAttributes, MouseEvent as ReactMouseEvent } from 'react';

const openOverlays: HTMLElement[] = [];
const focusable = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type ModalOverlayProps = HTMLAttributes<HTMLDivElement> & {
  /** Opt in to dismissing the modal when the backdrop is clicked. Off by default. */
  closeOnBackdrop?: boolean;
};

/**
 * Portalled modal boundary shared by forms, confirmations and action sheets.
 * Clicking the dimmed backdrop does NOT close the modal unless `closeOnBackdrop`
 * is set; modals close via their own X / Cancel / action buttons (or Escape).
 */
export default function ModalOverlay({ children, onClick, closeOnBackdrop = false, ...props }: ModalOverlayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const headingId = useId();
  useEffect(() => {
    const overlay = ref.current as HTMLDivElement | null;
    if (!overlay) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const root = document.getElementById('root');
    const previousInert = root?.inert ?? false;
    openOverlays.push(overlay);
    document.body.style.overflow = 'hidden';
    if (root) root.inert = true;
    const dialog = overlay.querySelector<HTMLElement>('.modal, .player-modal-container, .fm-sheet') || overlay;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.tabIndex = -1;
    const heading = dialog.querySelector('h2, h3, .fm-sheet-title');
    if (heading && !dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
      heading.id ||= headingId;
      dialog.setAttribute('aria-labelledby', heading.id);
    }
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
    (controls().find(el => el.tagName === 'INPUT') || controls()[0] || dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (openOverlays.at(-1) !== overlay) return;
      // Escape closes an open dropdown first, not the whole modal
      if (event.key === 'Escape' && (event.target as HTMLElement | null)?.closest?.('[role="combobox"][aria-expanded="true"]')) return;
      if (event.key === 'Escape') {
        const close = dialog.querySelector<HTMLButtonElement>('.close-btn, .fm-sheet-cancel, [aria-label="Close"]');
        if (close) { event.preventDefault(); event.stopImmediatePropagation(); close.click(); }
      }
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      openOverlays.splice(openOverlays.indexOf(overlay), 1);
      document.body.style.overflow = previousOverflow;
      if (root) root.inert = previousInert;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [headingId]);
  const handleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    // A click whose target is the overlay itself is a backdrop click (this also covers
    // a drag that starts inside the dialog and is released outside it).
    if (!closeOnBackdrop && event.target === event.currentTarget) return;
    onClick?.(event);
  };
  return createPortal(<div ref={ref} {...props} onClick={handleClick}>{children}</div>, document.body);
}
