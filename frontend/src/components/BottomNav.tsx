import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Ticket, Store, LayoutGrid, User, ChevronUp } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import CategorySheet from '@/components/CategorySheet';

/**
 * Mobile bottom tab bar - the app's primary navigation below `lg`.
 *
 * Destinations: Home, My Trips / My Listings, Type, Account.
 * Service providers get "My Listings" (/my-listings) while tourists get "My Trips" (/my-trips).
 * Account routes to the user dashboard (/dashboard or /provider/dashboard).
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [typeOpen, setTypeOpen] = useState(false);

  // Close the Type sheet whenever route changes
  useEffect(() => {
    setTypeOpen(false);
  }, [pathname]);

  const isProvider = user?.role === 'provider';

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

  // An open sheet is the current context, so it owns the highlight outright -
  // otherwise Home and Type both read as selected while the sheet covers Home.
  const activeFor = (routes: string[]) => !typeOpen && routes.includes(pathname);

  const tabCls = (isActive: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 py-2 min-w-0 text-[10px] font-semibold ${
      isActive ? 'text-flag' : 'text-ink-soft'
    }`;

  const homeActive = activeFor(homeMatch);
  const tripsActive = activeFor(tripsMatch);
  const accountActive = activeFor(accountMatch);

  return (
    <>
      <CategorySheet open={typeOpen} onClose={() => setTypeOpen(false)} />

      <nav
        data-testid="bottom-nav"
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-[var(--line)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4">
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
            <Home size={20} strokeWidth={homeActive ? 2.6 : 2} className="flex-shrink-0" />
            <span className="truncate max-w-full px-0.5">{t('nav.home')}</span>
          </Link>

          <Link
            to={tripsOrListingsTarget}
            data-testid="bottom-nav-trips"
            onClick={handleNavClick}
            aria-current={tripsActive ? 'page' : undefined}
            className={tabCls(tripsActive)}
          >
            {isProvider ? (
              <Store size={20} strokeWidth={tripsActive ? 2.6 : 2} className="flex-shrink-0" />
            ) : (
              <Ticket size={20} strokeWidth={tripsActive ? 2.6 : 2} className="flex-shrink-0" />
            )}
            <span className="truncate max-w-full px-0.5">
              {isProvider ? (t('nav.my_listings') || 'My Listings') : (t('nav.trips') || 'My Trips')}
            </span>
          </Link>

          {/* Type is a toggle, not a route - it opens the category sheet. */}
          <button
            type="button"
            onClick={() => setTypeOpen((v) => !v)}
            data-testid="bottom-nav-type"
            aria-expanded={typeOpen}
            aria-haspopup="dialog"
            className={tabCls(typeOpen)}
          >
            <span className="relative flex-shrink-0">
              <LayoutGrid size={20} strokeWidth={typeOpen ? 2.6 : 2} />
              <ChevronUp
                size={11}
                strokeWidth={2.6}
                className={`absolute -top-2 left-1/2 -translate-x-1/2 transition-transform duration-200 ${
                  typeOpen ? 'rotate-180' : ''
                }`}
              />
            </span>
            <span className="truncate max-w-full px-0.5">{t('nav.type')}</span>
          </button>

          <Link
            to={accountTarget}
            data-testid="bottom-nav-account"
            onClick={handleNavClick}
            aria-current={accountActive ? 'page' : undefined}
            className={tabCls(accountActive)}
          >
            <User size={20} strokeWidth={accountActive ? 2.6 : 2} className="flex-shrink-0" />
            <span className="truncate max-w-full px-0.5">{t('nav.account')}</span>
          </Link>
        </div>
      </nav>
    </>
  );
}
