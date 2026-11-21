import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark, ShareNetwork as Share2, Star } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ag';
import Sheet from '@/components/listing-detail/Sheet';

/** The actions that require an account. Each maps to its own copy and icon. */
export type GatedAction = 'save' | 'share' | 'review';

const ICONS = { save: Bookmark, share: Share2, review: Star };

interface LoginGateValue {
  /**
   * True when the visitor is signed in and the caller may proceed. When they
   * aren't, this opens the sign-in prompt and returns false, so call sites read
   * as `if (!requireAuth('save')) return;`.
   */
  requireAuth: (action: GatedAction) => boolean;
}

const Ctx = createContext<LoginGateValue | null>(null);

/**
 * Explains *why* signing in is needed before sending anyone to the login page.
 *
 * Saving, sharing and rating all bounced logged-out visitors straight to
 * /login with no explanation, which reads as the button being broken. This
 * intercepts that: one prompt naming the action, and the trip to sign-in stays
 * the visitor's choice. Mount inside the router, under AuthProvider.
 */
export function LoginGateProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [action, setAction] = useState<GatedAction | null>(null);

  const requireAuth = useCallback((next: GatedAction) => {
    if (user) return true;
    setAction(next);
    return false;
  }, [user]);

  const value = useMemo<LoginGateValue>(() => ({ requireAuth }), [requireAuth]);

  const goLogin = () => {
    const back = loc.pathname + loc.search + loc.hash;
    setAction(null);
    nav(`/login?next=${encodeURIComponent(back)}`);
  };

  const Icon = action ? ICONS[action] : null;

  return (
    <Ctx.Provider value={value}>
      {children}

      {action && Icon && (
        <Sheet onClose={() => setAction(null)} labelledBy="login-gate-title" testid="login-gate" closeTestid="login-gate-dismiss">
          <div className="flex flex-col items-center text-center gap-2 pt-2">
            <span className="ag-micon !w-14 !h-14 [&_svg]:!w-6 [&_svg]:!h-6"><Icon aria-hidden="true" /></span>
            <h2 id="login-gate-title" className="!text-[22px] !leading-7 mt-1">{t(`auth_gate.${action}_title`)}</h2>
            <p className="ag-small">{t(`auth_gate.${action}_body`)}</p>
          </div>
          <div className="ag-stack">
            <Button variant="primary" go block onClick={goLogin} data-testid="login-gate-cta" data-autofocus>{t('auth_gate.cta')}</Button>
            <Button variant="text" center className="self-center" onClick={() => setAction(null)}>{t('auth_gate.later')}</Button>
          </div>
        </Sheet>
      )}
    </Ctx.Provider>
  );
}

export const useLoginGate = (): LoginGateValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLoginGate must be used within a LoginGateProvider');
  return ctx;
};
