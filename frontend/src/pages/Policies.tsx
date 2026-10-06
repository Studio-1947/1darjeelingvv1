import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from '@phosphor-icons/react';
import Seo from '@/components/Seo';

/**
 * /policies: one page that lists every policy document, so there is a single address to give
 * out. The mobile app's Legal & policies screen links here as well as to each document.
 */
const DOCS: { to: string; titleKey: string; key: string }[] = [
  { to: '/privacy', titleKey: 'privacy.title', key: 'privacy' },
  { to: '/terms', titleKey: 'terms.title', key: 'terms' },
  { to: '/refunds', titleKey: 'refunds.title', key: 'refunds' },
  { to: '/responsible', titleKey: 'responsible.title', key: 'responsible' },
  { to: '/contact', titleKey: 'contact.title', key: 'contact' },
  { to: '/delete-account', titleKey: 'data_deletion.title', key: 'delete_account' },
];

export default function Policies() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-10 md:py-14" data-testid="policies-page">
      <Seo title={t('policies.title')} description={t('policies.lead')} />
      <h1 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
        {t('policies.title')}
      </h1>
      <p className="mt-3 text-sm md:text-base text-ink-soft leading-relaxed">{t('policies.lead')}</p>

      <ul className="mt-8 space-y-3">
        {DOCS.map(({ to, titleKey, key }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex items-start gap-4 rounded-2xl bg-white border border-[var(--line)] p-4 md:p-5 hover:border-pine/40 transition-colors"
            >
              <div className="flex-1">
                <p className="font-display font-bold text-lg text-ink">{t(titleKey)}</p>
                <p className="mt-1 text-sm text-ink-soft leading-relaxed">{t(`policies.docs.${key}`)}</p>
              </div>
              <ArrowUpRight size={18} className="mt-1 text-ink-soft flex-shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
