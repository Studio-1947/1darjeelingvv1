import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import StoryCircle from '@/components/StoryCircle';
import Logo from '@/components/Logo';
import useGoBack from '@/hooks/useGoBack';
import useHeroOverlay from '@/hooks/useHeroOverlay';
import { CATEGORIES } from '@/constants/categories';
import { User, Heart, ArrowLeft } from 'lucide-react';

export default function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const goBack = useGoBack();
  // The landing page is the root of the mobile tab bar - nothing to go back to.
  const showBack = pathname !== '/';
  // Sign-in and the onboarding form are single-task pages; a browse rail there
  // only invites the visitor to abandon what they came to do.
  const showCategories = !['/login', '/provider/onboard'].includes(pathname);
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
    if (user.role === 'provider') nav('/provider/dashboard');
    else nav('/dashboard');
  };

  return (
    <header
      className={`z-40 transition-colors duration-300 ${
        isLanding ? 'fixed top-0 inset-x-0' : 'sticky top-0'
      } ${onVideo ? 'bg-transparent border-b border-transparent' : 'bg-white border-b border-[var(--line)]'}`}
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
          to="/"
          className="flex items-center gap-1.5 sm:gap-2 min-w-0"
          data-testid="brand-link"
          aria-label={t('brand')}
        >
          {/* Background is keyed out, so the mark sits directly on the bar with
              no tile. Scales with --header-h (3.75/4.75/5rem). */}
          <Logo className="w-8 h-8 sm:w-14 sm:h-14 lg:w-16 lg:h-16 flex-shrink-0" />
          <div className="leading-none min-w-0">
            <div className={`font-display font-extrabold text-sm sm:text-lg whitespace-nowrap ${onVideo ? 'text-white drop-shadow' : 'text-ink'}`}>
              {t('brand')}
            </div>
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
            <div
              className="flex items-center gap-1.5 overflow-x-auto no-scrollbar
                         rounded-full bg-white border border-[var(--line)] shadow-sm px-1.5 py-1
                         sm:justify-center sm:gap-0.5 sm:rounded-none sm:bg-transparent sm:border-0 sm:shadow-none sm:px-0 sm:py-1
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
          </nav>
        ) : (
          // Keeps the right-hand cluster pinned to the edge where the rail sat.
          <div className="flex-1" />
        )}

        {/* Right cluster - shown at every width. The hamburger it used to hide
            behind on phones held nothing the bottom tab bar doesn't already
            reach, so the two controls a visitor actually looks for up here -
            language and sign-in - now sit in the bar itself. */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0 ml-auto">
          <LanguageSwitcher onDark={onVideo} />
          {/* Saved has its own route from the profile menu and the tab bar, so
              below lg this shortcut only competes for the width login needs. */}
          {user && (
            <Link to="/saved" data-testid="header-saved" aria-label={t('nav.saved')}
              className={`hidden lg:grid w-9 h-9 rounded-full place-items-center btn-hover ${onVideo ? 'text-white hover:bg-white/20' : 'text-ink hover:bg-mist'}`}>
              <Heart size={18} />
            </Link>
          )}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setDropdownOpen(!dropdownOpen)} data-testid="header-profile"
                className="w-9 h-9 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-bold btn-hover focus:outline-none overflow-hidden">
                {user.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : user.name ? (
                  user.name.trim().charAt(0).toUpperCase()
                ) : (
                  <User size={16} />
                )}
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-[var(--line)] rounded-2xl shadow-xl py-2 z-50" data-testid="header-profile-dropdown">
                  <div className="px-4 py-2 border-b border-[var(--line)]">
                    <p className="text-sm font-bold text-ink truncate">{user.name}</p>
                    <p className="text-[10px] uppercase tracking-wider font-bold text-ink-soft mt-0.5 capitalize">{user.role}</p>
                  </div>
                  
                  {user.role === 'provider' ? (
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
                    </>
                  )}
                  
                  <button onClick={() => { setDropdownOpen(false); nav('/saved'); }}
                    data-testid="header-dropdown-saved"
                    className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors flex items-center gap-2">
                    <Heart size={14} /> {t('nav.saved')}
                  </button>

                  <button onClick={() => { setDropdownOpen(false); nav('/login'); logout(); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-flag hover:bg-mist font-bold border-t border-[var(--line)] transition-colors">
                    {t('nav.logout') || 'Log out'}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" data-testid="header-login"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-flag text-white font-semibold text-xs md:text-sm btn-hover">
              {t('nav.login')}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
