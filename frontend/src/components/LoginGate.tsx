import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bookmark, Share2, Star, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

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

      {action && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-gate-title"
          data-testid="login-gate"
          className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setAction(null)}
            className="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
          />
          <div className="relative w-full max-w-sm bg-white rounded-3xl border border-[var(--line)] shadow-2xl p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-200">
            <button
              type="button"
              onClick={() => setAction(null)}
              aria-label={t('common.close')}
              data-testid="login-gate-dismiss"
              className="absolute top-3 right-3 w-9 h-9 rounded-full grid place-items-center text-ink-soft hover:bg-mist transition-colors"
            >
              <X size={18} />
            </button>

            <span className="mx-auto w-14 h-14 rounded-full bg-mist text-pine grid place-items-center">
              {Icon && <Icon size={24} />}
            </span>
            <h2 id="login-gate-title" className="mt-4 font-display font-extrabold text-xl text-ink">
              {t(`auth_gate.${action}_title`)}
            </h2>
            <p className="mt-2 text-sm text-ink-soft leading-relaxed">
              {t(`auth_gate.${action}_body`)}
            </p>

            <button
              type="button"
              onClick={goLogin}
              data-testid="login-gate-cta"
              className="mt-5 w-full py-3 rounded-full bg-flag text-white font-bold btn-hover"
            >
              {t('auth_gate.cta')}
            </button>
            <button
              type="button"
              onClick={() => setAction(null)}
              className="mt-2 w-full py-2 text-sm font-semibold text-ink-soft hover:text-ink transition-colors"
            >
              {t('auth_gate.later')}
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useLoginGate = (): LoginGateValue => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLoginGate must be used within a LoginGateProvider');
  return ctx;
};
