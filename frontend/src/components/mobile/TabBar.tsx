import React from 'react';
import { Link } from 'react-router-dom';
import type { IconProps } from '@phosphor-icons/react';

export type TabItem = {
  key: string;
  to: string;
  label: string;
  icon: React.ComponentType<IconProps>;
  testId?: string;
};

/**
 * Presentational 5-item bottom tab bar, mirroring RN's TabBar.tsx (AppTabBar).
 * BottomNav.tsx owns the items array, active-route matching, and role-based
 * destinations; this component only renders the frosted bar and highlight
 * state. `dark` mirrors RN giving the Nature screen an ink-toned bar.
 */
export default function MobileTabBar({
  items,
  activeKey,
  dark = false,
}: {
  items: TabItem[];
  activeKey: string;
  dark?: boolean;
}) {
  return (
    <nav
      data-testid="mobile-tab-bar"
      className={`mobile-ui lg:hidden fixed bottom-0 inset-x-0 z-50 backdrop-blur-xl border-t transition-colors ${
        dark
          ? 'bg-[var(--mu-ink)]/90 border-[var(--mu-on-dark-line)]'
          : 'bg-[var(--mu-surface)]/95 border-[var(--mu-border)]'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ key, to, label, icon: Icon, testId }) => {
          const active = key === activeKey;
          const activeColor = dark ? 'var(--mu-lime)' : 'var(--mu-green)';
          const inactiveColor = dark ? 'var(--mu-nav-inactive-dark)' : 'var(--mu-text-muted)';
          return (
            <Link
              key={key}
              to={to}
              data-testid={testId}
              aria-current={active ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 text-[10px] font-semibold transition-transform active:scale-95"
              style={{ color: active ? activeColor : inactiveColor }}
            >
              <Icon size={20} weight={active ? 'fill' : 'regular'} className="flex-shrink-0" />
              <span className="truncate max-w-full px-0.5">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
