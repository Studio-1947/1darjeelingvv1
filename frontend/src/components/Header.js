import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Menu, X, LogIn, LogOut, LayoutDashboard, Store, Search } from 'lucide-react';

export default function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const nav = useNavigate();

  const links = [
    { to: '/', label: t('nav.discover') },
    { to: '/spots', label: t('nav.spots') },
    { to: '/homestays', label: t('nav.homestays') },
    { to: '/drivers', label: t('nav.drivers') },
    { to: '/shops', label: t('nav.shops') },
    { to: '/cafes', label: t('nav.cafes') },
    { to: '/events', label: t('nav.events') },
    { to: '/biodiversity', label: t('nav.biodiversity') },
    { to: '/responsible', label: t('nav.responsible') },
  ];

  const submitSearch = (e) => {
    e.preventDefault();
    if (q.trim()) { nav(`/search?q=${encodeURIComponent(q.trim())}`); setQ(''); }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--line)]" data-testid="site-header">
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-14 md:h-16 flex items-center gap-3 md:gap-6">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0" data-testid="brand-link">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-base md:text-lg">১</div>
          <div className="hidden sm:block leading-none">
            <div className="font-display font-extrabold text-base md:text-lg text-ink">{t('brand')}</div>
          </div>
        </Link>

        {/* Center search (desktop) */}
        <form onSubmit={submitSearch} className="hidden md:flex flex-1 max-w-sm items-center gap-2 bg-mist rounded-full px-4 py-2">
          <Search size={16} className="text-ink-soft" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('search.placeholder')}
            data-testid="header-search"
            className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-soft"
          />
        </form>

        <div className="ml-auto flex items-center gap-1.5 md:gap-2">
          <LanguageSwitcher />
          {user ? (
            <>
              {user.role === 'provider' && (
                <button onClick={() => nav('/provider/dashboard')} data-testid="header-dashboard" className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-full bg-mist text-pine font-semibold text-sm btn-hover">
                  <LayoutDashboard size={16} /> {t('nav.dashboard')}
                </button>
              )}
              <button onClick={() => { logout(); nav('/'); }} data-testid="logout-btn" className="inline-flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-full border border-[var(--line)] text-ink font-semibold text-xs md:text-sm btn-hover">
                <LogOut size={14} /> <span className="hidden sm:inline">{t('nav.logout')}</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/provider/onboard" data-testid="header-provider-cta" className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full border border-pine text-pine font-semibold text-sm btn-hover">
                <Store size={16} /> {t('nav.provider')}
              </Link>
              <Link to="/login" data-testid="header-login" className="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-full bg-flag text-white font-semibold text-xs md:text-sm btn-hover">
                <LogIn size={14} /> <span>{t('nav.login')}</span>
              </Link>
            </>
          )}
          <button onClick={() => setOpen(!open)} data-testid="mobile-menu-toggle" className="lg:hidden p-2 rounded-lg border border-[var(--line)]">
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="lg:hidden border-t border-[var(--line)] bg-white">
          <form onSubmit={submitSearch} className="px-4 py-3 border-b border-[var(--line)]">
            <div className="flex items-center gap-2 bg-mist rounded-full px-4 py-2.5">
              <Search size={16} className="text-ink-soft" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                className="flex-1 bg-transparent outline-none text-sm text-ink placeholder:text-ink-soft"
              />
            </div>
          </form>
          <div className="px-4 py-3 grid grid-cols-2 gap-1">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/'}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-semibold ${isActive ? 'bg-mist text-pine' : 'text-ink-soft'}`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <Link to="/provider/onboard" onClick={() => setOpen(false)} className="col-span-2 mt-2 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-pine text-center">
              {t('nav.provider')}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
