import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import StoryCircle from '@/components/StoryCircle';
import Wordmark from '@/components/Wordmark';
import useGoBack from '@/hooks/useGoBack';
import useHeroOverlay from '@/hooks/useHeroOverlay';
import { CATEGORIES } from '@/constants/categories';
import { User, Heart, ArrowLeft, ImagesSquare, DownloadSimple, CaretLeft, CaretRight, Bell } from '@phosphor-icons/react';
import api from '@/lib/api';
import { APP_DOWNLOAD_URL } from '@/constants/app';
import { toast } from 'sonner';

/** When the bell last asked for the unread count (shared across page changes). */
let lastUnreadCheck = 0;
let lastUnreadCount = 0;

export default function Header() {
  const { t } = useTranslation();
  const { user, logout, isHostMode, setMode } = useAuth();
  const isHost = user?.role === 'provider';
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState(false);
  const dropdownRef = React.useRef(null);
  // The category row can be wider than its space (8 tiles beside the logo and actions). It then
  // scrolls, and arrows show which way there is more, so no category is out of reach.
  const railRef = React.useRef<HTMLDivElement>(null);
  const [railMore, setRailMore] = React.useState({ left: false, right: false });
  const checkRail = React.useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setRailMore({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 });
  }, []);
  React.useEffect(() => {
    const el = railRef.current;
    if (!el) return undefined;
    checkRail();
    el.addEventListener('scroll', checkRail, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(checkRail) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', checkRail); ro?.disconnect(); };
  }, [checkRail]);
  // Unread notifications, for the dot on the bell. Re-read on every page change and when the
  // notifications page marks something read.
  const [unread, setUnread] = React.useState(lastUnreadCount);
  const pagePath = useLocation().pathname;
  React.useEffect(() => {
    if (!user) { lastUnreadCount = 0; lastUnreadCheck = 0; setUnread(0); return undefined; }
    let live = true;
    const read = () => {
      lastUnreadCheck = Date.now();
      api.get('/notifications', { params: { limit: 1 } })
        .then(({ data }) => { lastUnreadCount = Number(data.unread_count) || 0; if (live) setUnread(lastUnreadCount); }).catch(() => {});
    };
    // At most every 30 seconds while moving between pages; at once after reading notifications.
    if (Date.now() - lastUnreadCheck > 30_000) read();
    window.addEventListener('aangan:notifications', read);
    return () => { live = false; window.removeEventListener('aangan:notifications', read); };
  }, [user, pagePath]);
  const nudgeRail = (dir: 1 | -1) => railRef.current?.scrollBy({ left: dir * 240, behavior: 'smooth' });
  const nav = useNavigate();
  const { pathname } = useLocation();
  const goBack = useGoBack();
  // The landing page is the root of the mobile tab bar - nothing to go back to.
  const showBack = pathname !== '/';
  // Sign-in and the onboarding form are single-task pages; a browse rail there
  // only invites the visitor to abandon what they came to do.
  // The category rail is for browsing; the business side does not browse.
  const showCategories = !['/login', '/provider/onboard'].includes(pathname) && !isHostMode;
  // The landing hero plays a full-bleed video; the bar rides on top of it and
  // stays out of the flow so the footage runs right up to the top of the page.
  const isLanding = pathname === '/';
  const onVideo = useHeroOverlay(isLanding);

  React.useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [dropdownOpen]);

  // A route change must not leave the profile menu hanging open over the page.
  React.useEffect(() => { setDropdownOpen(false); }, [pathname]);

  const goProfile = () => {
    if (!user) return nav('/login');
    if (isHostMode) nav('/provider/dashboard');
    else nav('/dashboard');
  };

  // A host moves between their trips and their business here, like the app's Profile switch.
  const switchTo = (next: 'tourist' | 'provider') => {
    setDropdownOpen(false);
    setMode(next);
    nav(next === 'provider' ? '/provider/dashboard' : '/dashboard');
  };

  return (
    <header
      className={`z-40 transition-all duration-300 ${
        isLanding ? 'fixed top-0 inset-x-0' : 'sticky top-0'
      } ${
        onVideo
          ? 'bg-transparent border-b border-transparent'
          : 'bg-white/90 backdrop-blur-md border-b border-[var(--line)] shadow-sm'
      }`}
      data-testid="site-header"
    >
      <div className="mx-auto max-w-6xl px-2 sm:px-4 md:px-6 h-[var(--header-h)] flex items-center gap-1.5 sm:gap-3 lg:gap-5 xl:gap-8">
        {/* Back - mobile/tablet only; desktop keeps the brand plus in-page controls */}
        {showBack && (
          <button
            onClick={goBack}
            data-testid="header-back"
            aria-label={t('common.back')}
            className={`lg:hidden w-9 h-9 -ml-1 rounded-full grid place-items-center flex-shrink-0 btn-hover ${onVideo ? 'text-white hover:bg-white/20' : 'text-ink hover:bg-mist'}`}
          >
            <ArrowLeft size={20} />
          </button>
        )}

        {/* Brand - the mark and the name together at every width.
            The wordmark reads t('brand') rather than a hardcoded "1 Darjeeling":
            the login card and the footer already render the translated form, so
            in Hindi the page showed the brand in Devanagari while the bar above
            it stayed in Latin script (QA 3.6).
            It also stops truncating. At 390px it shared the row with a back
            button, the language menu and sign-in, and rendered as "1 Darj…"
            (QA 4.6) - a clipped brand name is worse than a smaller one, so below
            sm it drops a size and holds its whole width instead. */}
        <Link
          to={isHostMode ? '/provider/dashboard' : '/'}
          className="flex items-center min-w-0 h-11"
          data-testid="brand-link"
          aria-label={t('brand')}
        >
          <div className="leading-none min-w-0">
            <Wordmark className={`h-5 sm:h-8 lg:h-9 w-auto ${onVideo ? 'text-white drop-shadow' : 'text-ink'}`} />
          </div>
        </Link>

        {/* Category rail - desktop only. Below lg the categories live in the
            bottom tab bar instead, so the header there is just brand + menu. */}
        {showCategories ? (
          <nav
            aria-label={t('nav.categories')}
            data-testid="header-categories"
            className="hidden lg:block flex-1 min-w-0"
          >
            {/* This element is the scroll container, so on phones the white
                pill stays pinned to the viewport while the icons slide inside
                it. From sm up the tiles all fit, the pill dissolves and each
                item carries its own plate. */}
            <div className="relative">
            {/* Centred only when the tiles fit: auto margins on the first and last tile centre the
                row but collapse when it overflows, so the first tile is never pushed out of reach
                (plain justify-center cut "Tourism spots" off on the left at every desktop width). */}
            <div
              ref={railRef}
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar
                         rounded-full bg-white border border-[var(--line)] shadow-sm px-1.5 py-1
                         sm:gap-0.5 sm:rounded-none sm:bg-transparent sm:border-0 sm:shadow-none sm:px-0 sm:py-1
                         sm:[&>*:first-child]:ml-auto sm:[&>*:last-child]:mr-auto
                         lg:gap-2"
            >
              {CATEGORIES.map(({ key, to, Icon }) => (
                <StoryCircle
                  key={key}
                  to={to}
                  label={t(`categories.${key}`)}
                  image={null}
                  icon={Icon}
                  active={pathname === to}
                  onDark={onVideo}
                />
              ))}
            </div>
            {railMore.left && (
              <button type="button" onClick={() => nudgeRail(-1)} aria-label={t('nav.categories_prev')} data-testid="header-categories-prev"
                className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full grid place-items-center bg-white/95 border border-[var(--line)] shadow text-ink">
                <CaretLeft size={16} weight="bold" />
              </button>
            )}
            {railMore.right && (
              <button type="button" onClick={() => nudgeRail(1)} aria-label={t('nav.categories_next')} data-testid="header-categories-next"
                className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 rounded-full grid place-items-center bg-white/95 border border-[var(--line)] shadow text-ink">
                <CaretRight size={16} weight="bold" />
              </button>
            )}
            </div>
          </nav>
        ) : (
          // Keeps the right-hand cluster pinned to the edge where the rail sat.
          <div className="flex-1" />
        )}

        {/* Right cluster - shown at every width. The hamburger it used to hide
            behind on phones held nothing the bottom tab bar doesn't already
            reach, so the control a visitor actually looks for up here -
            sign-in - now sits in the bar itself. */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0 ml-auto">
          {/* The host feed is public, so it stays visible signed in or not. Below lg it is a tab in the
              bottom bar, so the header only carries it on desktop, where there is no bottom bar. */}
          <Link
            to="/feed"
            data-testid="header-feed"
            aria-label={t('nav.feed')}
            className="hidden lg:inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-pine px-2.5 text-white shadow-sm btn-hover sm:px-3"
          >
            <ImagesSquare size={18} />
            <span className="hidden xl:inline whitespace-nowrap">{t('nav.feed')}</span>
          </Link>
          {/* Saved has its own route from the profile menu and the tab bar, so
              below lg this shortcut only competes for the width login needs. */}
          {user && (
            <Link to="/notifications" data-testid="header-notifications"
              aria-label={unread ? t('notes.title_unread', { count: unread }) : t('notes.title')}
              className={`relative grid w-9 h-9 rounded-full place-items-center btn-hover ${onVideo ? 'text-white hover:bg-white/20' : 'text-ink hover:bg-mist'}`}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-flag" />}
            </Link>
          )}
          {user && (
            <Link to="/saved" data-testid="header-saved" aria-label={t('nav.saved')}
              className={`hidden lg:grid w-9 h-9 rounded-full place-items-center btn-hover ${onVideo ? 'text-white hover:bg-white/20' : 'text-ink hover:bg-mist'}`}>
              <Heart size={18} />
            </Link>
          )}
          {/* Get the app: beside Log in at every width. Until the store link exists (the app is not
              in Play or the App Store yet) a tap says it is coming soon instead of doing nothing. */}
          <a
            href={APP_DOWNLOAD_URL || '#get-the-app'}
            target={APP_DOWNLOAD_URL ? '_blank' : undefined}
            rel="noreferrer"
            onClick={APP_DOWNLOAD_URL ? undefined : (e) => { e.preventDefault(); toast(t('nav.app_coming_soon')); }}
            data-testid="header-download-app"
            aria-label={t('nav.download_app')}
            className={`inline-flex items-center justify-center gap-1.5 min-w-11 lg:min-w-10 h-9 sm:h-10 px-2.5 min-[380px]:px-3 sm:px-4 rounded-full border font-bold text-xs sm:text-sm btn-hover whitespace-nowrap ${
              onVideo ? 'border-white/60 text-white bg-white/10 backdrop-blur' : 'border-[var(--line)] text-ink bg-white'
            }`}
          >
            <DownloadSimple size={16} weight="bold" />
            {/* On the narrowest phones (or with large system text) the label would push the row past
                the screen edge; the icon alone stays, and the label is still read out. */}
            <span className="sr-only min-[380px]:not-sr-only">{t('nav.download_app')}</span>
          </a>
          {user ? (
            // On phones the profile photo lives in the bottom bar's Account tab instead.
            <div className="relative hidden lg:block" ref={dropdownRef}>
              <button onClick={() => setDropdownOpen(!dropdownOpen)} data-testid="header-profile"
                className="w-9 h-9 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-bold btn-hover focus:outline-none overflow-hidden">
                {user.avatar && !avatarError ? (
                  <img src={user.avatar} alt={user.name} onError={() => setAvatarError(true)} className="w-full h-full object-cover" />
                ) : user.name ? (
                  user.name.trim().charAt(0).toUpperCase()
                ) : (
                  <User size={16} />
                )}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white/95 backdrop-blur-xl border border-[var(--line)] rounded-2xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200" data-testid="header-profile-dropdown">
                  <div className="px-4 py-2 border-b border-[var(--line)]">
                    <p className="text-sm font-bold text-ink truncate">{user.name}</p>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-ink-soft mt-0.5" data-testid="header-mode">
                      {isHostMode ? t('nav.mode_business') : t('nav.mode_traveller')}
                    </p>
                  </div>
                  
                  {isHostMode ? (
                    <>
                      <button onClick={() => { setDropdownOpen(false); nav('/my-listings'); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                        {t('nav.my_listings') || 'My Listings'}
                      </button>
                      <button onClick={() => { setDropdownOpen(false); nav('/provider/dashboard'); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                        {t('nav.business_dashboard')}
                      </button>
                      <button onClick={() => { setDropdownOpen(false); nav('/my-trips'); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                        {t('nav.my_trips') || 'My Trips'}
                      </button>
                      <button onClick={() => switchTo('tourist')} data-testid="header-switch-traveller"
                        className="w-full text-left px-4 py-2.5 text-sm text-pine hover:bg-mist font-bold transition-colors">
                        {t('nav.switch_traveller')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setDropdownOpen(false); nav('/my-trips'); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                        {t('nav.my_trips') || 'My Trips'}
                      </button>
                      <button onClick={() => { setDropdownOpen(false); goProfile(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                        {t('nav.dashboard') || 'Dashboard'}
                      </button>
                      {isHost ? (
                        <button onClick={() => switchTo('provider')} data-testid="header-switch-business"
                          className="w-full text-left px-4 py-2.5 text-sm text-pine hover:bg-mist font-bold transition-colors">
                          {t('nav.switch_business')}
                        </button>
                      ) : (
                        <button onClick={() => { setDropdownOpen(false); nav('/provider/onboard'); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-pine hover:bg-mist font-bold transition-colors">
                          {t('nav.host_with_us', 'List your Stay / Taxi')}
                        </button>
                      )}
                    </>
                  )}
                  
                  <button onClick={() => { setDropdownOpen(false); nav('/profile/edit'); }}
                    data-testid="header-dropdown-edit-profile"
                    className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                    {t('nav.edit_profile')}
                  </button>
                  <button onClick={() => { setDropdownOpen(false); nav('/saved'); }}
                    data-testid="header-dropdown-saved"
                    className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors flex items-center gap-2">
                    <Heart size={14} /> {t('nav.saved')}
                  </button>

                  <button onClick={() => { setDropdownOpen(false); logout(); nav('/'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-flag hover:bg-mist font-bold border-t border-[var(--line)] transition-colors">
                    {t('nav.logout') || 'Log out'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" data-testid="header-login"
              className="inline-flex items-center gap-1.5 h-9 sm:h-10 px-4 sm:px-6 rounded-full bg-pine text-white font-bold text-sm md:text-base btn-hover">
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
