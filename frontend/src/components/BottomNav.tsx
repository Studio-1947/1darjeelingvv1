import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { House as Home, Ticket, Storefront as Store, Compass, User, ImagesSquare } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';

/**
 * Mobile bottom tab bar - the app's primary navigation below `lg`.
 *
 * Destinations: Home, My Trips / My Listings, Feed, Explore, Account. Feed is the host feed,
 * a tab of its own like an Instagram feed, open to everyone signed in or not.
 * Hosts on the business side get "My Listings" (/my-listings) while tourists get "My Trips" (/my-trips).
 * Account routes to the user dashboard (/dashboard or /provider/dashboard).
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { user, isHostMode } = useAuth();
  const { pathname } = useLocation();
  const [avatarError, setAvatarError] = useState(false);
  useEffect(() => { setAvatarError(false); }, [user?.avatar]);

  // Follows the Traveller / Business mode, not the account: a host on the traveller side gets
  // the traveller tabs, as in the app.
  const isProvider = isHostMode;

  const tripsOrListingsTarget = isProvider
    ? '/my-listings'
    : (user ? '/my-trips' : '/login?next=/my-trips');

  // On the business side Home is the host's dashboard and Account is their business profile.
  const homeTarget = isProvider ? '/provider/dashboard' : '/';
  const accountTarget = user
    ? (isProvider ? '/provider/profile' : '/dashboard')
    : '/login?next=/dashboard';


  /**
   * Which routes each tab represents - deliberately separate from where the tab
   * *sends* you.
   *
   * NavLink derives "active" from the link's own pathname, and while logged out
   * both Trips and Account point at /login?next=... . On /login that matched
   * twice, so two tabs lit up at once and neither was where the visitor was.
   * Matching on the destination a tab stands for fixes that: /login belongs to
   * no tab, so none highlight - which is honest, since sign-in isn't one of the
   * four places this bar navigates to.
   */
  const homeMatch = isProvider ? ['/provider/dashboard'] : ['/'];
  const tripsMatch = isProvider ? ['/my-listings'] : ['/my-trips'];
  const accountMatch = isProvider ? ['/provider/profile'] : ['/dashboard'];
  const feedMatch = ['/feed'];
  const exploreMatch = ['/explore'];

  const activeFor = (routes: string[]) => routes.includes(pathname);

  // Each tab is its own rounded pill inside the bar; the active one is tinted with the button teal,
  // as the app's bar (src/components/BottomNav.tsx) does.
  const tabCls = (isActive: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 py-1.5 mx-px min-[380px]:mx-0.5 min-w-0 rounded-full text-[10px] font-bold transition-all duration-150 active:scale-95 ${
      isActive ? 'bg-[rgba(31,102,86,0.14)] text-[#1F6656] font-extrabold' : 'text-ink/75 hover:text-ink'
    }`;

  const homeActive = activeFor(homeMatch);
  const tripsActive = activeFor(tripsMatch);
  const accountActive = activeFor(accountMatch);
  const feedActive = activeFor(feedMatch);
  const exploreActive = activeFor(exploreMatch);

  return (
    <>
      {/* A floating frosted pill, as Instagram's iOS bar: it sits above the home indicator with
          the page showing round it. --bottom-nav-h in index.css reserves its space. Near-opaque
          with a visible border and a deeper shadow, so it still stands out on white pages. */}
      <nav
        data-testid="bottom-nav"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 px-2.5 min-[380px]:px-3.5 pointer-events-none"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
      >
        <div className={`pointer-events-auto grid ${isProvider ? 'grid-cols-4' : 'grid-cols-5'} items-stretch h-16 px-1 py-1.5 rounded-full bg-white/95 backdrop-blur-xl border border-[rgba(20,32,26,0.12)] shadow-[0_10px_30px_rgba(20,32,26,0.28)]`}>
          {/* Plain Link rather than NavLink throughout: the active state is
              computed above, so NavLink's own pathname matching would only
              fight it. aria-current carries the state to assistive tech. */}
          <Link
            to={homeTarget}
            data-testid="bottom-nav-home"
            aria-current={homeActive ? 'page' : undefined}
            className={tabCls(homeActive)}
          >
            <Home size={20} weight={homeActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            <span className="truncate max-w-full">{isProvider ? t('nav.dashboard') : t('nav.home')}</span>
          </Link>

          <Link
            to={tripsOrListingsTarget}
            data-testid="bottom-nav-trips"
            aria-current={tripsActive ? 'page' : undefined}
            className={tabCls(tripsActive)}
          >
            {isProvider ? (
              <Store size={20} weight={tripsActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            ) : (
              <Ticket size={20} weight={tripsActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            )}
            <span className="truncate max-w-full">
              {isProvider ? (t('nav.my_listings') || 'My Listings') : (t('nav.trips') || 'My Trips')}
            </span>
          </Link>

          <Link
            to="/feed"
            data-testid="bottom-nav-feed"
            aria-current={feedActive ? 'page' : undefined}
            className={tabCls(feedActive)}
          >
            <ImagesSquare size={20} weight={feedActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            <span className="truncate max-w-full">{t('nav.feed_tab')}</span>
          </Link>

          {/* Explore is a page of photo tiles, as in the app. Browsing only, so the business side
              has no such tab. */}
          {!isProvider && (
          <Link
            to="/explore"
            data-testid="bottom-nav-explore"
            aria-current={exploreActive ? 'page' : undefined}
            className={tabCls(exploreActive)}
          >
            <Compass size={20} weight={exploreActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            <span className="truncate max-w-full">{t('nav.explore')}</span>
          </Link>
          )}

          <Link
            to={accountTarget}
            data-testid="bottom-nav-account"
            aria-current={accountActive ? 'page' : undefined}
            className={tabCls(accountActive)}
          >
            {/* The profile photo lives here on phones, not in the top bar. */}
            {user?.avatar && !avatarError ? (
              <img src={user.avatar} alt="" onError={() => setAvatarError(true)} data-testid="bottom-nav-avatar"
                className={`w-[22px] h-[22px] rounded-full object-cover flex-shrink-0 ${accountActive ? 'ring-2 ring-[#1F6656]' : 'ring-1 ring-black/10'}`} />
            ) : user?.name ? (
              <span data-testid="bottom-nav-initial"
                className={`w-[22px] h-[22px] rounded-full grid place-items-center text-[11px] font-extrabold flex-shrink-0 ${accountActive ? 'bg-[#1F6656] text-white' : 'bg-mist text-ink'}`}>
                {user.name.trim().charAt(0).toUpperCase()}
              </span>
            ) : (
              <User size={20} weight={accountActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            )}
            <span className="truncate max-w-full">{isProvider ? t('nav.profile') : t('nav.account')}</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
