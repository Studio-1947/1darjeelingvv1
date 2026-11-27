import React from 'react';
import { useTranslation } from 'react-i18next';
import { Phone, EnvelopeSimple as Mail } from '@phosphor-icons/react';
import Seo from '@/components/Seo';
import Fold from '@/components/provider/Fold';
import { Box, ButtonA, ButtonLink, PageHead } from '@/components/ag';
import { COMPANY } from '@/constants/company';

/**
 * /faq: common questions from travellers and hosts, in sections, each question a fold that opens
 * on tap (the shared Fold: a native <details>, so keyboard and screen readers need nothing extra).
 *
 * The answers restate the Terms, the Refund & Cancellation Policy and the Privacy Policy in plain
 * words; when a fee, a window or a rule changes there, change it here too. `{{email}}` is the one
 * support address from constants/company.ts.
 */
interface Question {
  q: string;
  a: string;
  /** An optional link under the answer, to the page that does the thing. */
  link?: { to: string; label: string };
}
interface Section {
  h: string;
  items: Question[];
}

const PHONE = '+91 90932 77919';

export default function Faq() {
  const { t } = useTranslation();
  // Read as data with { returnObjects: true }; a missing namespace degrades to an empty list,
  // as LegalDocument does, rather than throwing.
  const raw = t('faq.sections', { returnObjects: true, email: COMPANY.email });
  const sections: Section[] = Array.isArray(raw) ? raw : [];

  return (
    <div className="ag-wrap" data-testid="faq-page">
      <Seo title={t('faq.title')} description={t('faq.lead')} />
      <div className="ag-main">
        <PageHead eyebrow={t('faq.eyebrow')} title={t('faq.title')} sub={t('faq.lead')} />

        {sections.map((s, i) => (
          <section key={i} className="flex flex-col gap-3 pt-2" data-testid={`faq-section-${i}`}>
            <h2 className="m-0 text-xl leading-7 font-medium tracking-[-0.01em] text-[var(--ink-strong)]">{s.h}</h2>
            {s.items.map((item, j) => (
              <Fold key={j} title={item.q} testid={`faq-q-${i}-${j}`}>
                <p className="m-0 text-base leading-[26px] text-[var(--ink7)]">{item.a}</p>
                {item.link && (
                  <ButtonLink to={item.link.to} size="sm" go className="self-start">{item.link.label}</ButtonLink>
                )}
              </Fold>
            ))}
          </section>
        ))}

        <Box as="section" data-testid="faq-help">
          <h2>{t('faq.help_title')}</h2>
          <p className="ag-small m-0">{t('faq.help_body')}</p>
          <div className="ag-row">
            <ButtonA size="sm" variant="primary" href={`tel:${PHONE.replace(/\s/g, '')}`} icon={<Phone aria-hidden="true" />}
              aria-label={t('ui.footer.call_us', { phone: PHONE })}>{t('ui.footer.call')}</ButtonA>
            <ButtonA size="sm" href={`mailto:${COMPANY.email}`} icon={<Mail aria-hidden="true" />}
              aria-label={t('ui.footer.email_us', { email: COMPANY.email })}>{t('ui.footer.email')}</ButtonA>
            <ButtonLink to="/contact" size="sm" go>{t('nav.contact')}</ButtonLink>
          </div>
        </Box>
      </div>
    </div>
  );
}
