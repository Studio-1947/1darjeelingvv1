import React from 'react';
import { useTranslation } from 'react-i18next';
import { EnvelopeSimple as Mail, Phone, Wrench } from '@phosphor-icons/react';
import Seo from '@/components/Seo';
import Wordmark from '@/components/Wordmark';
import { Box, ButtonA, PageHead } from '@/components/ag';
import { COMPANY } from '@/constants/company';

/**
 * TEMPORARY(legal-pause): what every route shows while the server says MAINTENANCE is on
 * (context/AppStatus.tsx). Built like NotFound — a card with an icon, a page head and actions —
 * with the site's phone and email so people can still reach the team.
 */
export default function Maintenance() {
  const { t } = useTranslation();

  return (
    <div className="ag-wrap" data-testid="maintenance">
      <Seo title={t('maintenance.title')} description={t('maintenance.body')} noindex />
      <main id="main" className="ag-main">
        <Wordmark className="h-6 w-auto text-[var(--ink-strong)]" still />
        <Box>
          <span className="w-14 h-14 rounded-full bg-[var(--r-tint)] text-[var(--r)] grid place-items-center" aria-hidden="true">
            <Wrench size={28} />
          </span>
          <PageHead eyebrow={t('maintenance.eyebrow')} title={t('maintenance.title')} sub={t('maintenance.body')} />
          <div className="flex flex-col sm:flex-row gap-2">
            <ButtonA variant="primary" href="tel:+919093277919" icon={<Phone aria-hidden="true" />}
              aria-label={t('ui.footer.call_us', { phone: '+91 90932 77919' })} data-testid="maintenance-call">{t('ui.footer.call')}</ButtonA>
            <ButtonA href={`mailto:${COMPANY.email}`} icon={<Mail aria-hidden="true" />}
              aria-label={t('ui.footer.email_us', { email: COMPANY.email })} data-testid="maintenance-email">{t('ui.footer.email')}</ButtonA>
          </div>
        </Box>
      </main>
    </div>
  );
}
