import React from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { House, Buildings, Taxi, Leaf, SquaresFour, Gauge, Calendar, ChatCircle, User } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import MobileTabBar, { TabItem } from '@/components/mobile/TabBar';

/**
 * Mobile bottom tab bar - the app's primary navigation below `lg`, restructured
 * to match 1-Darjeeling-Mobile-App's tourist tab bar: Home / Stays / Rides /
 * Nature / Culture. Trips, Notifications and Profile no longer live here -
 * they move to `mobile/HomeHeaderActions.tsx`, rendered in the mobile Home
 * header (Phase 2), matching RN's HomeHeaderActions pattern.
 *
 * Stays and Rides reuse the existing /homestays and /drivers category routes
 * unchanged. Nature and Culture are new routes wrapping /biodiversity and
 * /events+/spots respectively (see pages/Nature.tsx, pages/Culture.tsx).
 *
 * The old "Type" tab (CategorySheet toggle) is retired: these four tabs
 * already cover 4 of its 7 categories, and Shops/Cafes become reachable via
 * Home's search surface (Phase 2) and /search - matching how RN routes
 * "everything else" through its eat.tsx screen rather than a raw category grid.
 *
 * Phase 6: signed-in providers see a completely different tab set (Dashboard/
 * Bookings/Chats/Account), matching RN's separate provider tab group
 * (app/(provider)/_layout.tsx) - provider mode is a genuinely separate app
 * section there, not a tourist-tabs-plus-a-link afterthought. Labels stay
 * identical across business roles rather than RN's role-varying middle-tab
 * text ("Post Trip"/"Deals") - RN's own research confirms those route to the
 * same underlying screens as the homestay labels, just relabeled.
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { user } = useAuth();

  const items: TabItem[] = user?.role === 'provider'
    ? [
        { key: 'dashboard', to: '/provider/dashboard', label: t('nav.dashboard'), icon: Gauge, testId: 'bottom-nav-provider-dashboard' },
        { key: 'bookings', to: '/provider/dashboard', label: t('mobileProviderDashboard.tab_bookings'), icon: Calendar, testId: 'bottom-nav-provider-bookings' },
        { key: 'chats', to: '/provider/chats', label: t('mobileProviderChats.tab'), icon: ChatCircle, testId: 'bottom-nav-provider-chats' },
        { key: 'account', to: '/provider/account', label: t('nav.account'), icon: User, testId: 'bottom-nav-provider-account' },
      ]
    : [
        { key: 'home', to: '/', label: t('nav.home'), icon: House, testId: 'bottom-nav-home' },
        { key: 'stays', to: '/homestays', label: t('nav.stays'), icon: Buildings, testId: 'bottom-nav-stays' },
        { key: 'rides', to: '/drivers', label: t('nav.rides'), icon: Taxi, testId: 'bottom-nav-rides' },
        { key: 'nature', to: '/nature', label: t('nav.nature'), icon: Leaf, testId: 'bottom-nav-nature' },
        { key: 'culture', to: '/culture', label: t('nav.culture'), icon: SquaresFour, testId: 'bottom-nav-culture' },
      ];

  const activeKey = items.find((it) => it.to === pathname)?.key ?? '';

  return <MobileTabBar items={items} activeKey={activeKey} dark={activeKey === 'nature'} />;
}
