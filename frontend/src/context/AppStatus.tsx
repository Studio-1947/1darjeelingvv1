import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Maintenance from '@/pages/Maintenance';

/**
 * Site switches, read from the server (GET /api/app/status).
 *
 * Maintenance is switched from the admin panel's Overview tab, with the server's MAINTENANCE .env
 * value as the default (backend/src/lib/siteSettings.ts). While it is on, every route of the
 * website shows the Maintenance screen instead; the admin console at /admin is a separate app and
 * is not affected. The status is asked again every few minutes and whenever the tab comes back
 * into view, so a switch reaches people who already have the site open.
 *
 * TEMPORARY(legal-pause): HOME_DELIVERY and DONATIONS are .env only. Maintenance stays when the
 * pause is removed.
 */
export interface AppStatus {
  maintenance: boolean;
  home_delivery: boolean;
  donations: boolean;
}

// What the site assumes if the status cannot be read: no maintenance screen (the API being down
// breaks the site anyway), and the paused features stay hidden.
const FALLBACK: AppStatus = { maintenance: false, home_delivery: false, donations: false };

// How often an open tab asks again, so an admin's maintenance switch reaches it.
const RECHECK_MS = 2 * 60_000;

const sameStatus = (a: AppStatus, b: AppStatus) =>
  a.maintenance === b.maintenance && a.home_delivery === b.home_delivery && a.donations === b.donations;

const AppStatusContext = createContext<AppStatus>(FALLBACK);

export function useAppStatus(): AppStatus {
  return useContext(AppStatusContext);
}

export function AppStatusGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AppStatus | null>(null);

  useEffect(() => {
    let live = true;
    const load = () => {
      api.get('/app/status')
        .then(({ data }) => {
          if (!live) return;
          const next: AppStatus = { ...FALLBACK, ...data };
          // Same answer: keep the object, so nothing under the provider re-renders.
          setStatus((prev) => (prev && sameStatus(prev, next) ? prev : next));
        })
        // A later check failing keeps what the site already shows; only the first falls back.
        .catch(() => { if (live) setStatus((prev) => prev ?? FALLBACK); });
    };
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, RECHECK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  // The site's own loading line until the answer is in, so no page flashes before the
  // maintenance screen (the same element App.tsx shows while a page loads).
  if (!status) return <div className="page-loading" role="status">{t('common.loading')}</div>;
  if (status.maintenance) return <Maintenance />;
  return <AppStatusContext.Provider value={status}>{children}</AppStatusContext.Provider>;
}
