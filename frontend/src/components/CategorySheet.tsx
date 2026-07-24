import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { CATEGORIES } from '@/constants/categories';

/**
 * Full-screen category browser that rises from the "Type" tab.
 *
 * Covers the whole viewport (the bottom bar stays on top at z-50, so Type keeps
 * toggling it). Seven large cards fill the height in a two-column grid; the
 * seventh spans the full width so the trailing row never reads as a gap. Mobile
 * only - desktop uses the header rail.
 *
 * Closes on: a category tap, the close button, Escape, or a route change.
 */

// Short labels (nav.*) rather than the editorial categories.* - the tiles are
// wide but the shorter forms keep the type set on one line at any width.
const NAV_LABEL_KEY: Record<string, string> = {
  spot: 'spots',
  homestay: 'homestays',
  driver: 'drivers',
  shop: 'shops',
  cafe: 'cafes',
  event: 'events',
  biodiversity: 'biodiversity',
};

export default function CategorySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  // Close on route change - tapping a category should dismiss the browser.
  // Keyed on pathname only: re-running when open/onClose change would fire
  // mid-open and close it before it's seen.
  useEffect(() => {
    if (open) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Escape to close; lock the page behind it from scrolling.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const last = CATEGORIES.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('nav.categories')}
      data-testid="type-sheet"
      className="lg:hidden fixed inset-0 z-40 flex flex-col bg-[var(--bg)]
                 animate-in fade-in slide-in-from-bottom duration-300 ease-out"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('nav.discover')}</div>
          <h2 className="font-display font-extrabold text-2xl text-ink leading-tight">{t('nav.categories')}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          data-testid="type-sheet-close"
          className="w-10 h-10 rounded-full grid place-items-center text-ink hover:bg-mist transition-colors"
        >
          <X size={22} />
        </button>
      </div>

      {/* Grid fills the remaining height; auto-rows-fr stretches rows to fill. */}
      <div
        className="flex-1 min-h-0 grid grid-cols-2 auto-rows-fr gap-3 px-4
                   pb-[calc(var(--bottom-nav-h)+0.75rem)]"
      >
        {CATEGORIES.map(({ key, to, Icon }, i) => {
          const active = pathname === to;
          return (
            <Link
              key={key}
              to={to}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              data-testid={`type-sheet-${key}`}
              className={`group flex flex-col items-center justify-center gap-3 rounded-3xl border p-4
                min-h-0 transition-colors ${i === last ? 'col-span-2' : ''}
                ${active
                  ? 'border-pine bg-pine/5'
                  : 'border-[var(--line)] bg-white hover:border-pine/40'}`}
            >
              <span
                className={`w-16 h-16 rounded-full grid place-items-center transition-colors flex-shrink-0
                  ${active ? 'bg-pine text-white' : 'bg-mist text-pine group-hover:bg-pine/10'}`}
              >
                <Icon className="w-8 h-8" strokeWidth={1.8} />
              </span>
              <span
                className={`text-sm text-center leading-tight
                  ${active ? 'font-extrabold text-pine' : 'font-bold text-ink'}`}
              >
                {t(`nav.${NAV_LABEL_KEY[key]}`)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
