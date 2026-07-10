import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Search, User } from 'lucide-react';

export default function Header() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [q, setQ] = React.useState('');
  const nav = useNavigate();

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
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 flex-shrink-0" data-testid="brand-link">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-lg leading-none">১</div>
          <div className="hidden sm:block leading-none">
            <div className="font-display font-extrabold text-lg text-ink">1 Darjeeling</div>
          </div>
        </Link>

        {/* Center search */}
        <form onSubmit={submitSearch} className="flex-1 max-w-md flex items-center gap-2 bg-mist rounded-full px-4 py-2">
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
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {user ? (
            <button onClick={goProfile} data-testid="header-profile"
              className="w-9 h-9 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-bold btn-hover">
              {user.name ? user.name.trim().charAt(0).toUpperCase() : <User size={16} />}
            </button>
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
