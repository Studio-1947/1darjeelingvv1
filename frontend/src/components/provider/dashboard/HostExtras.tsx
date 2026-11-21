import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Globe, Package, Phone, ShareNetwork, Star, WhatsappLogo, X, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { waLink, waShare } from '@/lib/tripMessages';
import { Box, Button, ButtonA, ButtonLink, MenuIcon, Status } from '@/components/ag';

/** Five small stars, filled up to `value`, red as the /7 theme draws them. */
function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} weight={i <= value ? 'fill' : 'regular'} className={i <= value ? 'text-[var(--star)]' : 'text-[var(--outline)]'} />
      ))}
    </span>
  );
}

/** The host's public page (board: "all profiles should look like individual websites"). */
export function HostPageCard({ provider }: { provider: any }) {
  const { t } = useTranslation();
  if (!provider?.page_path) return null;
  const url = `${window.location.origin}${provider.page_path}`;
  const live = provider.plan_active && !provider.approval_pending;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success(t('ui.hostExtras.link_copied')); } catch { /* ignore */ }
  };
  return (
    <Box as="section" data-testid="host-page-card">
      <div className="flex items-center gap-3">
        <MenuIcon><Globe /></MenuIcon>
        <div className="min-w-0 flex-1">
          <h2>{t('ui.hostExtras.page_title')}</h2>
          <p className="ag-small truncate">{url.replace(/^https?:\/\//, '')}</p>
        </div>
      </div>
      {!live && <Status>{provider.plan_active ? t('ui.hostExtras.private_until_approved') : t('ui.hostExtras.private_until_active')}</Status>}
      <div className="ag-row">
        <ButtonLink size="sm" go to={provider.page_path} data-testid="host-page-open">{t('ui.hostExtras.open_my_page')}</ButtonLink>
        <Button size="sm" icon={<Copy />} onClick={copy}>{t('ui.hostExtras.copy_link')}</Button>
        {live && (
          <ButtonA size="sm" icon={<ShareNetwork />} target="_blank" rel="noreferrer"
            href={waShare(t('ui.hostExtras.share_message', { name: provider.business_name, url }))}>
            {t('ui.hostExtras.share_whatsapp')}
          </ButtonA>
        )}
      </div>
    </Box>
  );
}

/** Board: "Ratings and Reviews" on every host dashboard. */
export function HostReviewsCard({ stats }: { stats: any }) {
  const { t } = useTranslation();
  if (!stats) return null;
  const avg = stats.average_rating || 0;
  return (
    <Box as="section" data-testid="host-reviews-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2>{t('ui.hostExtras.ratings_title')}</h2>
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--ink-strong)]">
          <Stars value={Math.round(avg)} />
          <b className="font-medium">{avg ? avg.toFixed(1) : '–'}</b>
          <span className="text-[var(--ink-muted)]">({stats.review_count || 0})</span>
        </span>
      </div>
      {stats.recent_reviews?.length ? (
        <ul className="grid gap-2.5">
          {stats.recent_reviews.slice(0, 3).map((r: any, i: number) => (
            <li key={i} className="rounded-2xl border border-[var(--warmline)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <Stars value={r.rating} size={12} />
                <b className="font-medium text-[var(--ink-strong)]">{r.author}</b>
                <span className="text-[var(--ink-muted)]">· {r.listing_title}</span>
              </div>
              {r.comment && <p className="mt-1 text-sm text-[var(--ink7)]">{r.comment}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ag-small">{t('ui.hostExtras.no_reviews')}</p>
      )}
    </Box>
  );
}

/** Board, Restaurant / Cafe: "Asking for home delivery". The host answers each request. */
export function DeliveryRequestsPanel({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api.get('/deliveries/host').then(({ data }) => setItems(data.items || [])).catch(() => setItems([])), []);
  useEffect(() => { if (visible) load(); }, [visible, load]);
  if (!visible || !items) return null;

  const answer = async (id: string, status: string) => {
    let host_note: string | undefined;
    if (status === 'accepted') host_note = window.prompt(t('ui.hostExtras.accept_note_prompt'), '') ?? undefined;
    setBusy(id);
    try {
      await api.patch(`/deliveries/${id}`, { status, host_note });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('ui.hostExtras.update_failed'));
    } finally {
      setBusy(null);
    }
  };
  const open = items.filter((r) => r.status === 'open' || r.status === 'accepted');

  return (
    <Box as="section" data-testid="host-deliveries">
      <div className="flex items-center gap-3">
        <MenuIcon><Package /></MenuIcon>
        <h2>{t('ui.hostExtras.delivery_title')}</h2>
      </div>
      {items.length === 0 ? (
        <p className="ag-small">{t('ui.hostExtras.no_requests')}</p>
      ) : (
        <ul className="grid gap-2.5">
          {(open.length ? open : items.slice(0, 5)).map((r) => (
            <li key={r.id} className="grid gap-2 rounded-2xl border border-[var(--warmline)] bg-[var(--surface)] p-3" data-testid={`delivery-${r.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <b className="font-medium text-[var(--ink-strong)]">{r.customer?.name || t('ui.hostExtras.guest')}</b>
                  <p className="ag-small">{r.listing_title} · {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <Status tone={r.status === 'delivered' ? 'ok' : r.status === 'declined' ? 'no' : r.status === 'accepted' ? 'info' : 'pending'} className="shrink-0 capitalize">
                  {t(`ui.hostExtras.status.${r.status}`, { defaultValue: r.status })}
                </Status>
              </div>
              <p className="text-sm text-[var(--ink-strong)]">{r.items.map((i: any) => `${i.qty} × ${i.name}`).join(', ')}</p>
              <p className="ag-small">{t('ui.hostExtras.deliver_to', { address: r.address })}{r.note ? ` · “${r.note}”` : ''}</p>
              <div className="ag-row">
                <ButtonA size="sm" href={`tel:${r.phone}`} icon={<Phone />}>{t('ui.hostExtras.call')}</ButtonA>
                <ButtonA size="sm" target="_blank" rel="noreferrer" icon={<WhatsappLogo />}
                  href={waLink(r.phone, t('ui.hostExtras.wa_order_message', { name: r.customer?.name || '', listing: r.listing_title }))}>
                  {t('ui.hostExtras.whatsapp')}
                </ButtonA>
                {r.status === 'open' && (
                  <>
                    <Button variant="primary" size="sm" onClick={() => answer(r.id, 'accepted')} disabled={busy !== null} data-testid={`delivery-accept-${r.id}`}
                      icon={busy === r.id ? <Loader2 className="animate-spin" /> : <Check />}>
                      {t('ui.hostExtras.accept')}
                    </Button>
                    <Button variant="stop" size="sm" onClick={() => answer(r.id, 'declined')} disabled={busy !== null} icon={<X />}>
                      {t('ui.hostExtras.decline')}
                    </Button>
                  </>
                )}
                {r.status === 'accepted' && (
                  <Button size="sm" onClick={() => answer(r.id, 'delivered')} disabled={busy !== null} icon={<Check />} data-testid={`delivery-done-${r.id}`}>
                    {t('ui.hostExtras.delivered')}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Box>
  );
}
