import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Search, User, Heart } from 'lucide-react';

export default function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [q, setQ] = React.useState('');
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const dropdownRef = React.useRef(null);
  const nav = useNavigate();
  const { pathname } = useLocation();
  const goBack = useGoBack();
  // The landing page is the root of the mobile tab bar — nothing to go back to.
  const showBack = pathname !== '/';

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

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) { nav(`/search?q=${encodeURIComponent(q.trim())}`); setQ(''); }
  };

  const goProfile = () => {
    if (!user) return nav('/login');
    if (user.role === 'provider') nav('/provider/dashboard');
    else nav('/dashboard');
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--line)]" data-testid="site-header">
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-14 md:h-16 flex items-center gap-3 md:gap-5">
        {/* Back — mobile/tablet only; desktop keeps the brand plus in-page controls */}
        {showBack && (
          <button
            onClick={goBack}
            data-testid="header-back"
            aria-label={t('common.back')}
            className="lg:hidden w-9 h-9 -ml-1 rounded-full grid place-items-center text-ink hover:bg-mist flex-shrink-0 btn-hover"
          >
            <ArrowLeft size={20} />
          </button>
        )}

        {/* Brand — yields its spot to the back button on small screens */}
        <Link
          to="/"
          className={`${showBack ? 'hidden lg:flex' : 'flex'} items-center gap-2 flex-shrink-0`}
          data-testid="brand-link"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-lg leading-none">১</div>
          <div className="hidden sm:block leading-none">
            <div className="font-display font-extrabold text-lg text-ink">1 Darjeeling</div>
          </div>
        </Link>

        {/* Center search */}
        <form onSubmit={submitSearch} className="flex-1 min-w-0 max-w-md flex items-center gap-2 bg-mist rounded-full px-3 md:px-4 py-2">
          <Search size={16} className="text-ink-soft flex-shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            data-testid="header-search"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm text-ink placeholder:text-ink-soft"
          />
        </form>

        {/* Right cluster: minimal */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <LanguageSwitcher />
          {user && (
            <Link to="/saved" data-testid="header-saved" aria-label="Saved"
              className="w-9 h-9 rounded-full grid place-items-center text-ink hover:bg-mist btn-hover">
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
                        Business Dashboard
                      </button>
                      {localStorage.getItem(`unlocked_traveller_${user.id}`) === 'true' && (
                        <button onClick={() => { setDropdownOpen(false); nav('/dashboard'); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-ink hover:bg-mist font-semibold transition-colors">
                          Personal Bookings
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
                    <Heart size={14} /> Saved
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
