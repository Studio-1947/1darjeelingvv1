import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { House, Ticket, Storefront, User, ImagesSquare, Heart } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { useFavorites } from '@/context/FavoritesContext';

type Tab = { key: string; to: string; match: string[]; label: string; icon: React.ElementType; badge?: number };

/**
 * Bottom tab bar (red /7), on every screen size.
 * Traveller: Home, Feed, My trip, Saved, Account. Business side: Dashboard, My listings, Feed, Profile.
 * Active = brand red; inactive = faint grey. Tabs match the routes they stand for, not where
 * they send a signed-out visitor, so /login lights no tab.
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { user, isHostMode } = useAuth();
  const { pathname } = useLocation();
  const savedCount = useFavorites().ids.size;
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => { setAvatarError(false); }, [user?.avatar]);

  const gate = (to: string) => (user ? to : `/login?next=${to}`);

  const tabs: Tab[] = isHostMode
    ? [
        { key: 'home', to: '/provider/dashboard', match: ['/provider/dashboard'], label: t('nav.dashboard'), icon: House },
        { key: 'trips', to: '/my-listings', match: ['/my-listings'], label: t('nav.my_listings'), icon: Storefront },
        { key: 'feed', to: '/feed', match: ['/feed'], label: t('nav.feed_tab'), icon: ImagesSquare },
        { key: 'account', to: '/provider/profile', match: ['/provider/profile'], label: t('nav.profile'), icon: User },
      ]
    : [
        { key: 'home', to: '/', match: ['/'], label: t('nav.home'), icon: House },
        { key: 'feed', to: '/feed', match: ['/feed'], label: t('nav.feed_tab'), icon: ImagesSquare },
        { key: 'trips', to: gate('/my-trips'), match: ['/my-trips'], label: t('nav.trips'), icon: Ticket },
        { key: 'saved', to: gate('/saved'), match: ['/saved'], label: t('nav.saved'), icon: Heart, badge: savedCount },
        { key: 'account', to: '/dashboard', match: ['/dashboard'], label: t('nav.account'), icon: User },
      ];

  return (
    <nav className="ag-tabbar" data-testid="bottom-nav" aria-label={t('nav.menu')}>
      <div className="ag-wrap">
        {tabs.map((tab) => {
          const active = tab.match.includes(pathname);
          const Icon = tab.icon;
          const isAccount = tab.key === 'account';
          return (
            <Link key={tab.key} to={tab.to} className="ag-tab" data-testid={`bottom-nav-${tab.key}`} aria-current={active ? 'page' : undefined}>
              <span className="ind">
                {isAccount && user?.avatar && !avatarError ? (
                  <img src={user.avatar} alt="" className="av" onError={() => setAvatarError(true)} data-testid="bottom-nav-avatar" />
                ) : isAccount && user?.name ? (
                  <span className="av" data-testid="bottom-nav-initial">{user.name.trim().charAt(0).toUpperCase()}</span>
                ) : (
                  <Icon weight={active ? 'fill' : 'regular'} />
                )}
                {!!tab.badge && <span className="ag-badge">{tab.badge > 99 ? '99+' : tab.badge}</span>}
              </span>
              <span className="truncate max-w-full">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
