import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { CATEGORY_PATH, CATEGORY_TITLE } from '@/lib/categoryNames';

/** Roots of the tab bar: no breadcrumb on these. A ?s= sub-screen of one is not a root. */
export const TAB_ROOTS = ['/', '/feed', '/my-trips', '/saved', '/dashboard'];

type Crumb = { label: string; to?: string };
/** What a page with a name from the server tells the breadcrumb: its title, and a listing's type. */
type PageName = { path: string; title?: string; type?: string };

/** Where the back arrow goes instead of the parent crumb (a step-by-step page's previous step). */
type BackTo = { path: string; to: string; label: string };

const CrumbCtx = createContext<{
  name: PageName | null; setName: (n: PageName | null) => void;
  back: BackTo | null; setBack: (b: BackTo | null) => void;
}>({ name: null, setName: () => {}, back: null, setBack: () => {} });

export function CrumbProvider({ children }: { children: React.ReactNode }) {
  const [name, setName] = useState<PageName | null>(null);
  const [back, setBack] = useState<BackTo | null>(null);
  const value = useMemo(() => ({ name, setName, back, setBack }), [name, back]);
  return <CrumbCtx.Provider value={value}>{children}</CrumbCtx.Provider>;
}

/**
 * A page made of steps (the host sign-up wizard) points the back arrow at its previous step;
 * `to` null leaves the arrow on the parent crumb (the first step).
 */
export function useCrumbBack(to: string | null, label: string) {
  const { setBack } = useContext(CrumbCtx);
  const { pathname } = useLocation();
  useEffect(() => {
    setBack(to ? { path: pathname, to, label } : null);
    return () => setBack(null);
  }, [pathname, to, label, setBack]);
}

/** A page whose name comes from the server (a listing, a business, a trip plan) names its last crumb. */
export function useCrumbTitle(title?: string | null, type?: string | null) {
  const { setName } = useContext(CrumbCtx);
  const { pathname } = useLocation();
  useEffect(() => {
    setName({ path: pathname, title: title || undefined, type: type || undefined });
    return () => setName(null);
  }, [pathname, title, type, setName]);
}

