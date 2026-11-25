import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { syncPush } from '@/lib/webPush';

/**
 * Connects the service worker's notifications (src/service-worker.ts) to the running app. Renders
 * nothing.
 *
 *  - A notification arrives: the bell count refreshes.
 *  - One is tapped with the site open: the worker posts where it leads, and the app goes there and
 *    marks it read. With the site closed the worker opens the page with ?push_note=<id> instead,
 *    which is read and removed here.
 *  - On sign-in and each load, this browser's subscription is re-registered to whoever is signed in.
 */
export default function PushBridge() {
  const { user, setMode } = useAuth();
  const nav = useNavigate();
  const { pathname, search, hash } = useLocation();
  const isProvider = user?.role === 'provider';

  useEffect(() => {
    if (user?.id) void syncPush();
  }, [user?.id]);

  // A tapped notice about the person's business opens on the business side.
  const opened = (id: string | null, host: boolean) => {
    if (host && isProvider) setMode('provider');
    if (id && user) {
      api.patch(`/notifications/${encodeURIComponent(id)}/read`).catch(() => {})
        .finally(() => window.dispatchEvent(new Event('aangan:notifications')));
    }
  };

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (e: MessageEvent) => {
      const m = e.data;
      if (m?.type === 'aangan:push') {
        window.dispatchEvent(new Event('aangan:notifications'));
        window.dispatchEvent(new Event('aangan:push'));
      }
      if (m?.type === 'aangan:push-open' && typeof m.to === 'string' && m.to.startsWith('/')) {
        opened(typeof m.id === 'string' ? m.id : null, !!m.host);
        nav(m.to);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav, user?.id, isProvider]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (!params.has('push_note') && !params.has('push_host')) return;
    // Wait for the session, so the read mark is sent with it.
    if (localStorage.getItem('token') && !user) return;
    const id = params.get('push_note');
    const host = params.get('push_host') === '1';
    params.delete('push_note');
    params.delete('push_host');
    const rest = params.toString();
    nav(`${pathname}${rest ? `?${rest}` : ''}${hash}`, { replace: true });
    opened(id, host);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, user?.id]);

  return null;
}
