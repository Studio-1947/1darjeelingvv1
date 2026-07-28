import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { X, ArrowUpRight } from 'lucide-react';
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

// Pale tea-green washing off to white. The direction alternates per tile so the
// grid reads as eight separate cards catching the light rather than one sheet
// of colour sliced into rectangles.
const TILE_GRADIENT = [
  'bg-gradient-to-br from-[#EDF0D8] via-[#F7F9EE] to-white',
  'bg-gradient-to-tr from-[#EDF0D8] via-[#F7F9EE] to-white',
];

// The one saturated tile in the grid; also the accent behind each icon badge.
const OLIVE = '#5C7006';

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

  // `cell` is the tile's slot in the grid, not its index in CATEGORIES - the
  // browse-all card sits between the sixth and seventh type, so the gradient
  // has to alternate by position or the seam shows either side of it.
  const tile = ({ key, to, Icon }: typeof CATEGORIES[number], cell: number) => {
    const active = pathname === to;
    return (
      <Link
        key={key}
        to={to}
        onClick={onClose}
        aria-current={active ? 'page' : undefined}
        data-testid={`type-sheet-${key}`}
        className={`group flex flex-col items-start justify-center gap-3 rounded-3xl border p-4
          min-h-0 transition-shadow hover:shadow-md
          ${TILE_GRADIENT[cell % 2]}
          ${active ? 'border-[#5C7006] ring-1 ring-[#5C7006]' : 'border-[#E4E7CF]'}`}
      >
        <span className="font-display font-bold text-[15px] leading-tight text-ink">
          {t(`nav.${NAV_LABEL_KEY[key]}`)}
        </span>
        <span
          className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0 text-white"
          style={{ backgroundColor: OLIVE }}
        >
          <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
        </span>
      </Link>
    );
  };

  const head = CATEGORIES.slice(0, -1);
  const tail = CATEGORIES.slice(-1);

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

      {/* Eight tiles in a 2-up grid: six types, the browse-all card, then biodiversity.
          Rows stretch to fill the sheet but never squash below 6.5rem. */}
      <div
        className="flex-1 min-h-0 overflow-y-auto grid grid-cols-2 auto-rows-[minmax(6.5rem,1fr)] gap-3 px-4
                   pb-[calc(var(--bottom-nav-h)+0.75rem)]"
      >
        {CATEGORIES.slice(0, 6).map(({ key, to, Icon }, i) => {
          const active = pathname === to;
          return (
            <Link
              key={key}
              to={to}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              data-testid={`type-sheet-${key}`}
              className={`group flex flex-col items-start justify-center gap-3 rounded-3xl border p-4
                min-h-0 transition-shadow hover:shadow-md
                ${TILE_GRADIENT[i % 2]}
                ${active ? 'border-[#5C7006] ring-1 ring-[#5C7006]' : 'border-[#E4E7CF]'}`}
            >
              <span className="font-display font-bold text-[15px] leading-tight text-ink">
                {t(`nav.${NAV_LABEL_KEY[key]}`)}
              </span>
              <span
                className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0 text-white"
                style={{ backgroundColor: OLIVE }}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
              </span>
            </Link>
          );
        })}

        {/* Browse-all: Swapped placement to 7th position */}
        <Link
          to="/search"
          onClick={onClose}
          data-testid="type-sheet-browse-all"
          className="flex flex-col items-start justify-center gap-3 rounded-3xl p-4 min-h-0
                     text-white transition-shadow hover:shadow-md"
          style={{ backgroundColor: OLIVE }}
        >
          <span className="font-display font-bold text-[15px] leading-tight">
            {t('nav.browse_categories')}
          </span>
          <span className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0 bg-white/25">
            <ArrowUpRight className="w-[18px] h-[18px]" strokeWidth={2.4} />
          </span>
        </Link>

        {/* Biodiversity: Swapped placement to 8th position */}
        {CATEGORIES.slice(6).map(({ key, to, Icon }) => {
          const active = pathname === to;
          return (
            <Link
              key={key}
              to={to}
              onClick={onClose}
              aria-current={active ? 'page' : undefined}
              data-testid={`type-sheet-${key}`}
              className={`group flex flex-col items-start justify-center gap-3 rounded-3xl border p-4
                min-h-0 transition-shadow hover:shadow-md
                ${TILE_GRADIENT[1]}
                ${active ? 'border-[#5C7006] ring-1 ring-[#5C7006]' : 'border-[#E4E7CF]'}`}
            >
              <span className="font-display font-bold text-[15px] leading-tight text-ink">
                {t(`nav.${NAV_LABEL_KEY[key]}`)}
              </span>
              <span
                className="w-9 h-9 rounded-full grid place-items-center flex-shrink-0 text-white"
                style={{ backgroundColor: OLIVE }}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
