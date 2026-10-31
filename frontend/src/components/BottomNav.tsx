import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { House as Home, Ticket, Storefront as Store, SquaresFour as LayoutGrid, User, CaretUp as ChevronUp, ImagesSquare } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import CategorySheet from '@/components/CategorySheet';

/**
 * Mobile bottom tab bar - the app's primary navigation below `lg`.
 *
 * Destinations: Home, My Trips / My Listings, Feed, Categories, Account. Feed is the host feed,
 * a tab of its own like an Instagram feed, open to everyone signed in or not.
 * Hosts on the business side get "My Listings" (/my-listings) while tourists get "My Trips" (/my-trips).
 * Account routes to the user dashboard (/dashboard or /provider/dashboard).
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { user, isHostMode } = useAuth();
  const { pathname } = useLocation();
  const [typeOpen, setTypeOpen] = useState(false);

  // Close the Type sheet whenever route changes
  useEffect(() => {
    setTypeOpen(false);
  }, [pathname]);

  // Follows the Traveller / Business mode, not the account: a host on the traveller side gets
  // the traveller tabs, as in the app.
  const isProvider = isHostMode;

  const tripsOrListingsTarget = isProvider
    ? '/my-listings'
    : (user ? '/my-trips' : '/login?next=/my-trips');

  const accountTarget = user
    ? (isProvider ? '/provider/dashboard' : '/dashboard')
    : '/login?next=/dashboard';

  const handleNavClick = () => {
    setTypeOpen(false);
  };

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
  const homeMatch = ['/'];
  const tripsMatch = isProvider ? ['/my-listings'] : ['/my-trips'];
  const accountMatch = ['/dashboard', '/provider/dashboard'];
  const feedMatch = ['/feed'];

  // An open sheet is the current context, so it owns the highlight outright -
  // otherwise Home and Type both read as selected while the sheet covers Home.
  const activeFor = (routes: string[]) => !typeOpen && routes.includes(pathname);

  // Each tab is its own rounded pill inside the bar; the active one is tinted with the button teal,
  // as the app's bar (src/components/BottomNav.tsx) does.
  const tabCls = (isActive: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 py-1.5 mx-px min-[380px]:mx-0.5 min-w-0 rounded-full text-[10px] font-bold transition-all duration-150 active:scale-95 ${
      isActive ? 'bg-[rgba(31,102,86,0.12)] text-[#1F6656] font-extrabold' : 'text-ink-soft hover:text-ink'
    }`;

  const homeActive = activeFor(homeMatch);
  const tripsActive = activeFor(tripsMatch);
  const accountActive = activeFor(accountMatch);
  const feedActive = activeFor(feedMatch);

  return (
    <>
      <CategorySheet open={typeOpen} onClose={() => setTypeOpen(false)} />

      {/* A floating frosted pill, as Instagram's iOS bar: it sits above the home indicator with
          the page showing round it. --bottom-nav-h in index.css reserves its space. */}
      <nav
        data-testid="bottom-nav"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 px-2.5 min-[380px]:px-3.5 pointer-events-none"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 10px)' }}
      >
        <div className="pointer-events-auto grid grid-cols-5 items-stretch h-16 px-1 py-1.5 rounded-full bg-white/80 backdrop-blur-xl border border-white/70 shadow-[0_8px_24px_rgba(20,32,26,0.16)]">
          {/* Plain Link rather than NavLink throughout: the active state is
              computed above, so NavLink's own pathname matching would only
              fight it. aria-current carries the state to assistive tech. */}
          <Link
            to="/"
            data-testid="bottom-nav-home"
            onClick={handleNavClick}
            aria-current={homeActive ? 'page' : undefined}
            className={tabCls(homeActive)}
          >
            <Home size={20} weight={homeActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            <span className="truncate max-w-full">{t('nav.home')}</span>
          </Link>

          <Link
            to={tripsOrListingsTarget}
            data-testid="bottom-nav-trips"
            onClick={handleNavClick}
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
            onClick={handleNavClick}
            aria-current={feedActive ? 'page' : undefined}
            className={tabCls(feedActive)}
          >
            <ImagesSquare size={20} weight={feedActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            <span className="truncate max-w-full">{t('nav.feed_tab')}</span>
          </Link>

          {/* A toggle, not a route - it opens the category sheet. Labelled
              "Categories" to match the sheet it opens, which is headed
              "DISCOVER / Categories"; the tab used to say "Type" and nothing on
              the other side of the tap repeated the word (QA 4.1). */}
          <button
            type="button"
            onClick={() => setTypeOpen((v) => !v)}
            data-testid="bottom-nav-type"
            aria-expanded={typeOpen}
            aria-haspopup="dialog"
            className={tabCls(typeOpen)}
          >
            <span className="relative flex-shrink-0">
              <LayoutGrid size={20} weight={typeOpen ? 'bold' : 'regular'} />
              <ChevronUp
                size={11}
                weight="bold"
                className={`absolute -top-2 left-1/2 -translate-x-1/2 transition-transform duration-200 ${
                  typeOpen ? 'rotate-180' : ''
                }`}
              />
            </span>
            <span className="truncate max-w-full">{t('nav.categories')}</span>
          </button>

          <Link
            to={accountTarget}
            data-testid="bottom-nav-account"
            onClick={handleNavClick}
            aria-current={accountActive ? 'page' : undefined}
            className={tabCls(accountActive)}
          >
            <User size={20} weight={accountActive ? 'bold' : 'regular'} className="flex-shrink-0" />
            <span className="truncate max-w-full">{t('nav.account')}</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