/** The trail for a page: every step from its tab root to the page itself (last, not a link). */
function trail(t: TFunction, pathname: string, sub: string | null, name: PageName | null): Crumb[] {
  const home: Crumb = { label: t('nav.home', 'Home'), to: '/' };
  const account: Crumb = { label: t('nav.account', 'Account'), to: '/dashboard' };
  // Home is the Home feed on both sides (2026-11-27); the Business dashboard opens from Account.
  const biz: Crumb = { label: t('ui.account.bdash', 'Business dashboard'), to: '/provider/dashboard' };
  const feed: Crumb = { label: t('nav.feed_tab', 'Feed'), to: '/feed' };
  const policies: Crumb = { label: t('policies.title', 'Policies'), to: '/policies' };
  const named = name && name.path === pathname ? name : null;
  const here = (label: string): Crumb => ({ label });
  const on = (p: string) => !!matchPath(p, pathname);

  if (pathname === '/provider/dashboard') {
    if (sub === 'bookings') return [account, biz, here(t('host.bookings_tab', 'Bookings'))];
    if (sub === 'documents') return [account, biz, here(t('crumb.documents', 'Documents'))];
    return [account, here(biz.label)];
  }
  if (pathname === '/dashboard') {
    if (sub === 'language') return [account, here(t('lang.choose', 'Language'))];
    if (sub === 'tdash') return [account, here(t('ui.account.tdash', 'Traveller dashboard'))];
  }
  const cat = Object.entries(CATEGORY_PATH).find(([, p]) => p === pathname);
  if (cat) return [home, here(t(...CATEGORY_TITLE[cat[0]]))];
  if (on('/listing/:id')) {
    const type = named?.type;
    const parent = type && CATEGORY_PATH[type] && CATEGORY_TITLE[type] ? [{ label: t(...CATEGORY_TITLE[type]), to: CATEGORY_PATH[type] }] : [];
    return [home, ...parent, here(named?.title || t('crumb.listing', 'Listing'))];
  }
  if (on('/business/:id')) return [home, here(named?.title || t('crumb.business', 'Business'))];
  // A host's own website page, aanganerp.in/<type>/<name>: under its category.
  const site = ['driver', 'homestay', 'cafe', 'shop', 'guide'].find((ty) => on(`/${ty}/:slug`));
  if (site) {
    const parent = CATEGORY_PATH[site] && CATEGORY_TITLE[site] ? [{ label: t(...CATEGORY_TITLE[site]), to: CATEGORY_PATH[site] }] : [];
    return [home, ...parent, here(named?.title || t('crumb.business', 'Business'))];
  }
  if (on('/provider/listings/:id')) return [account, biz, { label: t('hostProfile.title', 'Business profile'), to: '/provider/profile' }, here(named?.title || t('crumb.listing', 'Listing'))];
  if (on('/plan/:id')) return [feed, { label: t('plans.plan_trip', 'Plan a trip'), to: '/plan' }, here(named?.title || t('crumb.plan', 'Trip plan'))];

  const legal: Record<string, [string, string]> = {
    '/privacy': ['privacy.title', 'Privacy Policy'],
    '/terms': ['terms.title', 'Terms & Conditions'],
    '/refunds': ['refunds.title', 'Refund & Cancellation Policy'],
    '/responsible': ['responsible.title', 'Responsible Tourism'],
    '/contact': ['contact.title', 'Contact Us'],
    '/delete-account': ['data_deletion.title', 'Delete Your Account & Data'],
  };
  if (legal[pathname]) return [home, policies, here(t(...legal[pathname]))];

  const simple: Record<string, [Crumb, string, string]> = {
    '/explore': [home, 'nav.categories', 'Categories'],
    '/search': [home, 'category.search', 'Search'],
    '/login': [home, 'nav.login', 'Log in'],
    '/notifications': [home, 'notes.title', 'Notifications'],
    '/donate': [home, 'donate.title', 'Support aangan'],
    '/about': [home, 'crumb.about', 'About'],
    '/policies': [home, 'policies.title', 'Policies'],
    '/plan': [feed, 'plans.plan_trip', 'Plan a trip'],
    '/support': [account, 'member.title_short', 'Membership'],
    '/theme': [account, 'theme.title', 'Theme colour'],
    '/profile/edit': [account, 'crumb.edit_profile', 'Edit profile'],
    '/provider/profile': [biz, 'hostProfile.title', 'Business profile'],
    '/my-listings': [biz, 'crumb.my_listings', 'My listings'],
    '/provider/onboard': [account, 'crumb.onboard', 'List your business'],
  };
  if (simple[pathname]) { const [parent, k, d] = simple[pathname]; return [parent, here(t(k, d))]; }
  return [home, here(t('crumb.not_found', 'Page not found'))];
}

/**
 * The page's breadcrumb, at the top of every screen under the bar (it replaced the round back
 * button that sat in the bar): a back arrow to the step above, then the trail from the tab root,
 * e.g. "‹  Home › Homestay › Soumic Palace". The business pages sit under Account › Business
 * Dashboard, where they are opened from. Tab roots have none.
 */
export default function PageBack() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const { name, back } = useContext(CrumbCtx);
  const sub = new URLSearchParams(search).get('s');

  if (TAB_ROOTS.includes(pathname) && !sub) return null;

  const crumbs = trail(t, pathname, sub, name);
  const step = back && back.path === pathname ? back : null;
  const parent = step ? { to: step.to, label: step.label } : [...crumbs].reverse().find((c) => c.to);

  return (
    <div className="ag-wrap">
      <nav className="ag-crumbs" aria-label={t('crumb.nav', 'Breadcrumb')} data-testid="breadcrumb">
        {parent?.to && (
          <Link to={parent.to} className="ag-crumbs-back" aria-label={`${t('common.back', 'Back')}: ${parent.label}`} data-testid="page-back">
            <CaretLeft weight="bold" aria-hidden="true" />
          </Link>
        )}
        <ol>
          {crumbs.map((c, i) => (
            <li key={i}>
              {i > 0 && <CaretRight className="sep" aria-hidden="true" />}
              {c.to ? <Link to={c.to}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
