import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, House as Home, MagnifyingGlass as Search } from '@phosphor-icons/react';
import Seo from '@/components/Seo';
import { CATEGORIES } from '@/constants/categories';
import { Box, ButtonLink, Chips, PageHead, SecHead } from '@/components/ag';

/**
 * What an unknown URL renders.
 *
 * There was nothing here before: /some-random-404-xyz drew the header and footer
 * around an empty <main>, with no message and no way back (QA 2.5).
 *
 * The status code is the part this cannot fix. Every path in a single-page app is
 * served the same index.html with a 200, so a crawler - and our own uptime
 * monitoring - sees a healthy page. `noindex` is what keeps these out of the
 * index in the meantime; a real 404 needs the server to know which paths are
 * routes, which is a deploy-side change (see deploy/nginx/app.conf).
 */
export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="ag-wrap" data-testid="not-found">
      <Seo title={t('notfound.title')} description={t('notfound.body')} noindex />
      <div className="ag-main">
        <Box>
          <span className="w-14 h-14 rounded-full bg-[var(--r-tint)] text-[var(--r)] grid place-items-center" aria-hidden="true">
            <Compass size={28} />
          </span>
          <PageHead eyebrow={t('notfound.eyebrow')} title={t('notfound.title')} sub={t('notfound.body')} />
          <div className="flex flex-col sm:flex-row gap-2">
            <ButtonLink to="/" variant="primary" go icon={<Home />} data-testid="notfound-home">{t('notfound.go_home')}</ButtonLink>
            <ButtonLink to="/search" go icon={<Search />} data-testid="notfound-search">{t('notfound.browse')}</ButtonLink>
          </div>
        </Box>

        {/* Somewhere to actually go, rather than a dead end with a home button. */}
        <section>
          <SecHead title={t('notfound.browse')} className="!mt-0" />
          <Chips>
            {CATEGORIES.map(({ key, to }) => (
              <Link key={key} to={to} className="ag-chip">{t(`categories.${key}`)}</Link>
            ))}
          </Chips>
        </section>
      </div>
    </div>
  );
}
