import React from 'react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CATEGORIES } from '@/constants/categories';

/**
 * Mobile bottom tab bar - the app's primary browse control below `lg`.
 *
 * The seven categories used to sit in the header rail, which forced the bar to
 * carry a sideways-scrolling pill on phones. Down here they get a fixed grid
 * that needs no scrolling, and the header keeps only the brand and the menu.
 * Above `lg` this is hidden and the header rail takes over again.
 *
 * Labels come from `nav.*` rather than `categories.*`: at a seventh of a 360px
 * screen the longer editorial names ("Tourism spots", "Local shops") ellipsise
 * to nothing useful, while the short forms fit.
 */
const NAV_LABEL_KEY: Record<string, string> = {
  spot: 'spots',
  homestay: 'homestays',
  driver: 'drivers',
  shop: 'shops',
  cafe: 'cafes',
  event: 'events',
  biodiversity: 'biodiversity',
};

export default function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav
      data-testid="bottom-nav"
      aria-label={t('nav.categories')}
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-[var(--line)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-7">
        {CATEGORIES.map(({ key, to, Icon }) => {
          const label = t(`nav.${NAV_LABEL_KEY[key]}`);
          return (
            <NavLink
              key={key}
              to={to}
              data-testid={`bottom-nav-${key}`}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 text-[10px] font-semibold ${
                  isActive ? 'text-flag' : 'text-ink-soft'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.6 : 2} className="flex-shrink-0" />
                  <span className="truncate max-w-full px-0.5">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
