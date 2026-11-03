import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FacebookLogo, InstagramLogo, EnvelopeSimple as Mail } from '@phosphor-icons/react';
import Wordmark from '@/components/Wordmark';

/**
 * A minimal footer: the wordmark, one row of links, the social icons and the copyright line.
 * Delete account now lives on the Privacy page.
 */
const LINKS: { to: string; key: string }[] = [
  { to: '/about', key: 'footer.about_aangan' },
  { to: '/explore', key: 'nav.explore' },
  { to: '/provider/onboard', key: 'nav.provider' },
  { to: '/responsible', key: 'nav.responsible' },
  { to: '/privacy', key: 'nav.privacy' },
  { to: '/terms', key: 'nav.terms' },
  { to: '/refunds', key: 'nav.refunds' },
  { to: '/contact', key: 'nav.contact' },
];

export default function Footer() {
  const { t } = useTranslation();
  const icon = 'text-ink-soft transition-colors hover:text-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pine rounded';
  return (
    <footer className="mt-16 md:mt-20 border-t border-[var(--line)] bg-white pb-24 lg:pb-0" data-testid="site-footer">
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-8 flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Wordmark className="h-6 w-auto text-ink" />
          <span className="text-[11px] font-semibold text-ink-soft">By studio 1947</span>
        </div>
        <nav aria-label={t('footer.links')}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
            {LINKS.map(({ to, key }) => (
              <li key={to}><Link to={to} className="hover:text-pine transition-colors">{t(key)}</Link></li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-4">
          <a href="https://www.instagram.com/aanganerp?dlrf=MWRnZ2tneHBqM2JiaQ%3D%3D" target="_blank" rel="noreferrer"
            aria-label="Follow Aangan on Instagram" className={icon}><InstagramLogo size={20} aria-hidden="true" /></a>
          <a href="https://www.facebook.com/profile.php?id=61594349938326" target="_blank" rel="noreferrer"
            aria-label="Follow Aangan on Facebook" className={icon}><FacebookLogo size={20} aria-hidden="true" /></a>
          <a href="mailto:aanganerp@gmail.com" aria-label="Email aanganerp@gmail.com" className={icon}><Mail size={20} aria-hidden="true" /></a>
        </div>
      </div>
      <div className="border-t border-[var(--line)] py-4 text-center text-xs text-ink-soft">© 2026 {t('brand')}. {t('footer.rights')}.</div>
    </footer>
  );
}
