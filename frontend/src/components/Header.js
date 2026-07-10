import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Mountain, Menu, X, LogIn, LogOut, LayoutDashboard, Store } from 'lucide-react';

export default function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
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

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-[var(--line)]" data-testid="site-header">
      <div className="mx-auto max-w-7xl px-4 md:px-8 h-14 md:h-16 flex items-center gap-2 md:gap-4">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0" data-testid="brand-link">
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-lg md:rounded-xl bg-pine text-white grid place-items-center font-display font-extrabold text-base md:text-lg">১</div>
          <div className="leading-tight hidden sm:block">
            <div className="font-display font-extrabold text-base md:text-lg text-ink">{t('brand')}</div>
            <div className="text-[9px] md:text-[10px] text-ink-soft uppercase tracking-widest">Darjeeling</div>
          </div>
          <div className="leading-tight sm:hidden">
            <div className="font-display font-extrabold text-base text-ink">{t('brand')}</div>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 ml-6 overflow-x-auto">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              data-testid={`nav-${l.to.replace('/', '') || 'discover'}`}
              className={({ isActive }) =>
                `px-3 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors ${
                  isActive ? 'bg-mist text-pine' : 'text-ink-soft hover:text-ink hover:bg-mist/60'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

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
              <Link to="/login" data-testid="header-login" className="inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-4 py-2 rounded-full bg-pine text-white font-semibold text-xs md:text-sm btn-hover">
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
          <div className="px-5 py-3 grid grid-cols-2 gap-1">
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
            <Link to="/provider/onboard" onClick={() => setOpen(false)} className="col-span-2 px-3 py-2 rounded-lg text-sm font-semibold text-pine border border-pine text-center">
              {t('nav.provider')}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
