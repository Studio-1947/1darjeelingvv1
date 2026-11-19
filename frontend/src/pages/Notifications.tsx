import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { noteText } from '@/lib/serverText';
import { Checks, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import { Box, Button, MenuIcon, PageHead } from '@/components/ag';
import { webLinkTarget } from '@/lib/notificationLink';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { timeAgo } from '@/lib/timeAgo';

type Note = { id: string; kind: string; title: string; body: string; ref_id: string | null; link?: string | null; unread: boolean; created_at: string; msg?: { key: string; params?: Record<string, string | number> } | null };

/**
 * What happened while you were away: requests, acceptances, cancellations, confirmations.
 * The same list the app shows on its Notifications screen (app/notifications.tsx).
 */
export default function Notifications() {
  const { t, i18n } = useTranslation();
  const { user, isHostMode } = useAuth();
  const nav = useNavigate();
  useSeo({ title: t('notes.title'), description: t('notes.title') });
  const [items, setItems] = useState<Note[] | null>(null);

  const load = useCallback(() => {
    api.get('/notifications').then(({ data }) => setItems(data.items || [])).catch(() => setItems([]));
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);

  if (!user) return <Navigate to={`/login?next=${encodeURIComponent('/notifications')}`} replace />;

  const markAll = async () => {
    await api.post('/notifications/read-all').catch(() => {});
    setItems((list) => (list || []).map((n) => ({ ...n, unread: false })));
    window.dispatchEvent(new Event('aangan:notifications'));
  };

  // A booking notice leads to where that booking is handled; a team message to its chosen screen.
  const isBooking = (kind?: string) => !!kind && (kind.startsWith('booking_') || kind.startsWith('cancel_request'));
  const open = async (n: Note) => {
    if (n.unread) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      setItems((list) => (list || []).map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
      window.dispatchEvent(new Event('aangan:notifications'));
    }
    // A message from the team opens the screen it was sent with.
    const target = webLinkTarget(n.link, isHostMode);
    if (target?.kind === 'route') nav(target.to);
    else if (target?.kind === 'external') window.open(target.href, '_blank', 'noopener,noreferrer');
    else if (isBooking(n.kind)) nav(isHostMode ? '/provider/dashboard?s=bookings' : '/my-trips');
    else if (n.kind?.startsWith('delivery')) nav(isHostMode ? '/provider/dashboard' : '/my-trips');
    else if (n.kind === 'place_suggestion_live' && n.ref_id) nav(`/listing/${n.ref_id}`);
    else if (n.kind?.startsWith('place_suggestion')) nav('/#my-suggestions');
    else if (n.kind?.startsWith('plan_')) nav(n.kind === 'plan_cancelled' || !n.ref_id ? '/feed' : `/plan/${n.ref_id}`);
  };

  const unread = !!items && items.some((n) => n.unread);

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={t('ui.notes.eyebrow', 'Updates')} title={t('notes.title')} />
        {unread && (
          <Button size="sm" icon={<Checks />} className="self-start" onClick={markAll} data-testid="notes-read-all">{t('notes.read_all')}</Button>
        )}
        {items === null ? (
          <p className="ag-small inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin text-[var(--r)]" aria-hidden="true" /> {t('common.loading')}</p>
        ) : items.length === 0 ? (
          <Box className="ag-account-empty" data-testid="notes-empty">
            <Icon name="bell" />
            <p>{t('notes.empty')}</p>
          </Box>
        ) : (
          <Box className="ag-account-menu">
            <ul className="ag-menu" data-testid="notes-list">
              {items.map((n) => {
                const text = noteText(t, n);
                return (
                  <li key={n.id} className="!p-0">
                    <button type="button" onClick={() => open(n)} data-testid={`note-${n.id}`}
                      className="w-full flex items-start gap-3.5 py-3 px-3 text-left bg-transparent border-0 cursor-pointer">
                      <MenuIcon><Icon name={n.kind === 'announcement' ? 'news' : isBooking(n.kind) ? 't_trip' : 'bell'} /></MenuIcon>
                      <span className="ag-mlab">
                        <span className={`text-[var(--ink-strong)] ${n.unread ? 'font-medium' : 'font-normal'}`}>{text.title}</span>
                        {text.body && <span className="ag-small whitespace-pre-line">{text.body}</span>}
                        <span className="text-xs text-[var(--ink-faint)]">{timeAgo(n.created_at, i18n.language, t)}</span>
                      </span>
                      {n.unread && <span className="mt-2 w-2.5 h-2.5 flex-none rounded-full bg-[var(--r)]" role="img" aria-label={t('notes.unread')} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Box>
        )}
      </div>
    </div>
  );
}
