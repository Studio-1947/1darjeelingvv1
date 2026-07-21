import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Compass, User } from 'lucide-react';
import TeaLeaf from '@/components/icons/TeaLeaf';
import Binoculars from '@/components/icons/Binoculars';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';

/**
 * Instagram-style mobile bottom tab bar.
 */
export default function BottomNav() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const items = [
    { to: '/', label: t('nav.discover'), Icon: Binoculars, testid: 'bottom-nav-home', end: true },
    { to: '/spots', label: t('nav.spots'), Icon: Compass, testid: 'bottom-nav-explore' },
    { to: '/homestays', label: t('nav.homestays'), Icon: Home, testid: 'bottom-nav-book' },
    { to: '/responsible', label: 'Green', Icon: TeaLeaf, testid: 'bottom-nav-saved' },
    { to: user ? (user.role === 'provider' ? '/provider/dashboard' : '/dashboard') : '/login', label: user ? (user.name?.split(' ')[0] || 'Me') : t('nav.login'), Icon: User, testid: 'bottom-nav-profile' },
  ];

  return (
    <nav
      data-testid="bottom-nav"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-[var(--line)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="grid grid-cols-5">
        {items.map(({ to, label, Icon, testid, end }) => (
          <NavLink
            key={testid}
            to={to}
            end={end}
            data-testid={testid}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold ${
                isActive ? 'text-flag' : 'text-ink-soft'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.6 : 2} />
                <span className="truncate max-w-[70px]">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
