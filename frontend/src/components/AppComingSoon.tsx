import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, GooglePlayLogo, AppleLogo } from '@phosphor-icons/react';
import { Button, IconButton, Status } from '@/components/ag';

/**
 * "Get the app" before the store listings exist: a sheet from the bottom on a phone, a centred
 * card on a wide screen, over a blurred page (user request 9 Nov 2026). Closes with the X, the
 * button, Escape or a tap outside.
 */
export default function AppComingSoon({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const okRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    okRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);

  if (!open) return null;

  const store = (Icon: typeof GooglePlayLogo, name: string) => (
    <li className="flex items-center gap-3 py-3 border-b border-[var(--warmline)] last:border-b-0">
      <span className="ag-micon"><Icon weight="fill" /></span>
      <span className="font-medium text-[var(--ink-strong)]">{name}</span>
      <Status className="ml-auto">{t('nav.app_soon_tag', 'Coming soon')}</Status>
    </li>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4" role="presentation" data-testid="app-coming-soon">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-md animate-in fade-in" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="app-soon-title" aria-describedby="app-soon-body"
        className="ag-box relative w-full sm:max-w-[420px] !rounded-b-none sm:!rounded-[22px] !p-5 shadow-[var(--shadow-lg)] animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <span className="sm:hidden mx-auto -mt-2 w-10 h-1 rounded-full bg-[var(--outline)]" aria-hidden="true" />
        <div className="flex items-start gap-3">
          <img src="/logo192.png" alt="" width={56} height={56} className="w-14 h-14 rounded-[16px] flex-none" />
          <div className="min-w-0 flex-1">
            <span className="ag-eyebrow">{t('nav.app_soon_tag', 'Coming soon')}</span>
            <h2 id="app-soon-title" className="!text-xl !leading-7">{t('nav.app_soon_title', 'The aangan app is on its way')}</h2>
          </div>
          <IconButton label={t('common.close', 'Close')} onClick={onClose} data-testid="app-coming-soon-close"><X /></IconButton>
        </div>
        <p id="app-soon-body" className="ag-small m-0 !text-[var(--ink7)]">
          {t('nav.app_soon_body', 'We are putting the finishing touches on it for Android and iPhone. Until then, everything works right here on the website.')}
        </p>
        <ul className="m-0 p-0 list-none">
          {store(GooglePlayLogo, 'Google Play')}
          {store(AppleLogo, 'App Store')}
        </ul>
        <Button ref={okRef} variant="primary" go block onClick={onClose} data-testid="app-coming-soon-ok">
          {t('nav.app_soon_ok', 'Keep using the website')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
