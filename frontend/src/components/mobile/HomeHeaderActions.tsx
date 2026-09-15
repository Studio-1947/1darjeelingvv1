import React from 'react';
import { Link } from 'react-router-dom';
import { Bell, Ticket } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { Monogram } from './ui';

/**
 * Notifications / Trips / Profile icon cluster, mirroring RN's
 * HomeHeaderActions.tsx. RN's tab bar has no slot for these three
 * destinations (its 5 tabs are Home/Stays/Rides/Nature/Culture), so they move
 * here instead - rendered in the mobile Home screen's header once Phase 2
 * rebuilds Home. Not mounted anywhere yet in Phase 1.
 *
 * The notification badge is suppressed for now: RN's notifications are
 * entirely local/client-seeded state, not backend data, and this app has no
 * /api/notifications endpoint or route yet (see Phase 1 plan risks) - Phase 5
 * decides whether to port the local-only stub or wait for a real endpoint.
 * Showing a count here before that decision is made would be exactly the
 * kind of fabricated-content this codebase deliberately avoids.
 */
export default function HomeHeaderActions() {
  const { user } = useAuth();
  const isProvider = user?.role === 'provider';

  const tripsTarget = isProvider
    ? '/my-listings'
    : user
      ? '/my-trips'
      : '/login?next=/my-trips';
  const profileTarget = user
    ? (isProvider ? '/provider/dashboard' : '/dashboard')
    : '/login?next=/dashboard';

  const iconCls =
    'w-9 h-9 rounded-full bg-[var(--mu-surface)] border border-[var(--mu-border)] flex items-center justify-center text-[var(--mu-ink)] active:scale-90 transition-transform';

  return (
    <div className="mobile-ui flex items-center gap-2">
      <Link to="/notifications" aria-label="Notifications" className={`relative ${iconCls}`}>
        <Bell size={17} />
      </Link>
      <Link to={tripsTarget} aria-label="My Trips" className={iconCls}>
        <Ticket size={17} />
      </Link>
      <Link to={profileTarget} aria-label="Profile">
        <Monogram label={user?.name || '?'} className="w-9 h-9 text-sm" />
      </Link>
    </div>
  );
}
