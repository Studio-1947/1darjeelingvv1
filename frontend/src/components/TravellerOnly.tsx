import React from 'react';
import { useTranslation } from 'react-i18next';
import { Storefront } from '@phosphor-icons/react';
import { Button, ButtonLink } from '@/components/ag';
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
    <div className="ag-wrap">
      <section className="ag-main" data-testid="business-mode-gate">
        <div className="ag-done">
          <span className="ag-micon !w-16 !h-16 [&_svg]:!w-8 [&_svg]:!h-8"><Storefront aria-hidden="true" /></span>
          <div className="ag-q"><h1>{t('business_gate.title')}</h1></div>
          <p className="ag-lead !font-normal !text-[var(--ink7)]">{t('business_gate.body')}</p>
          <div className="ag-stack w-full">
            <Button variant="primary" go block onClick={() => setMode('tourist')} data-testid="business-gate-switch">
              {t('business_gate.switch')}
            </Button>
            <ButtonLink go block to="/provider/dashboard" data-testid="business-gate-dashboard">
              {t('business_gate.dashboard')}
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
