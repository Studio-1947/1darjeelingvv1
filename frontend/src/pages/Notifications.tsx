import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { noteText } from '@/lib/serverText';
import { Checks, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import { Box, Button, ButtonLink, MenuIcon, PageHead } from '@/components/ag';
import { isBookingNote, noteTarget } from '@/lib/notificationLink';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { timeAgo } from '@/lib/timeAgo';
import { GetAppCard } from '@/components/AppComingSoon';
import { pushState, turnOffPush, turnOnPush, type PushState } from '@/lib/webPush';

type Note = { id: string; kind: string; title: string; body: string; ref_id: string | null; link?: string | null; unread: boolean; created_at: string; msg?: { key: string; params?: Record<string, string | number> } | null };

/**
 * What happened while you were away: requests, acceptances, cancellations, confirmations.
 * The same list the app shows on its Notifications screen (app/notifications.tsx).
 */
export default function Notifications() {
  const { t, i18n } = useTranslation();
  const { user, isHostMode, loading: authLoading } = useAuth();
  const nav = useNavigate();
  useSeo({ title: t('notes.title'), description: t('notes.title') });
  const [items, setItems] = useState<Note[] | null>(null);

  const load = useCallback(() => {
    api.get('/notifications').then(({ data }) => setItems(data.items || [])).catch(() => setItems([]));
  }, []);
  useEffect(() => { if (user) load(); }, [user, load]);
  // A notification arriving while this page is open (PushBridge) adds to the list.
  useEffect(() => {
    if (!user) return undefined;
    window.addEventListener('aangan:push', load);
    return () => window.removeEventListener('aangan:push', load);
  }, [user, load]);

  // Signed out: the prototype's empty box (V.notes with nothing yet), with a quiet way to log in.
  if (!user) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          <PageHead eyebrow={t('ui.notes.eyebrow', 'Updates')} title={t('notes.title')} />
          <GetAppCard />
          {authLoading ? (
            <p className="ag-small">{t('common.loading')}</p>
          ) : (
            <Box className="ag-account-empty" data-testid="notes-guest">
              <Icon name="bell" />
              <p>{t('ui.notes.none', 'No notifications yet.')}</p>
              <ButtonLink to={`/login?next=${encodeURIComponent('/notifications')}`} variant="text" size="sm" data-testid="notes-login">
                {t('nav.login', 'Log in')}
              </ButtonLink>
            </Box>
          )}
        </div>
      </div>
    );
  }

  const markAll = async () => {
    await api.post('/notifications/read-all').catch(() => {});
    setItems((list) => (list || []).map((n) => ({ ...n, unread: false })));
    window.dispatchEvent(new Event('aangan:notifications'));
  };

  // A booking notice leads to where that booking is handled; a team message to its chosen screen
  // (lib/notificationLink noteTarget, shared with the search sheet).
  const isBooking = isBookingNote;
  const open = async (n: Note) => {
    if (n.unread) {
      await api.patch(`/notifications/${n.id}/read`).catch(() => {});
      setItems((list) => (list || []).map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
      window.dispatchEvent(new Event('aangan:notifications'));
    }
    const target = noteTarget(n, isHostMode);
    if (target?.kind === 'route') nav(target.to);
    else if (target?.kind === 'external') window.open(target.href, '_blank', 'noopener,noreferrer');
  };

  const unread = !!items && items.some((n) => n.unread);

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        <PageHead eyebrow={t('ui.notes.eyebrow', 'Updates')} title={t('notes.title')} />
        <GetAppCard />
        <PushCard />
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

/**
 * Notifications in this browser (src/lib/webPush.ts), under the Get-the-app card and built like it.
 * Nothing shows where the browser cannot have them: development builds, a Safari tab on an iPhone
 * (only a site added to the Home Screen can), or a server without keys.
 */
function PushCard() {
  const { t } = useTranslation();
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<'on' | 'off' | null>(null);
  // After a toggle the button is replaced (or gone): keep keyboard focus in the card.
  const actionRef = useRef<HTMLButtonElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const [refocus, setRefocus] = useState(false);
  useEffect(() => {
    if (!refocus || busy) return;
    setRefocus(false);
    (actionRef.current ?? titleRef.current)?.focus();
  }, [refocus, busy, state]);
  useEffect(() => {
    let live = true;
    pushState().then((s) => { if (live) setState(s); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (state === 'unsupported') return null;

  const run = async (which: 'on' | 'off') => {
    setBusy(true);
    setFailed(null);
    try {
      setState(await (which === 'on' ? turnOnPush() : turnOffPush()));
    } catch {
      setFailed(which);
    } finally {
      setBusy(false);
      setRefocus(true);
    }
  };

  const text = {
    off: [t('ui.notes.push_off_h', 'Get notified in this browser'), t('ui.notes.push_off_s', 'Booking requests and replies, as they happen.')],
    on: [t('ui.notes.push_on_h', 'Notifications are on in this browser'), t('ui.notes.push_on_s', 'Turn them off here or in your browser settings.')],
    denied: [t('ui.notes.push_denied_h', 'Notifications are blocked'), t('ui.notes.push_denied_s', 'Allow notifications for this site in your browser settings, then come back.')],
  }[state];

  return (
    <Box className="!flex-row items-center !gap-3.5" data-testid="notes-push" data-state={state}>
      <MenuIcon><Icon name="bell" /></MenuIcon>
      <span className="min-w-0 flex-1">
        <b ref={titleRef} tabIndex={-1} className="block font-medium text-[var(--ink-strong)]">{text[0]}</b>
        <span className="ag-small" aria-live="polite">
          {failed === 'on' ? t('ui.notes.push_failed', 'Could not turn them on. Try again.')
            : failed === 'off' ? t('ui.notes.push_off_failed', 'Could not turn them off. Try again.')
              : text[1]}
        </span>
      </span>
      {state === 'off' && (
        <Button size="sm" icon={<Icon name="bell" />} ref={actionRef} onClick={() => run('on')} disabled={busy} className="flex-none" data-testid="notes-push-on">
          {t('ui.notes.push_on', 'Turn on')}
        </Button>
      )}
      {state === 'on' && (
        <Button size="sm" variant="text" ref={actionRef} onClick={() => run('off')} disabled={busy} className="flex-none" data-testid="notes-push-off">
          {t('ui.notes.push_off', 'Turn off')}
        </Button>
      )}
    </Box>
  );
}
