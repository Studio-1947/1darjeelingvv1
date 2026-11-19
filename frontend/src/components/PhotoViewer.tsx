import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from '@phosphor-icons/react';

/**
 * One photo, full screen: on a phone it fills the screen edge to edge, on a desktop it sits centred
 * at its own size or smaller, never cropped. Tap the dark space, the close button or press Escape
 * to close; on a touch screen a downward swipe closes it too, and pinch-zoom still works.
 *
 * Rendered into <body> (like the listing Sheet) so it covers the header and bottom bar; the page
 * behind does not scroll while it is open, and focus returns to whatever opened it.
 */
export default function PhotoViewer({ src, alt, caption, onClose, testid = 'photo-viewer' }: {
  src: string;
  alt: string;
  caption?: React.ReactNode;
  onClose: () => void;
  testid?: string;
}) {
  const { t } = useTranslation();
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Swipe down to close: how far the photo has been dragged, and where the drag began.
  const [drag, setDrag] = useState(0);
  const start = useRef<{ id: number; y: number } | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); }
      // The close button is the only stop, so Tab stays on it.
      if (e.key === 'Tab') { e.preventDefault(); closeBtn.current?.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, []);

  // Only a one-finger drag at normal zoom moves the photo; a pinch or a zoomed-in pan is left alone.
  const zoomed = () => (window.visualViewport?.scale ?? 1) > 1.01;
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || zoomed() || start.current) return;
    start.current = { id: e.pointerId, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag(Math.max(0, e.clientY - start.current.y));
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    start.current = null;
    if (drag > 120) onClose(); else setDrag(0);
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/95 text-white animate-in fade-in duration-150"
      style={{ backgroundColor: `rgb(0 0 0 / ${Math.max(0.4, 0.95 - drag / 600)})` }}
      role="dialog" aria-modal="true" aria-label={alt} data-testid={testid}
      onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop) onClose(); }}>
      <div data-backdrop="1" className="flex flex-none justify-end p-3 pt-[max(12px,env(safe-area-inset-top))] pr-[max(12px,env(safe-area-inset-right))]">
        <button ref={closeBtn} type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}
          data-testid={`${testid}-close`}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white outline-none hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white">
          <X size={22} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div data-backdrop="1" className="flex min-h-0 flex-1 items-center justify-center px-0 sm:px-6">
        <img src={src} alt={alt} draggable={false}
          className="max-h-full max-w-full select-none object-contain sm:rounded-[12px]"
          style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? 'none' : 'transform .2s ease', touchAction: 'pinch-zoom' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} />
      </div>
      {caption ? (
        <div data-backdrop="1" className="flex-none px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] text-center text-base font-medium">
          {caption}
        </div>
      ) : <div className="flex-none pb-[max(16px,env(safe-area-inset-bottom))]" />}
    </div>,
    document.body,
  );
}
