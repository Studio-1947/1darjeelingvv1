import React, { createContext, useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Maintenance from '@/pages/Maintenance';

/**
 * TEMPORARY(legal-pause) — the pre-launch pause, read from the server.
 *
 * The switches live only in the server's .env (MAINTENANCE, HOME_DELIVERY, DONATIONS; see
 * backend/src/config.ts), and GET /api/app/status reports them. While maintenance is on, every
 * route of the website shows the Maintenance screen instead; the admin console at /admin is a
 * separate app and is not affected. To remove the pause, search for "TEMPORARY(legal-pause)", and
 * also delete the `maintenance` keys in locales/{en,bn,hi,ne}.json (JSON cannot carry the marker).
 */
export interface AppStatus {
  maintenance: boolean;
  home_delivery: boolean;
  donations: boolean;
}

// What the site assumes if the status cannot be read: no maintenance screen (the API being down
// breaks the site anyway), and the paused features stay hidden.
const FALLBACK: AppStatus = { maintenance: false, home_delivery: false, donations: false };

const AppStatusContext = createContext<AppStatus>(FALLBACK);

export function useAppStatus(): AppStatus {
  return useContext(AppStatusContext);
}

export function AppStatusGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AppStatus | null>(null);

  useEffect(() => {
    let live = true;
    api.get('/app/status')
      .then(({ data }) => { if (live) setStatus({ ...FALLBACK, ...data }); })
      .catch(() => { if (live) setStatus(FALLBACK); });
    return () => { live = false; };
  }, []);

  // The site's own loading line until the answer is in, so no page flashes before the
  // maintenance screen (the same element App.tsx shows while a page loads).
  if (!status) return <div className="page-loading" role="status">{t('common.loading')}</div>;
  if (status.maintenance) return <Maintenance />;
  return <AppStatusContext.Provider value={status}>{children}</AppStatusContext.Provider>;
}
