import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { useFavorites } from '@/context/FavoritesContext';
import { Icon, type IconName } from '@/components/ag/Icon';

type Tab = { key: string; to: string; match: string[]; label: string; icon: IconName; badge?: number };

/**
 * Bottom tab bar (red /7), on every screen size, drawn with the prototype's own tab icons
 * (t_home, t_feed, t_trip, t_saved, t_me). Active = brand red; inactive = faint grey.
 * Traveller: Home, Feed, My trip, Saved, Account. Hosts: Home (dashboard), Feed, Bookings, Saved, Account.
 * Signed out, My trip and Saved still open their screens (an empty box and a way to log in), as the
 * prototype does, instead of the sign-in page.
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { user, isHostMode } = useAuth();
  const { pathname, search } = useLocation();
  // A tab matches its path, or its path plus query (?s=bookings); the bare path only when no sub-screen is open.
  const here = pathname + search;
  const isActive = (m: string[]) => m.some((x) => (x.includes('?') ? here.startsWith(x) : pathname === x && !new URLSearchParams(search).get('s')));
  const savedCount = useFavorites().ids.size;
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => { setAvatarError(false); }, [user?.avatar]);

  // Hosts keep the traveller's five tabs, as in the prototype; My trip becomes Bookings and Home is
  // the business dashboard. My listings is reached from the dashboard's "Your listings · See all".
  const tabs: Tab[] = isHostMode
    ? [
        { key: 'home', to: '/provider/dashboard', match: ['/provider/dashboard'], label: t('nav.home'), icon: 't_home' },
        { key: 'feed', to: '/feed', match: ['/feed'], label: t('nav.feed_tab'), icon: 't_feed' },
        { key: 'trips', to: '/provider/dashboard?s=bookings', match: ['/provider/dashboard?s=bookings'], label: t('host.bookings_tab', 'Bookings'), icon: 't_trip' },
        { key: 'saved', to: '/saved', match: ['/saved'], label: t('nav.saved'), icon: 't_saved', badge: savedCount },
        { key: 'account', to: '/provider/profile', match: ['/provider/profile', '/my-listings'], label: t('nav.account'), icon: 't_me' },
      ]
    : [
        { key: 'home', to: '/', match: ['/'], label: t('nav.home'), icon: 't_home' },
        { key: 'feed', to: '/feed', match: ['/feed'], label: t('nav.feed_tab'), icon: 't_feed' },
        { key: 'trips', to: '/my-trips', match: ['/my-trips'], label: t('nav.trips'), icon: 't_trip' },
        { key: 'saved', to: '/saved', match: ['/saved'], label: t('nav.saved'), icon: 't_saved', badge: savedCount },
        { key: 'account', to: '/dashboard', match: ['/dashboard'], label: t('nav.account'), icon: 't_me' },
      ];

  return (
    <nav className="ag-tabbar" data-testid="bottom-nav" aria-label={t('nav.menu')}>
      <div className="ag-wrap">
        {tabs.map((tab) => {
          const active = isActive(tab.match);
          const isAccount = tab.key === 'account';
          return (
            <Link key={tab.key} to={tab.to} className="ag-tab" data-testid={`bottom-nav-${tab.key}`} aria-current={active ? 'page' : undefined}>
              <span className="ind">
                {isAccount && user?.avatar && !avatarError ? (
                  <img src={user.avatar} alt="" className="av" onError={() => setAvatarError(true)} data-testid="bottom-nav-avatar" />
                ) : isAccount && user?.name ? (
                  <span className="av" data-testid="bottom-nav-initial">{user.name.trim().charAt(0).toUpperCase()}</span>
                ) : (
                  <Icon name={tab.icon} />
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
