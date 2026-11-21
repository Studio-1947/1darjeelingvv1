import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from '@phosphor-icons/react';
import { Box, IconButton, cx } from '@/components/ag';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The modal surface for the listing page and the booking flow (red /7): a bottom sheet on phones,
 * a centred 22px card on wider screens. Rendered into <body> so a sheet opened from another sheet
 * (the payment over the booking fee) stacks on top instead of inside it.
 *
 * Focus: moves into the sheet when it opens, Tab stays inside it, Escape closes it (when it can be
 * closed), and focus goes back to whatever opened it.
 */
export default function Sheet({ onClose, labelledBy, label, testid, closeTestid, className, children }: {
  /** Omit for a sheet that must be answered (no close button, Escape does nothing). */
  onClose?: () => void;
  labelledBy?: string;
  label?: string;
  testid?: string;
  closeTestid?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const first = el?.querySelector<HTMLElement>('[data-autofocus]') || el;
    first?.focus({ preventScroll: true });
    return () => { opener?.focus?.({ preventScroll: true }); };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeRef.current?.();
      return;
    }
    if (e.key !== 'Tab' || !panel.current) return;
    e.stopPropagation();
    const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
    if (!items.length) { e.preventDefault(); return; }
    const head = items[0];
    const tail = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === head || document.activeElement === panel.current)) { e.preventDefault(); tail.focus(); }
    else if (!e.shiftKey && document.activeElement === tail) { e.preventDefault(); head.focus(); }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true"
      aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : label} data-testid={testid} onKeyDown={onKeyDown}>
      <button type="button" tabIndex={-1} aria-label={t('common.close')} onClick={() => onClose?.()}
        className="absolute inset-0 bg-ink/50 cursor-default" />
      <div ref={panel} tabIndex={-1} className="relative w-full sm:max-w-md outline-none focus-visible:outline-none animate-in fade-in slide-in-from-bottom-4 duration-200">
        <Box className={cx('relative max-h-[90svh] overflow-y-auto rounded-b-none sm:rounded-b-[var(--r-card)] pb-[max(16px,env(safe-area-inset-bottom))]', className)}>
          {onClose && (
            <IconButton label={t('common.close')} small onClick={onClose} data-testid={closeTestid} className="absolute right-3 top-3 z-10">
              <X />
            </IconButton>
          )}
          {children}
        </Box>
      </div>
    </div>,
    document.body,
  );
}

/** Eyebrow + title at the top of a sheet, clear of the close button. */
export function SheetHead({ id, eyebrow, title, children }: { id?: string; eyebrow?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="pr-10 flex flex-col gap-1">
      {eyebrow != null && <span className="ag-eyebrow">{eyebrow}</span>}
      <h2 id={id} className="!text-[22px] !leading-7">{title}</h2>
      {children}
    </div>
  );
}
