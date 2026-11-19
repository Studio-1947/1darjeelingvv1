import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from '@phosphor-icons/react';
import { Button, IconButton, Status } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/*
 * Get the app (prototype pwa.js V.getapp): aangan installs from the browser as an app. Where the
 * browser offers its own install prompt (Chrome on Android and desktop), the sheet shows one Install
 * button; inside the installed app it says so; otherwise it shows the iPhone and Android steps.
 *
 * The browser fires beforeinstallprompt once, early, often before the sheet is opened, so it is
 * caught here when the module loads (the header imports this at start) and kept until used.
 */
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: InstallPrompt | null = null;
let installed = false;
const listeners = new Set<() => void>();
const ping = () => listeners.forEach((f) => f());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallPrompt; ping(); });
  window.addEventListener('appinstalled', () => { installed = true; deferred = null; ping(); });
}

const isStandalone = () => typeof window !== 'undefined'
  && ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (navigator as Navigator & { standalone?: boolean }).standalone === true);
const isIOS = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

/** A sheet from the bottom on a phone, a centred card on a wide screen, over a blurred page. Closes with the X, Escape or a tap outside. */
export default function AppComingSoon({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const [, redraw] = React.useReducer((n: number) => n + 1, 0);

  React.useEffect(() => {
    listeners.add(redraw);
    return () => { listeners.delete(redraw); };
  }, []);

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

  const standalone = isStandalone();

  const install = () => {
    const p = deferred;
    if (!p) return;
    deferred = null;
    p.prompt().catch(() => {});
    p.userChoice.then((c) => { if (c.outcome === 'accepted') installed = true; ping(); }).catch(() => ping());
  };

  const steps = (key: 'ios' | 'and', title: string, lines: string[]) => (
    <section className="flex flex-col gap-3" data-testid={`app-steps-${key}`}>
      <h3 className="m-0 font-medium text-[var(--ink-strong)]">{title}</h3>
      <ol className="ag-host-track">
        {lines.map((line, i) => (
          <li key={i}>
            <span className="d" aria-hidden="true">{i + 1}</span>
            <span className="min-w-0"><b>{line}</b></span>
          </li>
        ))}
      </ol>
    </section>
  );
  const ios = steps('ios', t('pwa.ios', 'On iPhone'), [
    t('pwa.ios1', 'Open this page in Safari.'),
    t('pwa.ios2', 'Tap the Share button (the square with an arrow).'),
    t('pwa.ios3', 'Tap "Add to Home Screen", then Add.'),
  ]);
  const android = steps('and', t('pwa.and', 'On Android'), [
    t('pwa.and1', 'Open this page in Chrome.'),
    t('pwa.and2', 'Tap the three dots at the top right.'),
    t('pwa.and3', 'Tap "Install app" or "Add to Home screen".'),
  ]);

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
          <h2 id="app-get-title" className="!text-2xl !leading-[30px] m-0">{t('pwa.h', 'Get the aangan app')}</h2>
          <p id="app-get-body" className="m-0 text-[var(--ink7)]">
            {t('pwa.s', 'Install aangan on your phone. It opens from your home screen, loads fast, and works even when the signal is weak.')}
          </p>
          {standalone ? (
            <Status tone="ok" data-testid="app-in-app"><Icon name="check" /> {t('pwa.inapp', 'You are using the installed app.')}</Status>
          ) : installed ? (
            <Status tone="ok" data-testid="app-installed"><Icon name="check" /> {t('pwa.done', 'Installed. Open aangan from your home screen.')}</Status>
          ) : deferred ? (
            <Button variant="primary" block center icon={<Icon name="download" />} onClick={install} data-testid="app-install">
              {t('pwa.btn', 'Install app')}
            </Button>
          ) : null}
          <p className="ag-small m-0">{t('pwa.size', 'Under 1 MB to install. No app store needed.')}</p>
        </div>

        {!standalone && (isIOS() ? ios : <>{android}{ios}</>)}
      </div>
    </div>,
    document.body,
  );
}
