import React, { useEffect, useState } from 'react';
import { Star, ShareNetwork, X, CircleNotch as Loader2, Check, Package } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { tripStoryMessage, waShare } from '@/lib/tripMessages';

/**
 * Board, after a trip: "After completion -> Reviews + Suggestion for aangan -> Share your trip
 * story (WhatsApp + asking others to join the app through a link)". The app has the same steps.
 */
let inviteCodeCache: string | null = null;
async function inviteCode(): Promise<string | null> {
  if (inviteCodeCache) return inviteCodeCache;
  try { inviteCodeCache = (await api.get('/users/me/referrals')).data.code || null; } catch { inviteCodeCache = null; }
  return inviteCodeCache;
}

export function ShareStoryButton({ place, rating, story }: { place: string; rating?: number; story?: string }) {
  const { t } = useTranslation();
  const [code, setCode] = useState<string | null>(inviteCodeCache);
  useEffect(() => { inviteCode().then(setCode); }, []);
  return (
    <a href={waShare(tripStoryMessage({ place, rating, story, inviteCode: code }))} target="_blank" rel="noreferrer" data-testid="share-trip-story"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-bold btn-hover">
      <ShareNetwork size={13} /> {t('ui.afterTrip.share_story')}
    </a>
  );
}

export function RateTripButton({ booking, onDone }: { booking: any; onDone: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const place = booking.listing?.title || booking.listing_title;

  const submit = async () => {
    if (!rating) { toast.error(t('ui.afterTrip.tap_stars')); return; }
    setBusy(true);
    try {
      await api.post('/reviews', { listing_id: booking.listing_id, rating, comment: comment.trim() });
      if (suggestion.trim().length >= 5) {
        await api.post('/feedback/aangan', { message: suggestion.trim(), booking_id: booking.id }).catch(() => {});
      }
      setDone(true);
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('ui.afterTrip.review_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid={`rate-trip-${booking.id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1F6656] text-white text-xs font-bold btn-hover">
        <Star size={13} weight="fill" /> {t('ui.afterTrip.rate_trip')}
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={t('ui.afterTrip.rate_trip')} data-testid="rate-trip">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-extrabold text-xl text-ink">{t('ui.afterTrip.how_was', { place })}</h2>
              <button onClick={() => setOpen(false)} aria-label={t('common.close')} className="w-9 h-9 grid place-items-center rounded-full hover:bg-mist"><X size={18} /></button>
            </div>
            {done ? (
              <div className="py-5 text-center" data-testid="rate-trip-done">
                <span className="mx-auto w-12 h-12 rounded-full bg-pine/10 text-pine grid place-items-center"><Check size={24} weight="bold" /></span>
                <p className="mt-3 font-bold text-ink">{t('ui.afterTrip.thanks_title')}</p>
                <p className="text-sm text-ink-soft mt-1">{t('ui.afterTrip.thanks_body')}</p>
                <div className="mt-4 flex justify-center"><ShareStoryButton place={place} rating={rating} story={comment.trim()} /></div>
              </div>
            ) : (
              <>
                <div className="mt-3 flex gap-1" role="radiogroup" aria-label={t('ui.afterTrip.rating')}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t('ui.afterTrip.stars', { count: n })} onClick={() => setRating(n)} className="p-1" data-testid={`rate-star-${n}`}>
                      <Star size={32} weight={n <= rating ? 'fill' : 'regular'} className={n <= rating ? 'text-gold' : 'text-ink-soft'} />
                    </button>
                  ))}
                </div>
                <label className="block mt-3 text-xs font-bold uppercase tracking-wider text-ink-soft">{t('ui.afterTrip.your_review')}</label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} placeholder={t('ui.afterTrip.review_ph')} data-testid="rate-comment"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-sm outline-none focus:border-pine" />
                <label className="block mt-3 text-xs font-bold uppercase tracking-wider text-ink-soft">{t('ui.afterTrip.suggestion_label')}</label>
                <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={2} maxLength={2000} placeholder={t('ui.afterTrip.suggestion_ph')} data-testid="rate-suggestion"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-sm outline-none focus:border-pine" />
                <button type="button" onClick={submit} disabled={busy} data-testid="rate-submit"
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 h-[50px] rounded-full bg-[#1F6656] text-white font-bold text-[15px] disabled:opacity-60">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : null} {t('ui.afterTrip.send_review')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** The traveller's home delivery requests and how each one stands. */
export function MyDeliveries() {
  const { t } = useTranslation();
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => api.get('/deliveries/mine').then(({ data }) => setItems(data.items || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (!items || items.length === 0) return null;
  const cancel = async (id: string) => {
    try { await api.post(`/deliveries/${id}/cancel`); load(); } catch (e: any) { toast.error(e?.response?.data?.detail || t('ui.afterTrip.cancel_error')); }
  };
  const tone: Record<string, string> = { open: 'bg-gold/20 text-[#7a5d00]', accepted: 'bg-[#DDF0F1] text-[#0E4A4F]', delivered: 'bg-[#DDF3E1] text-[#1E5A2E]', declined: 'bg-flag/10 text-flag', cancelled: 'bg-mist text-ink-soft' };
  return (
    <section className="mt-10" data-testid="my-deliveries">
      <h2 className="font-display font-extrabold text-xl text-ink flex items-center gap-2"><Package size={20} className="text-[#007C85]" /> {t('ui.afterTrip.deliveries_title')}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((r) => (
          <li key={r.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <div className="flex items-center gap-2">
              <b className="text-ink">{r.listing_title}</b>
              <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[11px] font-bold ${tone[r.status] || 'bg-mist'}`}>{t(`ui.afterTrip.status.${r.status}`, { defaultValue: r.status.charAt(0).toUpperCase() + r.status.slice(1) })}</span>
            </div>
            <p className="mt-1 text-sm text-ink">{r.items.map((i: any) => `${i.qty} × ${i.name}`).join(', ')}</p>
            <p className="text-xs text-ink-soft">{t('ui.afterTrip.to_address', { address: r.address })}</p>
            {r.host_note && <p className="mt-1 text-xs text-ink">{t('ui.afterTrip.host_note', { note: r.host_note })}</p>}
            {r.status === 'open' && (
              <button onClick={() => cancel(r.id)} className="mt-2 text-xs font-bold text-flag">{t('ui.afterTrip.cancel_request')}</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
