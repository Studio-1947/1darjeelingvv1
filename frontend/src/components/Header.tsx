import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import Wordmark from '@/components/Wordmark';
import useGoBack from '@/hooks/useGoBack';
import api from '@/lib/api';
import { Icon } from '@/components/ag/Icon';
import { Status } from '@/components/ag';
import { useMode } from '@/lib/theme';
import SearchSheet from '@/components/SearchSheet';

/** When the bell last asked for the unread count (shared across page changes). */
let lastUnreadCheck = 0;
let lastUnreadCount = 0;

/** Roots of the tab bar: nothing to go back to from these. */
const ROOTS = ['/', '/feed', '/my-trips', '/saved', '/dashboard', '/provider/dashboard'];

/** On Home the search button appears once the page's own search box has scrolled under the bar. */
function useHomeSearchScrolledAway(active: boolean) {
  const [away, setAway] = React.useState(false);
  React.useEffect(() => {
    if (!active) { setAway(false); return undefined; }
    const check = () => {
      const box = document.querySelector('[data-home-search]');
      setAway(!!box && box.getBoundingClientRect().bottom < 70);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    return () => window.removeEventListener('scroll', check);
  }, [active]);
  return away;
}

/**
 * Top bar, as the red /7 prototype draws it (app.js render()):
 * Back on every screen except the tab roots; the full wordmark always; then Search (everywhere but
 * Home, where it appears once the home search has scrolled away), the theme switch, the bell (always),
 * and Log in (tab roots, signed out). Getting the app lives on the notifications page (GetAppCard).
 */
export default function Header() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname, search: query } = useLocation();
  const navigate = useNavigate();
  const goBack = useGoBack();
  const [mode, setMode] = useMode();

  // Unread notifications, for the badge on the bell. Re-read on every page change and when the
  // notifications page marks something read.
  const [unread, setUnread] = React.useState(lastUnreadCount);
  // Who the count is for. A reply is kept if the same person is still signed in, even when the
  // effect has re-run meanwhile (a fresh /auth/me gives a new user object); dropping it left the
  // badge empty until the next 60 s check.
  const unreadFor = React.useRef<string | undefined>(undefined);
  unreadFor.current = user?.id;
  React.useEffect(() => {
    if (!user) { lastUnreadCount = 0; lastUnreadCheck = 0; setUnread(0); return undefined; }
    const forUser = user.id;
    const read = () => {
      lastUnreadCheck = Date.now();
      api.get('/notifications', { params: { limit: 1 } })
        .then(({ data }) => { if (unreadFor.current !== forUser) return; lastUnreadCount = Number(data.unread_count) || 0; setUnread(lastUnreadCount); }).catch(() => {});
    };
    if (Date.now() - lastUnreadCheck > 30_000) read();
    window.addEventListener('aangan:notifications', read);
    const every = window.setInterval(() => { if (document.visibilityState === 'visible') read(); }, 60_000);
    return () => { window.clearInterval(every); window.removeEventListener('aangan:notifications', read); };
  }, [user?.id, pathname]);

  // A sub-screen inside a tab root (e.g. /dashboard?s=language) gets Back, as in the prototype.
  const isRoot = ROOTS.includes(pathname) && !new URLSearchParams(query).get('s');
  const onHome = pathname === '/';
  const homeSearchAway = useHomeSearchScrolledAway(onHome);
  const showSearch = !onHome || homeSearchAway;

  // Search from any page (components/SearchSheet): every category for a traveller, a business's own
  // bookings, listings and notifications in host mode. Closed by a page change (a result was opened).
  const [searchOpen, setSearchOpen] = React.useState(false);
  React.useEffect(() => { setSearchOpen(false); }, [pathname, query]);
  const search = () => setSearchOpen(true);

  return (
    <header className="ag-header" data-testid="site-header">
      <div className="ag-wrap">
        {!isRoot && (
          <button type="button" className="ag-iconbtn" onClick={goBack} aria-label={t('common.back')} data-testid="header-back">
            <Icon name="back" />
          </button>
        )}

        <Link to="/" className="ag-brand gap-2" data-testid="brand-link" aria-label={`${t('brand', 'aangan')} ${t('ui.header.beta', 'Beta')}`}>
          <Wordmark className="word" still />
          {/* Early days: says so plainly, next to the name, on every screen. */}
          <Status tone="info" className="flex-none" data-testid="beta-label">{t('ui.header.beta', 'Beta')}</Status>
        </Link>

        <div className="ag-topact">
          {showSearch && (
            <button type="button" className="ag-iconbtn" onClick={search} aria-label={t('widget.search')} data-testid="header-search">
              <Icon name="search" />
            </button>
          )}
          <button
            type="button"
            className="ag-iconbtn"
            role="switch"
            aria-checked={mode === 'dark'}
            onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
            aria-label={t('theme.dark', 'Dark mode')}
            data-testid="header-mode"
          >
            <Icon name={mode === 'dark' ? 'sun' : 'moon'} />
          </button>
          <Link
            to="/notifications"
            className="ag-iconbtn"
            data-testid="header-notifications"
            aria-label={t('notes.title')}
          >
            <Icon name="bell" />
            {unread > 0 && <span className="ag-badge" data-testid="header-unread">{unread > 9 ? '9+' : unread}</span>}
          </Link>
          {isRoot && !user && (
            <Link to={`/login?next=${encodeURIComponent(pathname)}`} className="ag-loginbtn" data-testid="header-login">
              <span>{t('nav.login')}</span>
              <Icon name="arrowne" />
            </Link>
          )}
        </div>
      </div>
      {searchOpen && <SearchSheet onClose={() => setSearchOpen(false)} />}
    </header>
  );
}
