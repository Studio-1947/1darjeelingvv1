import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, CircleNotch as Loader2 } from '@phosphor-icons/react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { timeAgo } from '@/lib/timeAgo';

type Note = { id: string; kind: string; title: string; body: string; ref_id: string | null; unread: boolean; created_at: string };

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

  // A booking notice leads to where that booking is handled; anything else is just marked read.
  const open = async (n: Note) => {
    if (n.unread) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      setItems((list) => (list || []).map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
      window.dispatchEvent(new Event('aangan:notifications'));
    }
    if (n.kind?.startsWith('booking_')) nav(isHostMode ? '/provider/dashboard' : '/my-trips');
    else if (n.kind?.startsWith('delivery')) nav(isHostMode ? '/provider/dashboard' : '/my-trips');
  };

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6 py-6 md:py-10">
      <div className="flex items-end justify-between gap-3 mb-6">
        <h1 className="font-display font-extrabold text-3xl md:text-4xl text-ink leading-tight">{t('notes.title')}</h1>
        {items && items.some((n) => n.unread) && (
          <button type="button" onClick={markAll} data-testid="notes-read-all" className="text-sm font-bold text-pine hover:underline">
            {t('notes.read_all')}
          </button>
        )}
      </div>
      {items === null ? (
        <div className="flex justify-center py-16 text-ink-soft"><Loader2 size={24} className="animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-ink-soft" data-testid="notes-empty">{t('notes.empty')}</div>
      ) : (
        <ul className="space-y-3" data-testid="notes-list">
          {items.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => open(n)} data-testid={`note-${n.id}`}
                className={`w-full text-left flex gap-3 rounded-2xl border bg-white p-4 btn-hover ${n.unread ? 'border-pine/40 border-l-4 border-l-pine' : 'border-[var(--line)]'}`}>
                <span className="w-9 h-9 flex-shrink-0 rounded-full bg-mist text-pine grid place-items-center"><Bell size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink">{n.title}</span>
                  <span className="block text-[13px] text-ink-soft mt-0.5">{n.body}</span>
                  <span className="block text-[11px] text-ink-soft mt-1">{timeAgo(n.created_at, i18n.language, t)}</span>
                </span>
                {n.unread && <span className="mt-1.5 w-2 h-2 flex-shrink-0 rounded-full bg-pine" aria-label={t('notes.unread')} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
