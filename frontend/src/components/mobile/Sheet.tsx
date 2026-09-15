import React from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';

/**
 * Bottom sheet, phone-width only (no tablet centered-dialog variant - out of
 * scope since desktop stays untouched). Built on the same
 * `createPortal(..., document.body)` idiom already used by
 * BookingWidget.tsx's mobile panel: backdrop, drag-handle header, scrollable
 * body, optional sticky footer padded for the home indicator.
 */
export default function MobileSheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="mobile-ui fixed inset-0 z-[70] flex flex-col justify-end">
      <div
        className="fixed inset-0 bg-[var(--mu-ink)]/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-h-[85vh] flex flex-col bg-[var(--mu-surface)] rounded-t-[var(--mu-r-sheet)]"
        style={{ boxShadow: 'var(--mu-shadow-sheet)' }}
      >
        <div className="flex items-center justify-center pt-2.5 pb-1 flex-shrink-0">
          <div className="w-9 h-1 rounded-full bg-[var(--mu-border-strong)]" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 border-b border-[var(--mu-border)] flex-shrink-0">
          <span className="font-[family-name:var(--mu-font-display)] font-bold text-base text-[var(--mu-ink)]">
            {title}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-[var(--mu-canvas)] flex items-center justify-center text-[var(--mu-ink)] active:scale-90"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div
            className="p-4 border-t border-[var(--mu-border)] flex-shrink-0"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
