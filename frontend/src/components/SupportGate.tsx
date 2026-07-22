import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { needsSupport } from '@/lib/support';

/**
 * Paths that must stay reachable while gated.
 *
 * /support     — the screen that lifts the gate; redirecting it to itself is a loop.
 * /login       — Login has its own redirect-when-authenticated effect; letting the gate fight
 *                it produces a loop, and a gated user may legitimately want to switch accounts.
 * /privacy     — linked from the support screen, and a policy page behind a paywall is absurd.
 * /provider/onboard — an unpaid provider needs support (providerPaid is false) but this is
 *                exactly where Login sends them to pay the ₹99. Gating it would deadlock
 *                provider onboarding entirely.
 * /donate      — telling someone who wants to give us money that they must first pay ₹12 for
 *                the privilege is self-defeating. Donations grant nothing, so allowing this
 *                cannot become a way around the gate.
 */
const ALWAYS_ALLOWED = ['/support', '/login', '/privacy', '/provider/onboard', '/donate'];

// react-router matches routes case-insensitively and treats a trailing slash as equivalent to
// none (no caseSensitive prop is set in App.tsx), so /Provider/Onboard/ renders the same route
// as /provider/onboard while failing a strict string-equality check. Normalise before comparing.
function normalizePath(pathname: string): string {
  const lower = pathname.toLowerCase();
  return lower === '/' ? lower : lower.replace(/\/+$/, '');
}

export default function SupportGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Render nothing rather than the gate while the session is still resolving, otherwise a
  // logged-in paid user gets a flash of the paywall on every hard refresh.
  if (loading) return null;

  if (!needsSupport(user)) return <>{children}</>;
  if (ALWAYS_ALLOWED.includes(normalizePath(location.pathname))) return <>{children}</>;

  return <Navigate to="/support" replace state={{ from: location }} />;
}
