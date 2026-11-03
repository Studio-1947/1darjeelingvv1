import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Storefront, ArrowRight } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';

/**
 * Pages for travelling — browsing, booking, saved places, trips, the ₹12 pass. A host on the
 * business side sees only their own business, so here they get a clear way across instead of the
 * page: switch to Traveller (and stay on this page), or go back to their dashboard.
 */
export default function TravellerOnly({ children }: { children: React.ReactNode }) {
  const { isHostMode } = useAuth();
  if (!isHostMode) return <>{children}</>;
  return <BusinessModeNotice />;
}

export function BusinessModeNotice() {
  const { t } = useTranslation();
  const { setMode } = useAuth();
  return (
    <section className="mx-auto max-w-xl px-4 py-16 md:py-24 text-center" data-testid="business-mode-gate">
      <div className="mx-auto w-16 h-16 rounded-full bg-mist text-pine grid place-items-center">
        <Storefront size={30} />
      </div>
      <h1 className="mt-6 font-display font-extrabold text-2xl md:text-3xl text-ink">{t('business_gate.title')}</h1>
      <p className="mt-3 text-ink-soft leading-relaxed">{t('business_gate.body')}</p>
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => setMode('tourist')}
          data-testid="business-gate-switch"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 rounded-full bg-pine text-white font-bold btn-hover"
        >
          {t('business_gate.switch')} <ArrowRight size={16} />
        </button>
        <Link
          to="/provider/dashboard"
          data-testid="business-gate-dashboard"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[var(--line)] bg-white text-ink font-bold btn-hover"
        >
          {t('business_gate.dashboard')} <ArrowRight size={16} />
        </Link>
      </div>
    </section>
  );
}
