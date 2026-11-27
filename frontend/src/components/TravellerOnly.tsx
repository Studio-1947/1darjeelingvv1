import React from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Storefront } from '@phosphor-icons/react';
import { Box, Button, ButtonLink } from '@/components/ag';
import { useAuth } from '@/context/AuthContext';
import Sheet, { SheetHead } from '@/components/listing-detail/Sheet';

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

type SwitchWhat = 'book' | 'save';
const SWITCH_EVENT = 'aangan:switch-prompt';

/**
 * On the business side, booking or saving a place asks to switch to Traveller first (the server
 * refuses both from Business mode, backend middleware/mode.ts). It opens SwitchPromptHost's dialog,
 * which covers the page until it is answered. Returns true when it asked, so the caller stops there.
 */
export function useSwitchPrompt() {
  const { isHostMode } = useAuth();
  return (what: SwitchWhat): boolean => {
    if (!isHostMode) return false;
    window.dispatchEvent(new CustomEvent<SwitchWhat>(SWITCH_EVENT, { detail: what }));
    return true;
  };
}

/**
 * The "Switch to Traveller?" dialog (mounted once, in Layout): over the whole screen, so it cannot
 * be missed, with OK to switch (the host stays on the same page, now as a traveller) or Not now.
 */
export function SwitchPromptHost() {
  const { t } = useTranslation();
  const { isHostMode, setMode } = useAuth();
  const [what, setWhat] = React.useState<SwitchWhat | null>(null);
  React.useEffect(() => {
    const on = (e: Event) => setWhat((e as CustomEvent<SwitchWhat>).detail || 'book');
    window.addEventListener(SWITCH_EVENT, on);
    return () => window.removeEventListener(SWITCH_EVENT, on);
  }, []);
  // Switched some other way while it was open: nothing left to ask.
  React.useEffect(() => { if (!isHostMode) setWhat(null); }, [isHostMode]);
  if (!what) return null;
  const close = () => setWhat(null);
  const ok = () => {
    setMode('tourist');
    setWhat(null);
    toast.success(t('business_gate.switched', 'You are now in Traveller mode.'));
  };
  return (
    <Sheet onClose={close} labelledBy="switch-prompt-title" testid="switch-prompt" closeTestid="switch-prompt-close">
      <div className="flex flex-col gap-4">
        <span className="ag-micon !w-14 !h-14 [&_svg]:!w-7 [&_svg]:!h-7" aria-hidden="true"><Storefront /></span>
        <SheetHead id="switch-prompt-title" title={t('business_gate.title', "You're in Business mode")} />
        <p className="m-0 text-[15px] leading-[22px] text-[var(--ink-strong)]" data-testid="switch-prompt-body">
          {what === 'book'
            ? t('business_gate.modal_book', 'To book this place, switch to Traveller mode. Your business stays as it is, and you can switch back from Account at any time.')
            : t('business_gate.modal_save', 'To save places, switch to Traveller mode. Your business stays as it is, and you can switch back from Account at any time.')}
        </p>
        <Button variant="primary" go block onClick={ok} data-autofocus data-testid="switch-prompt-ok">
          {t('business_gate.ok_switch', 'OK, switch to Traveller')}
        </Button>
        <Button variant="text" className="self-center" onClick={close} data-testid="switch-prompt-later">
          {t('ob.add.leave', 'Not now')}
        </Button>
      </div>
    </Sheet>
  );
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
