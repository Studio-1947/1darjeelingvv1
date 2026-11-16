import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bell, DownloadSimple } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import Wordmark from '@/components/Wordmark';
import useGoBack from '@/hooks/useGoBack';
import api from '@/lib/api';
import { APP_DOWNLOAD_URL } from '@/constants/app';
import AppComingSoon from '@/components/AppComingSoon';
import { IconButton } from '@/components/ag';

/** When the bell last asked for the unread count (shared across page changes). */
let lastUnreadCheck = 0;
let lastUnreadCount = 0;

/** Roots of the tab bar: nothing to go back to from these. */
const ROOTS = ['/', '/feed', '/my-trips', '/saved', '/dashboard', '/provider/dashboard', '/my-listings', '/provider/profile'];

/** The brand shows the full wordmark on landing, then hands over to the mark once per session. */
function useBrandSettled() {
  const [settled] = React.useState(() => {
    try { return sessionStorage.getItem('ag-brand') === '1'; } catch { return false; }
  });
  React.useEffect(() => {
    if (settled) return undefined;
    const id = window.setTimeout(() => { try { sessionStorage.setItem('ag-brand', '1'); } catch { /* private mode */ } }, 4500);
    return () => window.clearTimeout(id);
  }, [settled]);
  return settled;
}

/**
 * Top bar (red /7): Back or the brand on the left; App, the bell and Log in on the right.
 * Language, account and the Business / Traveller switch live on the Account tab.
 */
export default function Header() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const goBack = useGoBack();
  const settled = useBrandSettled();
  const [appSoon, setAppSoon] = React.useState(false);
  const closeAppSoon = React.useCallback(() => setAppSoon(false), []);

  // Unread notifications, for the badge on the bell. Re-read on every page change and when the
  // notifications page marks something read.
  const [unread, setUnread] = React.useState(lastUnreadCount);
  React.useEffect(() => {
    if (!user) { lastUnreadCount = 0; lastUnreadCheck = 0; setUnread(0); return undefined; }
    let live = true;
    const read = () => {
      lastUnreadCheck = Date.now();
      api.get('/notifications', { params: { limit: 1 } })
        .then(({ data }) => { lastUnreadCount = Number(data.unread_count) || 0; if (live) setUnread(lastUnreadCount); }).catch(() => {});
    };
    if (Date.now() - lastUnreadCheck > 30_000) read();
    window.addEventListener('aangan:notifications', read);
    return () => { live = false; window.removeEventListener('aangan:notifications', read); };
  }, [user, pathname]);

  const showBack = !ROOTS.includes(pathname);

  const getApp = () => {
    if (APP_DOWNLOAD_URL) window.open(APP_DOWNLOAD_URL, '_blank', 'noopener');
    else setAppSoon(true);
  };

  return (
    <header className="ag-header" data-testid="site-header">
      <div className="ag-wrap">
        {showBack && (
          <IconButton label={t('common.back')} onClick={goBack} data-testid="header-back">
            <ArrowLeft />
          </IconButton>
        )}

        <Link to="/" className={`ag-brand${settled || showBack ? ' settled' : ''}`} data-testid="brand-link" aria-label={t('brand', 'aangan')}>
          {!showBack && <Wordmark className="word" still />}
          <span
            className="mark"
            aria-hidden="true"
            style={{ background: 'currentColor', WebkitMask: 'url(/ag/mark.svg) center/contain no-repeat', mask: 'url(/ag/mark.svg) center/contain no-repeat' }}
          />
        </Link>

        <div className="ag-topact">
          <button type="button" className="ag-getapp" onClick={getApp} data-testid="header-download-app" aria-label={t('nav.download_app')}>
            <DownloadSimple aria-hidden="true" />
            <span className="max-[360px]:hidden">{t('ui.header.app')}</span>
          </button>
          {user && (
            <Link to="/notifications" className="ag-iconbtn" data-testid="header-notifications" aria-label={t('notes.title')}>
              <Bell />
              {unread > 0 && <span className="ag-badge" data-testid="header-unread">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          )}
          {!user && (
            <Link to={`/login?next=${encodeURIComponent(pathname)}`} className="ag-loginbtn" data-testid="header-login">
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
      <AppComingSoon open={appSoon} onClose={closeAppSoon} />
    </header>
  );
}
