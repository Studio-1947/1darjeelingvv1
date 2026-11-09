import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, GooglePlayLogo, AppleLogo, ArrowRight } from '@phosphor-icons/react';

/**
 * "Get the app" before the store listings exist: a centred card over a blurred page instead of a
 * toast in the corner (user request 9 Nov 2026). Closes with the X, the button, Escape or a tap
 * outside the card.
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
    <div className="flex items-center gap-3 rounded-2xl border border-[var(--line)] bg-[#F7F8F4] px-4 py-3">
      <span className="w-9 h-9 rounded-xl bg-white border border-[var(--line)] grid place-items-center text-ink flex-shrink-0">
        <Icon size={20} weight="fill" />
      </span>
      <span className="font-bold text-sm text-ink">{name}</span>
      <span className="ml-auto text-[11px] font-bold uppercase tracking-wider text-[#7a5d00] bg-gold/20 rounded-full px-2.5 py-1">
        {t('nav.app_soon_tag', 'Coming soon')}
      </span>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center p-4" role="presentation" data-testid="app-coming-soon">
      <div className="absolute inset-0 bg-[#14201A]/45 backdrop-blur-md animate-in fade-in" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="app-soon-title" aria-describedby="app-soon-body"
        className="relative w-full max-w-sm overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_-12px_rgba(20,32,26,0.45)]">
        <button type="button" onClick={onClose} aria-label={t('common.close', 'Close')} data-testid="app-coming-soon-close"
          className="absolute top-3 right-3 z-10 w-11 h-11 rounded-full grid place-items-center text-ink bg-white/80 hover:bg-mist">
          <X size={18} weight="bold" />
        </button>

        <div className="relative px-6 pt-8 pb-6 text-center bg-gradient-to-b from-[#E6F2EA] to-white">
          <img src="/logo192.png" alt="" width={72} height={72}
            className="mx-auto w-[72px] h-[72px] rounded-[20px] shadow-[0_10px_24px_-8px_rgba(31,102,86,0.55)]" />
          <h2 id="app-soon-title" className="mt-4 font-display font-extrabold text-2xl text-ink leading-tight">
            {t('nav.app_soon_title', 'The aangan app is on its way')}
          </h2>
          <p id="app-soon-body" className="mt-2 text-sm text-ink-soft leading-relaxed">
            {t('nav.app_soon_body', 'We are putting the finishing touches on it for Android and iPhone. Until then, everything works right here on the website.')}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-2.5">
          {store(GooglePlayLogo, 'Google Play')}
          {store(AppleLogo, 'App Store')}
          <button ref={okRef} type="button" onClick={onClose} data-testid="app-coming-soon-ok"
            className="btn-main mt-2 w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#1F6656] text-white font-bold text-[15px] h-[50px] btn-hover">
            {t('nav.app_soon_ok', 'Keep using the website')} <ArrowRight size={16} weight="bold" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
