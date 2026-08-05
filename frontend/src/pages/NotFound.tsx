import React from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass, Home, Search } from 'lucide-react';
import Seo from '@/components/Seo';
import { CATEGORIES } from '@/constants/categories';

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
    <div className="mx-auto max-w-3xl px-4 md:px-8 py-16 md:py-24 text-center" data-testid="not-found">
      <Seo title={t('notfound.title')} description={t('notfound.body')} noindex />

      <div className="mx-auto w-16 h-16 rounded-full bg-mist grid place-items-center text-pine">
        <Compass size={30} />
      </div>
      <p className="mt-6 text-xs font-bold uppercase tracking-widest text-flag">{t('notfound.eyebrow')}</p>
      <h1 className="mt-2 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
        {t('notfound.title')}
      </h1>
      <p className="mt-4 text-ink-soft leading-relaxed">{t('notfound.body')}</p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link to="/" data-testid="notfound-home"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-flag text-white font-bold btn-hover">
          <Home size={16} /> {t('notfound.go_home')}
        </Link>
        <Link to="/search" data-testid="notfound-search"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
          <Search size={16} /> {t('notfound.browse')}
        </Link>
      </div>

      {/* Somewhere to actually go, rather than a dead end with a home button. */}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
        {CATEGORIES.map(({ key, to }) => (
          <Link key={key} to={to} className="chip bg-white border border-[var(--line)] text-ink hover:border-pine/40">
            {t(`categories.${key}`)}
          </Link>
        ))}
      </div>
    </div>
  );
}
