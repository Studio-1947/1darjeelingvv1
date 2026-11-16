import React, { useEffect, useState } from 'react';
import { Star, ShareNetwork, X, CircleNotch as Loader2, Check, Package } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { tripStoryMessage, waShare } from '@/lib/tripMessages';
import { Box, Button, ButtonA, IconButton, SecHead, Status, TextArea } from '@/components/ag';

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
    <ButtonA href={waShare(tripStoryMessage({ place, rating, story, inviteCode: code }))} target="_blank" rel="noreferrer" size="sm"
      icon={<ShareNetwork />} data-testid="share-trip-story">
      {t('ui.afterTrip.share_story')}
    </ButtonA>
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
      <Button size="sm" icon={<Star weight="fill" />} onClick={() => setOpen(true)} data-testid={`rate-trip-${booking.id}`}>
        {t('ui.afterTrip.rate_trip')}
      </Button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={`rate-title-${booking.id}`} data-testid="rate-trip">
          <div className="absolute inset-0 bg-black/55" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-[720px] sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-t-[22px] sm:rounded-[22px] bg-[var(--surface)] p-4 pb-6 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 id={`rate-title-${booking.id}`} className="font-medium text-xl text-[var(--ink-strong)]">{t('ui.afterTrip.how_was', { place })}</h2>
              <IconButton label={t('common.close')} onClick={() => setOpen(false)}><X /></IconButton>
            </div>
            {done ? (
              <div className="ag-done" data-testid="rate-trip-done">
                <span className="big"><Check weight="bold" /></span>
                <p className="ag-lead">{t('ui.afterTrip.thanks_title')}</p>
                <p className="ag-small">{t('ui.afterTrip.thanks_body')}</p>
                <ShareStoryButton place={place} rating={rating} story={comment.trim()} />
              </div>
            ) : (
              <>
                <div className="flex gap-1" role="radiogroup" aria-label={t('ui.afterTrip.rating')}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={t('ui.afterTrip.stars', { count: n })} onClick={() => setRating(n)}
                      className="w-12 h-12 grid place-items-center" data-testid={`rate-star-${n}`}>
                      <Star size={32} weight={n <= rating ? 'fill' : 'regular'} className={n <= rating ? 'text-[var(--star)]' : 'text-[var(--ink-faint)]'} />
                    </button>
                  ))}
                </div>
                <TextArea label={t('ui.afterTrip.your_review')} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} maxLength={1000}
                  placeholder={t('ui.afterTrip.review_ph')} data-testid="rate-comment" />
                <TextArea label={t('ui.afterTrip.suggestion_label')} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={2} maxLength={2000}
                  placeholder={t('ui.afterTrip.suggestion_ph')} data-testid="rate-suggestion" />
                <Button variant="primary" block center onClick={submit} disabled={busy} data-testid="rate-submit"
                  icon={busy ? <Loader2 className="animate-spin" /> : undefined}>
                  {t('ui.afterTrip.send_review')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const DELIVERY_TONE: Record<string, 'ok' | 'no' | 'info' | 'pending'> = { open: 'pending', accepted: 'info', delivered: 'ok', declined: 'no', cancelled: 'no' };

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
  return (
    <section className="flex flex-col gap-3" data-testid="my-deliveries" aria-labelledby="deliveries-title">
      <SecHead id="deliveries-title" title={<span className="inline-flex items-center gap-2"><Package size={20} className="text-[var(--r)]" aria-hidden="true" /> {t('ui.afterTrip.deliveries_title')}</span>} className="!mb-0" />
      {items.map((r) => (
        <Box key={r.id} className="!gap-1.5">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate">{r.listing_title}</h3>
            <Status tone={DELIVERY_TONE[r.status] || 'pending'} className="ml-auto">{t(`ui.afterTrip.status.${r.status}`, { defaultValue: r.status.charAt(0).toUpperCase() + r.status.slice(1) })}</Status>
          </div>
          <p className="text-sm text-[var(--ink7)]">{r.items.map((i: any) => `${i.qty} × ${i.name}`).join(', ')}</p>
          <p className="ag-small">{t('ui.afterTrip.to_address', { address: r.address })}</p>
          {r.host_note && <p className="text-sm text-[var(--ink7)]">{t('ui.afterTrip.host_note', { note: r.host_note })}</p>}
          {r.status === 'open' && (
            <Button variant="stop" size="sm" className="self-start mt-1" onClick={() => cancel(r.id)}>{t('ui.afterTrip.cancel_request')}</Button>
          )}
        </Box>
      ))}
    </section>
  );
}
