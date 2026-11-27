import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Storefront } from '@phosphor-icons/react';
import { Box, Button, ButtonLink } from '@/components/ag';
import { useAuth } from '@/context/AuthContext';

/**
 * Pages that are only for travelling — saved places, trips, the pass. A host on the business side
 * gets a clear way across instead of the page: switch to Traveller (and stay on this page), or go
 * back to their dashboard. Places to look at (Home, the categories, a listing) open on the business
 * side too since 2026-11-27; there only booking and saving ask to switch (useSwitchPrompt).
 */
export default function TravellerOnly({ children }: { children: React.ReactNode }) {
  const { isHostMode } = useAuth();
  if (!isHostMode) return <>{children}</>;
  return <BusinessModeNotice />;
}

/**
 * On the business side, booking or saving a place asks to switch to Traveller first (the server
 * refuses both from Business mode, backend middleware/mode.ts). Returns true when it asked, so the
 * caller stops there.
 */
export function useSwitchPrompt() {
  const { t } = useTranslation();
  const { isHostMode, setMode } = useAuth();
  return (what: 'book' | 'save'): boolean => {
    if (!isHostMode) return false;
    toast(what === 'book'
      ? t('business_gate.book_switch', 'You are in Business mode. Switch to Traveller to book places.')
      : t('business_gate.save_switch', 'You are in Business mode. Switch to Traveller to save places.'), {
      action: { label: t('business_gate.switch', 'Switch to Traveller'), onClick: () => setMode('tourist') },
    });
    return true;
  };
}

/** Over a place opened on the business side: look around freely; booking waits for Traveller. */
export function BusinessBrowseNote() {
  const { t } = useTranslation();
  const { isHostMode, setMode } = useAuth();
  if (!isHostMode) return null;
  return (
    <Box tone="blush" flat className="!flex-row items-center flex-wrap !py-3 !gap-2" data-testid="business-browse-note">
      <p className="ag-small !text-[var(--ink-strong)] flex-1 min-w-[180px] m-0">
        {t('business_gate.browse', 'You are in Business mode: look around as much as you like. To book or save, switch to Traveller.')}
      </p>
      <Button size="sm" go onClick={() => setMode('tourist')} data-testid="business-browse-switch">
        {t('business_gate.switch', 'Switch to Traveller')}
      </Button>
    </Box>
  );
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
