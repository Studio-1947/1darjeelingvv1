import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Copy, Globe, Package, Phone, ShareNetwork, Star, WhatsappLogo, X, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { waLink, waShare } from '@/lib/tripMessages';

/** The host's public page (board: "all profiles should look like individual websites"). */
export function HostPageCard({ provider }: { provider: any }) {
  if (!provider?.page_path) return null;
  const url = `${window.location.origin}${provider.page_path}`;
  const live = provider.plan_active && !provider.approval_pending;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast.success('Link copied'); } catch { /* ignore */ }
  };
  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5" data-testid="host-page-card">
      <div className="flex flex-wrap items-center gap-3">
        <span className="w-10 h-10 rounded-xl bg-mist text-[#007C85] grid place-items-center"><Globe size={20} /></span>
        <div className="flex-1 min-w-0">
          <p className="font-display font-extrabold text-lg text-ink">Your page on aangan</p>
          <p className="text-sm text-ink-soft truncate">{url.replace(/^https?:\/\//, '')}</p>
          {!live && <p className="text-xs font-semibold text-[#7a5d00] mt-0.5">Only you can open it until your plan is active and verified.</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={provider.page_path} data-testid="host-page-open" className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#1F6656] text-white font-bold text-[13px] btn-hover">
          Open my page <ArrowRight size={14} />
        </Link>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-[var(--line)] text-ink font-bold text-[13px] btn-hover">
          <Copy size={14} /> Copy link
        </button>
        {live && (
          <a href={waShare(`Find ${provider.business_name} on aangan: ${url}`)} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#25D366] text-white font-bold text-[13px] btn-hover">
            <ShareNetwork size={14} /> Share on WhatsApp
          </a>
        )}
      </div>
    </section>
  );
}

/** Board: "Ratings and Reviews" on every host dashboard. */
export function HostReviewsCard({ stats }: { stats: any }) {
  if (!stats) return null;
  const avg = stats.average_rating || 0;
  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5" data-testid="host-reviews-card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-extrabold text-lg text-ink">Ratings and reviews</h2>
        <span className="inline-flex items-center gap-1 text-sm font-bold text-ink">
          {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={15} weight={i <= Math.round(avg) ? 'fill' : 'regular'} className={i <= Math.round(avg) ? 'text-gold' : 'text-ink-soft/40'} />)}
          <span className="ml-1">{avg ? avg.toFixed(1) : '–'}</span>
          <span className="text-ink-soft font-semibold">({stats.review_count || 0})</span>
        </span>
      </div>
      {stats.recent_reviews?.length ? (
        <ul className="mt-3 space-y-3">
          {stats.recent_reviews.slice(0, 3).map((r: any, i: number) => (
            <li key={i} className="rounded-xl bg-mist/50 p-3">
              <div className="flex items-center gap-1 text-xs">
                {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} weight={n <= r.rating ? 'fill' : 'regular'} className={n <= r.rating ? 'text-gold' : 'text-ink-soft/40'} />)}
                <span className="ml-1 font-bold text-ink">{r.author}</span>
                <span className="text-ink-soft">· {r.listing_title}</span>
              </div>
              {r.comment && <p className="mt-1 text-sm text-ink">{r.comment}</p>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-ink-soft">No reviews yet. Guests are asked for one after every finished trip.</p>
      )}
    </section>
  );
}

/** Board, Restaurant / Cafe: "Asking for home delivery". The host answers each request. */
export function DeliveryRequestsPanel({ visible }: { visible: boolean }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(() => api.get('/deliveries/host').then(({ data }) => setItems(data.items || [])).catch(() => setItems([])), []);
  useEffect(() => { if (visible) load(); }, [visible, load]);
  if (!visible || !items || (!items.length && !visible)) return null;

  const answer = async (id: string, status: string) => {
    let host_note: string | undefined;
    if (status === 'accepted') host_note = window.prompt('A note for the guest (optional), e.g. "About 30 minutes"', '') ?? undefined;
    setBusy(id);
    try {
      await api.patch(`/deliveries/${id}`, { status, host_note });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Could not update');
    } finally {
      setBusy(null);
    }
  };
  const open = items.filter((r) => r.status === 'open' || r.status === 'accepted');

  return (
    <section className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-5" data-testid="host-deliveries">
      <h2 className="font-display font-extrabold text-lg text-ink flex items-center gap-2"><Package size={20} className="text-[#007C85]" /> Home delivery requests</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-ink-soft">No requests yet. Guests can ask from your listing page while home delivery is on.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {(open.length ? open : items.slice(0, 5)).map((r) => (
            <li key={r.id} className="rounded-xl border border-[var(--line)] p-3" data-testid={`delivery-${r.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b className="text-ink">{r.customer?.name || 'Guest'}</b>
                <span className="text-ink-soft">· {r.listing_title} · {new Date(r.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="ml-auto px-2 py-0.5 rounded-full text-[11px] font-bold bg-mist text-ink capitalize">{r.status}</span>
              </div>
              <p className="mt-1 text-sm text-ink">{r.items.map((i: any) => `${i.qty} × ${i.name}`).join(', ')}</p>
              <p className="text-xs text-ink-soft">Deliver to: {r.address}{r.note ? ` · “${r.note}”` : ''}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`tel:${r.phone}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-bold"><Phone size={12} /> Call</a>
                <a href={waLink(r.phone, `Hello ${r.customer?.name || ''}, about your order from ${r.listing_title} on aangan: `)} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-bold"><WhatsappLogo size={12} /> WhatsApp</a>
                {r.status === 'open' && (
                  <>
                    <button onClick={() => answer(r.id, 'accepted')} disabled={busy !== null} data-testid={`delivery-accept-${r.id}`}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-pine/40 text-pine text-xs font-bold disabled:opacity-50">
                      {busy === r.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Accept
                    </button>
                    <button onClick={() => answer(r.id, 'declined')} disabled={busy !== null}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-flag/40 text-flag text-xs font-bold disabled:opacity-50"><X size={12} /> Decline</button>
                  </>
                )}
                {r.status === 'accepted' && (
                  <button onClick={() => answer(r.id, 'delivered')} disabled={busy !== null} data-testid={`delivery-done-${r.id}`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-pine/40 text-pine text-xs font-bold disabled:opacity-50"><Check size={12} /> Delivered</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
