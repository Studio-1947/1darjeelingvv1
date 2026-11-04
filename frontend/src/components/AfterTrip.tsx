import React, { useEffect, useState } from 'react';
import { Star, ShareNetwork, X, CircleNotch as Loader2, Check, Package } from '@phosphor-icons/react';
import { toast } from 'sonner';
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
  const [code, setCode] = useState<string | null>(inviteCodeCache);
  useEffect(() => { inviteCode().then(setCode); }, []);
  return (
    <a href={waShare(tripStoryMessage({ place, rating, story, inviteCode: code }))} target="_blank" rel="noreferrer" data-testid="share-trip-story"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-xs font-bold btn-hover">
      <ShareNetwork size={13} /> Share your trip story
    </a>
  );
}

export function RateTripButton({ booking, onDone }: { booking: any; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const place = booking.listing?.title || booking.listing_title;

  const submit = async () => {
    if (!rating) { toast.error('Tap the stars to rate your trip'); return; }
    setBusy(true);
    try {
      await api.post('/reviews', { listing_id: booking.listing_id, rating, comment: comment.trim() });
      if (suggestion.trim().length >= 5) {
        await api.post('/feedback/aangan', { message: suggestion.trim(), booking_id: booking.id }).catch(() => {});
      }
      setDone(true);
      onDone();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Could not save your review');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-testid={`rate-trip-${booking.id}`}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1F6656] text-white text-xs font-bold btn-hover">
        <Star size={13} weight="fill" /> Rate your trip
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Rate your trip" data-testid="rate-trip">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-extrabold text-xl text-ink">How was {place}?</h2>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 grid place-items-center rounded-full hover:bg-mist"><X size={18} /></button>
            </div>
            {done ? (
              <div className="py-5 text-center" data-testid="rate-trip-done">
                <span className="mx-auto w-12 h-12 rounded-full bg-pine/10 text-pine grid place-items-center"><Check size={24} weight="bold" /></span>
                <p className="mt-3 font-bold text-ink">Thank you for your review</p>
                <p className="text-sm text-ink-soft mt-1">Tell your friends about the trip, and invite them to aangan.</p>
                <div className="mt-4 flex justify-center"><ShareStoryButton place={place} rating={rating} story={comment.trim()} /></div>
              </div>
            ) : (
              <>
                <div className="mt-3 flex gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n > 1 ? 's' : ''}`} onClick={() => setRating(n)} className="p-1" data-testid={`rate-star-${n}`}>
                      <Star size={32} weight={n <= rating ? 'fill' : 'regular'} className={n <= rating ? 'text-gold' : 'text-ink-soft'} />
                    </button>
                  ))}
                </div>
                <label className="block mt-3 text-xs font-bold uppercase tracking-wider text-ink-soft">Your review</label>
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000} placeholder="What did you love? Anything others should know?" data-testid="rate-comment"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-sm outline-none focus:border-pine" />
                <label className="block mt-3 text-xs font-bold uppercase tracking-wider text-ink-soft">A suggestion for aangan (optional)</label>
                <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={2} maxLength={2000} placeholder="How could aangan make your next trip better?" data-testid="rate-suggestion"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-sm outline-none focus:border-pine" />
                <button type="button" onClick={submit} disabled={busy} data-testid="rate-submit"
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 h-[50px] rounded-full bg-[#1F6656] text-white font-bold text-[15px] disabled:opacity-60">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : null} Send review
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
  const [items, setItems] = useState<any[] | null>(null);
  const load = () => api.get('/deliveries/mine').then(({ data }) => setItems(data.items || [])).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  if (!items || items.length === 0) return null;
  const cancel = async (id: string) => {
    try { await api.post(`/deliveries/${id}/cancel`); load(); } catch (e: any) { toast.error(e?.response?.data?.detail || 'Could not cancel'); }
  };
  const tone: Record<string, string> = { open: 'bg-gold/20 text-[#7a5d00]', accepted: 'bg-[#DDF0F1] text-[#0E4A4F]', delivered: 'bg-[#DDF3E1] text-[#1E5A2E]', declined: 'bg-flag/10 text-flag', cancelled: 'bg-mist text-ink-soft' };
  return (
    <section className="mt-10" data-testid="my-deliveries">
      <h2 className="font-display font-extrabold text-xl text-ink flex items-center gap-2"><Package size={20} className="text-[#007C85]" /> Home delivery requests</h2>
      <ul className="mt-3 space-y-3">
        {items.map((r) => (
          <li key={r.id} className="rounded-2xl border border-[var(--line)] bg-white p-4">
            <div className="flex items-center gap-2">
              <b className="text-ink">{r.listing_title}</b>
              <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[11px] font-bold capitalize ${tone[r.status] || 'bg-mist'}`}>{r.status === 'open' ? 'Waiting for the place' : r.status}</span>
            </div>
            <p className="mt-1 text-sm text-ink">{r.items.map((i: any) => `${i.qty} × ${i.name}`).join(', ')}</p>
            <p className="text-xs text-ink-soft">To: {r.address}</p>
            {r.host_note && <p className="mt-1 text-xs text-ink">From the place: “{r.host_note}”</p>}
            {r.status === 'open' && (
              <button onClick={() => cancel(r.id)} className="mt-2 text-xs font-bold text-flag">Cancel request</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
