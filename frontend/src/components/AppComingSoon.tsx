import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from '@phosphor-icons/react';
import { Button, ButtonA, IconButton, Status } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { APP_STORE_URLS } from '@/constants/app';

/*
 * Get the app: the aangan app for Android and iPhone is on its way. Each platform shows "Coming soon"
 * until its store link is set in constants/app.ts, then a Download button to that store.
 * (This used to offer installing the website from the browser; that is not the app, so it is gone.)
 */

export type Platform = 'android' | 'ios';

/** The phone this is, when it is one: an iPhone/iPad gets the App Store first, everything else Android. */
export const phonePlatform = (): Platform | null => {
  if (typeof navigator === 'undefined') return null;
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return null;
};

/** A sheet from the bottom on a phone, a centred card on a wide screen, over a blurred page. Closes with the X, OK, Escape or a tap outside. */
export default function AppComingSoon({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [open, onClose]);

  if (!open) return null;

  const mine = phonePlatform();
  const rows: { key: Platform; name: string; store: string }[] = [
    { key: 'android', name: t('appsoon.android', 'Android'), store: t('appsoon.play', 'Google Play') },
    { key: 'ios', name: t('appsoon.ios', 'iPhone'), store: t('appsoon.appstore', 'App Store') },
  ];
  // The person's own phone first.
  if (mine === 'ios') rows.reverse();
  const anyLive = rows.some((r) => APP_STORE_URLS[r.key]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4" role="presentation" data-testid="app-coming-soon">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-md animate-in fade-in" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="app-get-title" aria-describedby="app-get-body"
        className="ag-box relative w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto !rounded-b-none sm:!rounded-[22px] !p-5 shadow-[var(--shadow-lg)] animate-in slide-in-from-bottom duration-300"
        style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <span className="sm:hidden mx-auto -mt-2 w-10 h-1 rounded-full bg-[var(--outline)]" aria-hidden="true" />
        <IconButton ref={closeRef} label={t('common.close', 'Close')} onClick={onClose} className="!absolute right-3 top-3" data-testid="app-coming-soon-close"><X /></IconButton>

        <div className="flex flex-col items-center text-center gap-2.5 pt-2">
          <img src="/logo192.png" alt="" width={72} height={72} className="w-[72px] h-[72px] rounded-[18px] shadow-[var(--shadow-lg)]" />
          <h2 id="app-get-title" className="!text-2xl !leading-[30px] m-0">
            {anyLive ? t('appsoon.h_live', 'Get the aangan app') : t('appsoon.h', 'The aangan app is coming soon')}
          </h2>
          <p id="app-get-body" className="m-0 text-[var(--ink7)]">
            {t('appsoon.s', 'We are building aangan for Android and iPhone. Until then, keep using it right here: everything works in your browser.')}
          </p>
        </div>

        <ul className="m-0 mt-4 p-0 list-none flex flex-col gap-2.5" data-testid="app-stores">
          {rows.map((r) => {
            const url = APP_STORE_URLS[r.key];
            return (
              <li key={r.key} className="flex items-center gap-3 rounded-[18px] border border-[var(--warmline)] bg-[var(--creme)] px-4 py-3" data-testid={`app-store-${r.key}`}>
                <Icon name="phone" />
                <span className="min-w-0 flex-1 text-left">
                  <b className="block text-[var(--ink-strong)]">{r.name}</b>
                  <span className="ag-small">{r.store}</span>
                </span>
                {url ? (
                  <ButtonA href={url} target="_blank" rel="noopener noreferrer" variant="primary" icon={<Icon name="download" />} data-testid={`app-download-${r.key}`}>
                    {t('appsoon.download', 'Download')}
                  </ButtonA>
                ) : (
                  <Status data-testid={`app-soon-${r.key}`}><Icon name="hourglass" /> {t('appsoon.soon', 'Coming soon')}</Status>
                )}
              </li>
            );
          })}
        </ul>

        <Button variant="primary" block center className="mt-4" onClick={onClose} data-testid="app-coming-soon-ok">
          {t('appsoon.ok', 'OK')}
        </Button>
      </div>
    </div>,
    document.body,
  );
}
