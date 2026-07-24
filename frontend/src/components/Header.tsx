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
import { User, Heart, ArrowLeft, Menu, LogOut } from 'lucide-react';

export default function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);
  const menuRef = React.useRef(null);
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

  React.useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [menuOpen]);

  // A route change must not leave the compact menu hanging open over the page.
  React.useEffect(() => { setMenuOpen(false); }, [pathname]);

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

        {/* Brand - yields its spot to the back button on small screens */}
        <Link
          to="/"
          className={`${showBack ? 'hidden lg:flex' : 'flex'} items-center gap-2 flex-shrink-0`}
          data-testid="brand-link"
          aria-label="1 Darjeeling"
        >
          {/* Background is keyed out, so the mark sits directly on the bar with
              no tile. Scales with --header-h (3.75/4.75/5rem). */}
          <Logo className="w-11 h-11 sm:w-14 sm:h-14 lg:w-16 lg:h-16 flex-shrink-0" />
          {/* The wordmark is the widest thing the rail competes with; below lg
              the tile alone carries the brand so all seven tiles still fit. */}
          <div className="hidden lg:block leading-none">
            <div className={`font-display font-extrabold text-lg ${onVideo ? 'text-white drop-shadow' : 'text-ink'}`}>1 Darjeeling</div>
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

        {/* Right cluster - desktop only. Below lg it collapses into the menu
            below, so the category rail keeps the width it needs. */}
        <div className="hidden lg:flex items-center gap-2.5 flex-shrink-0">
          <LanguageSwitcher onDark={onVideo} />
          {user && (
            <Link to="/saved" data-testid="header-saved" aria-label={t('nav.saved')}
              className={`w-9 h-9 rounded-full grid place-items-center btn-hover ${onVideo ? 'text-white hover:bg-white/20' : 'text-ink hover:bg-mist'}`}>
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
                      <button onClick={() => { setDropdownOpen(false); nav('/provider/dashboard'); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                        {t('nav.business_dashboard')}
                      </button>
                      {localStorage.getItem(`unlocked_traveller_${user.id}`) === 'true' && (
                        <button onClick={() => { setDropdownOpen(false); nav('/dashboard'); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                          {t('nav.personal_bookings')}
                        </button>
                      )}
                    </>
                  ) : (
                    <button onClick={() => { setDropdownOpen(false); goProfile(); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                      {t('nav.dashboard') || 'Dashboard'}
                    </button>
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

        {/* Compact menu - tablet and below. Holds the language switcher and the
            auth actions that the desktop bar shows inline. */}
        {/* ml-auto pins this to the right edge now that the rail no longer
            fills the row below lg. */}
        <div className="relative lg:hidden flex-shrink-0 ml-auto" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            data-testid="header-menu"
            aria-label={t('nav.menu')}
            aria-expanded={menuOpen}
            className={`w-9 h-9 rounded-full grid place-items-center btn-hover ${onVideo ? 'text-white hover:bg-white/20' : 'text-ink hover:bg-mist'}`}
          >
            <Menu size={20} />
          </button>

          {menuOpen && (
            <div
              data-testid="header-menu-panel"
              className="absolute right-0 mt-2 w-56 bg-white border border-[var(--line)] rounded-2xl shadow-xl p-3 z-50"
            >
              <LanguageSwitcher />

              <div className="mt-3 pt-3 border-t border-[var(--line)] space-y-1">
                {user ? (
                  <>
                    <div className="px-1 pb-1">
                      <p className="text-sm font-bold text-ink truncate">{user.name}</p>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-ink-soft mt-0.5 capitalize">{user.role}</p>
                    </div>
                    <button onClick={() => { setMenuOpen(false); goProfile(); }}
                      className="w-full text-left px-2 py-2 rounded-lg text-sm text-ink hover:bg-mist font-semibold transition-colors">
                      {user.role === 'provider' ? t('nav.business_dashboard') : t('nav.dashboard')}
                    </button>
                    <button onClick={() => { setMenuOpen(false); nav('/saved'); }}
                      data-testid="header-menu-saved"
                      className="w-full text-left px-2 py-2 rounded-lg text-sm text-ink hover:bg-mist font-semibold transition-colors flex items-center gap-2">
                      <Heart size={14} /> {t('nav.saved')}
                    </button>
                    <button onClick={() => { setMenuOpen(false); nav('/login'); logout(); }}
                      className="w-full text-left px-2 py-2 rounded-lg text-sm text-flag hover:bg-mist font-bold transition-colors flex items-center gap-2">
                      <LogOut size={14} /> {t('nav.logout')}
                    </button>
                  </>
                ) : (
                  <Link to="/login" data-testid="header-menu-login"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full bg-flag text-white font-semibold text-sm btn-hover">
                    {t('nav.login')}
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
