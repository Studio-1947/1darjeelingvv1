import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react';

export type ViewerPhoto = { src: string; alt: string };

/**
 * Photos, full screen: on a phone a photo fills the screen edge to edge, on a desktop it sits
 * centred at its own size or smaller, never cropped. Tap the dark space, the close button or press
 * Escape to close; on a touch screen a downward swipe closes it too, and pinch-zoom still works.
 *
 * Given a set (`photos` + `index`), it also browses them: ‹ › arrows, "2 / 6", the ← → keys, and a
 * sideways swipe on a touch screen. A single `src` shows just that photo, as before.
 *
 * Rendered into <body> (like the listing Sheet) so it covers the header and bottom bar; the page
 * behind does not scroll while it is open, and focus returns to whatever opened it.
 */
export default function PhotoViewer({ src, alt, caption, onClose, photos, index = 0, testid = 'photo-viewer' }: {
  src?: string;
  alt?: string;
  caption?: React.ReactNode;
  onClose: () => void;
  photos?: ViewerPhoto[];
  index?: number;
  testid?: string;
}) {
  const { t } = useTranslation();
  const list: ViewerPhoto[] = photos && photos.length ? photos : [{ src: src || '', alt: alt || '' }];
  const [at, setAt] = useState(Math.min(Math.max(index, 0), list.length - 1));
  const many = list.length > 1;
  const photo = list[at];
  const go = (step: number) => setAt((i) => (i + step + list.length) % list.length);
  const goRef = useRef(go);
  goRef.current = go;

  const box = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Swipe down to close, sideways to change photo: how far the photo has been dragged, and from where.
  const [drag, setDrag] = useState(0);
  const start = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); }
      if (e.key === 'ArrowRight') { e.preventDefault(); goRef.current(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goRef.current(-1); }
      // Tab stays among the viewer's own buttons.
      if (e.key === 'Tab') {
        const stops = Array.from(box.current?.querySelectorAll<HTMLElement>('button') || []);
        if (!stops.length) return;
        e.preventDefault();
        const i = stops.indexOf(document.activeElement as HTMLElement);
        stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
      }
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
    start.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag(Math.max(0, e.clientY - start.current.y));
  };
  const onPointerEnd = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    start.current = null;
    if (many && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) { setDrag(0); go(dx < 0 ? 1 : -1); return; }
    if (drag > 120) onClose(); else setDrag(0);
  };

  // Over the photo's edge on a phone (dark enough to show on a light photo), beside it on a desktop.
  const arrow = 'absolute top-1/2 z-[1] grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white outline-none hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white sm:h-12 sm:w-12 sm:bg-white/15';

  return createPortal(
    <div ref={box} className="fixed inset-0 z-[80] flex flex-col bg-black/95 text-white animate-in fade-in duration-150"
      style={{ backgroundColor: `rgb(0 0 0 / ${Math.max(0.4, 0.95 - drag / 600)})` }}
      role="dialog" aria-modal="true" aria-label={photo.alt} data-testid={testid}
      onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.backdrop) onClose(); }}>
      <div data-backdrop="1" className="flex flex-none items-center justify-between p-3 pt-[max(12px,env(safe-area-inset-top))] pr-[max(12px,env(safe-area-inset-right))]">
        {many ? (
          <span className="pl-2 text-sm font-medium tabular-nums text-white/85" aria-live="polite" data-testid={`${testid}-count`}>
            {at + 1} / {list.length}
          </span>
        ) : <span />}
        <button ref={closeBtn} type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')}
          data-testid={`${testid}-close`}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/15 text-white outline-none hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white">
          <X size={22} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div data-backdrop="1" className="relative flex min-h-0 flex-1 items-center justify-center px-0 sm:px-20">
        {many && (
          <button type="button" onClick={() => go(-1)} className={`${arrow} left-3`} data-testid={`${testid}-prev`}
            aria-label={t('common.previous', 'Previous photo')} title={t('common.previous', 'Previous photo')}>
            <CaretLeft size={24} weight="bold" aria-hidden="true" />
          </button>
        )}
        <img key={photo.src} src={photo.src} alt={photo.alt} draggable={false}
          className="max-h-full max-w-full select-none object-contain sm:rounded-[12px]"
          style={{ transform: drag ? `translateY(${drag}px)` : undefined, transition: drag ? 'none' : 'transform .2s ease', touchAction: 'pinch-zoom' }}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} />
        {many && (
          <button type="button" onClick={() => go(1)} className={`${arrow} right-3`} data-testid={`${testid}-next`}
            aria-label={t('common.next', 'Next photo')} title={t('common.next', 'Next photo')}>
            <CaretRight size={24} weight="bold" aria-hidden="true" />
          </button>
        )}
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
