import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ShieldCheck, Scroll, Receipt, Leaf, Envelope, Trash } from '@phosphor-icons/react';
import Seo from '@/components/Seo';
import { Box, MenuIcon, PageHead } from '@/components/ag';

/**
 * /policies: one page that lists every policy document, so there is a single address to give
 * out. The mobile app's Legal & policies screen links here as well as to each document.
 */
const DOCS: { to: string; titleKey: string; key: string; Icon: React.ElementType }[] = [
  { to: '/privacy', titleKey: 'privacy.title', key: 'privacy', Icon: ShieldCheck },
  { to: '/terms', titleKey: 'terms.title', key: 'terms', Icon: Scroll },
  { to: '/refunds', titleKey: 'refunds.title', key: 'refunds', Icon: Receipt },
  { to: '/responsible', titleKey: 'responsible.title', key: 'responsible', Icon: Leaf },
  { to: '/contact', titleKey: 'contact.title', key: 'contact', Icon: Envelope },
  { to: '/delete-account', titleKey: 'data_deletion.title', key: 'delete_account', Icon: Trash },
];

export default function Policies() {
  const { t } = useTranslation();

  return (
    <div className="ag-wrap" data-testid="policies-page">
      <Seo title={t('policies.title')} description={t('policies.lead')} />
      <div className="ag-main">
        <PageHead eyebrow={t('policies.eyebrow', 'aangan')} title={t('policies.title')} sub={t('policies.lead')} />
        <Box className="!py-1">
          <nav className="ag-menu" aria-label={t('policies.title')}>
            {DOCS.map(({ to, titleKey, key, Icon }) => (
              <Link key={to} to={to} data-testid={`policies-${key}`}>
                <MenuIcon><Icon /></MenuIcon>
                <span className="ag-mlab">
                  <span>{t(titleKey)}</span>
                  <span className="ag-small">{t(`policies.docs.${key}`)}</span>
                </span>
                <ArrowUpRight size={18} className="text-[var(--r)] flex-none" aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </Box>
      </div>
    </div>
  );
}
