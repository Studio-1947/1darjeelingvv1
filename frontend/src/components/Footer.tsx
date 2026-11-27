import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FacebookLogo, InstagramLogo, EnvelopeSimple as Mail, Phone } from '@phosphor-icons/react';
import Wordmark from '@/components/Wordmark';
import { ButtonA, Status } from '@/components/ag';
import { COMPANY } from '@/constants/company';

/**
 * A minimal footer: the wordmark, one row of links, the social icons and the copyright line.
 * Delete account now lives on the Privacy page.
 */
const LINKS: { to: string; key: string }[] = [
  { to: '/about', key: 'footer.about_aangan' },
  { to: '/explore', key: 'nav.explore' },
  { to: '/provider/onboard', key: 'nav.provider' },
  { to: '/responsible', key: 'nav.responsible' },
  { to: '/faq', key: 'nav.faq' },
  { to: '/privacy', key: 'nav.privacy' },
  { to: '/terms', key: 'nav.terms' },
  { to: '/refunds', key: 'nav.refunds' },
  { to: '/contact', key: 'nav.contact' },
];

/** Pages that end with the footer: the about, help and legal pages. */
const FOOTER_PAGES = ['/about', '/responsible', '/faq', '/privacy', '/terms', '/refunds', '/contact', '/policies', '/donate', '/delete-account'];

export default function Footer() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // The /7 app screens have no footer; it belongs to the about, help and legal pages only.
  if (!FOOTER_PAGES.includes(pathname)) return null;
  return (
    <footer className="ag-foot" data-testid="site-footer">
      <div className="ag-wrap flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <Wordmark className="h-6 w-auto text-[var(--ink-strong)]" still />
          <Status tone="info" className="flex-none">{t('ui.header.beta', 'Beta')}</Status>
          <span className="ag-small">{t('ui.footer.by_studio', { name: 'studio 1947' })}</span>
        </div>
        <div className="ag-row">
          <ButtonA size="sm" variant="primary" href="tel:+919093277919" data-testid="footer-phone" icon={<Phone aria-hidden="true" />}
            aria-label={t('ui.footer.call_us', { phone: '+91 90932 77919' })}>{t('ui.footer.call')}</ButtonA>
          <ButtonA size="sm" href={`mailto:${COMPANY.email}`} icon={<Mail aria-hidden="true" />}
            aria-label={t('ui.footer.email_us', { email: COMPANY.email })}>{t('ui.footer.email')}</ButtonA>
          <a href="https://www.instagram.com/aanganerp?dlrf=MWRnZ2tneHBqM2JiaQ%3D%3D" target="_blank" rel="noreferrer"
            aria-label={t('ui.footer.follow_instagram')} className="ag-iconbtn"><InstagramLogo aria-hidden="true" /></a>
          <a href="https://www.facebook.com/profile.php?id=61594349938326" target="_blank" rel="noreferrer"
            aria-label={t('ui.footer.follow_facebook')} className="ag-iconbtn"><FacebookLogo aria-hidden="true" /></a>
        </div>
        <nav aria-label={t('footer.links')}>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {LINKS.map(({ to, key }) => (
              <li key={to}><Link to={to} className="ag-small inline-flex items-center min-h-11 hover:text-[var(--r)]">{t(key)}</Link></li>
            ))}
          </ul>
        </nav>
        <p className="ag-small">© 2026 {t('brand')}. {t('footer.rights')}.</p>
        {/* The entity behind the site (constants/company.ts); a line still waiting on its value is left out. */}
        <p className="ag-small" data-testid="footer-entity">
          {[
            t('ui.footer.operated_by', { name: COMPANY.legalName }),
            COMPANY.grievanceOfficer && t('ui.footer.grievance_officer', { name: COMPANY.grievanceOfficer }),
          ].filter(Boolean).join(' · ')}
          {/* Styled as the policy pages style a link inside text (LegalDocument's contact card). */}
          {' · '}<Link to="/contact" className="font-medium text-[var(--r)] hover:underline">{t('ui.footer.grievance_link')}</Link>
        </p>
      </div>
    </footer>
  );
}
