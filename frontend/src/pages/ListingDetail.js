import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import { MapPin, Tag, ArrowLeft, Phone, Share2, Heart, MessageCircle, Store, Coffee, Ticket, Leaf, Mountain, Navigation, ArrowRight } from 'lucide-react';

export default function ListingDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ check_in: '', check_out: '', guests: 1, notes: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [liked, setLiked] = useState(false);
  const [payModal, setPayModal] = useState(null); // { order, amount, description, bookingId }
  const [confirm, setConfirm] = useState(null); // { open, data }

  useEffect(() => {
    api.get(`/listings/${id}`).then((r) => setItem(r.data.item)).finally(() => setLoading(false));
  }, [id]);

  const bookable = item && (item.type === 'homestay' || item.type === 'driver');

  // Contextual CTA config per listing type
  const CTA_CONFIG = {
    homestay: { key: 'book_now', Icon: ArrowRight, color: 'bg-flag text-white' },
    driver: { key: 'talk_to_driver', Icon: Phone, color: 'bg-pine text-white' },
    shop: { key: 'contact_shop', Icon: Store, color: 'bg-ink text-white' },
    cafe: { key: 'visit_cafe', Icon: Coffee, color: 'bg-ink text-white' },
    event: { key: 'join_event', Icon: Ticket, color: 'bg-flag text-white' },
    biodiversity: { key: 'learn_more', Icon: Leaf, color: 'bg-pine text-white' },
    spot: { key: 'explore', Icon: Mountain, color: 'bg-pine text-white' },
  };

  const openMaps = () => {
    if (!item) return;
    const q = encodeURIComponent(`${item.title}, ${item.location}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  };

  const shareIt = async () => {
    if (!item) return;
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: item.title, text: item.description, url }); return; } catch (e) { console.warn('share failed', e); }
    }
    try { await navigator.clipboard.writeText(url); setMsg('Link copied!'); setTimeout(() => setMsg(''), 1500); } catch (e) { console.warn('clipboard failed', e); }
  };

  const doBook = async () => {
    if (!user) { nav('/login?next=' + encodeURIComponent(`/listing/${id}`)); return; }
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/bookings', {
        listing_id: item.id,
        listing_type: item.type,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        guests: Number(form.guests) || 1,
        notes: form.notes,
      });
      const bookingId = data.booking.id;
      const orderRes = await createPaymentOrder({ flow: 'booking_commission', reference_id: bookingId });
      if (orderRes.mock) {
        // Open dummy modal
        setPayModal({
          amount: orderRes.amount,
          order: orderRes.order,
          description: `platform fee — ${item.title}`,
          bookingId,
        });
      } else {
        await payWithRazorpay({
          order: orderRes.order,
          key_id: orderRes.key_id,
          flow: 'booking_commission',
          reference_id: bookingId,
          description: `₹1 platform fee — ${item.title}`,
          prefill: { contact: user.phone, name: user.name },
        });
        setMsg(t('booking.success'));
        setTimeout(() => nav('/dashboard'), 1200);
      }
    } catch (e) {
      setMsg(e?.response?.data?.detail || e.message || 'Failed');
    } finally { setBusy(false); }
  };

  const finishMockPayment = async () => {
    if (!payModal) return;
    const res = await completeMockPayment({
      order_id: payModal.order.id,
      flow: 'booking_commission',
      reference_id: payModal.bookingId,
    });
    setPayModal(null);
    // Show confirmation
    setConfirm({ open: true, data: res.record });
  };

  if (loading) return <div className="mx-auto max-w-5xl p-10 text-ink-soft">{t('common.loading')}</div>;
  if (!item) return <div className="mx-auto max-w-5xl p-10">Not found.</div>;

  const unit = item.type === 'homestay' ? t('common.per_night') : item.type === 'driver' ? t('common.per_day') : '';
  const cta = CTA_CONFIG[item.type] || CTA_CONFIG.spot;
  const CtaIcon = cta.Icon;

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 md:py-8 pb-28 md:pb-8">
      <button onClick={() => nav(-1)} data-testid="detail-back" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft mb-4">
        <ArrowLeft size={16} /> {t('common.back')}
      </button>

      <div className="grid lg:grid-cols-5 gap-6 md:gap-8">
        <div className="lg:col-span-3">
          <div className="rounded-2xl md:rounded-3xl overflow-hidden bg-mist aspect-[4/3] relative">
            {item.image && <img src={item.image} alt={item.title} className="w-full h-full object-cover" />}
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={() => setLiked(!liked)} data-testid="detail-like" aria-label="Save"
                className="w-10 h-10 rounded-full bg-white/95 backdrop-blur grid place-items-center btn-hover">
                <Heart size={18} className={liked ? 'fill-flag text-flag' : 'text-ink'} />
              </button>
              <button onClick={shareIt} data-testid="detail-share" aria-label="Share"
                className="w-10 h-10 rounded-full bg-white/95 backdrop-blur grid place-items-center btn-hover">
                <Share2 size={18} className="text-ink" />
              </button>
            </div>
          </div>
          <div className="mt-5 md:mt-6">
            <span className="chip capitalize">{t(`categories.${item.type}`)}</span>
            <h1 className="mt-3 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight" data-testid="listing-title">{item.title}</h1>
            <p className="mt-2 text-sm md:text-base text-ink-soft flex items-center gap-1"><MapPin size={14} /> {item.location}</p>
            <p className="mt-4 md:mt-5 text-ink leading-relaxed">{item.description}</p>
            {item.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {item.tags.map((tg) => <span key={tg} className="chip"><Tag size={11} className="mr-1" /> {tg}</span>)}
              </div>
            )}

            {/* Quick action buttons */}
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button onClick={openMaps} data-testid="detail-directions"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-sm btn-hover">
                <Navigation size={15} /> {t('cta.get_directions')}
              </button>
              {item.type === 'driver' && (
                <a href={`tel:${item.location?.replace(/\D/g, '') || ''}`} data-testid="detail-call"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-pine text-white font-bold text-sm btn-hover">
                  <Phone size={15} /> {t('cta.call_now')}
                </a>
              )}
              {(item.type === 'shop' || item.type === 'cafe') && (
                <button className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-sm btn-hover">
                  <MessageCircle size={15} /> {t('cta.contact_provider')}
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="lg:col-span-2">
          <div className="mist-panel p-5 md:p-7 lg:sticky lg:top-24">
            {item.price > 0 && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-ink-soft">{t('common.starting_from')}</div>
                <div className="font-display font-extrabold text-3xl md:text-4xl text-ink">₹{item.price}<span className="text-base md:text-lg text-ink-soft font-semibold">{unit}</span></div>
              </div>
            )}

            {bookable ? (
              <div className="space-y-3">
                {item.type === 'homestay' && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-ink-soft">{t('booking.checkin')}</span>
                      <input type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                        data-testid="booking-checkin" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] outline-none text-sm" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-ink-soft">{t('booking.checkout')}</span>
                      <input type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                        data-testid="booking-checkout" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] outline-none text-sm" />
                    </label>
                  </div>
                )}
                <label className="block">
                  <span className="text-xs font-semibold text-ink-soft">{t('booking.guests')}</span>
                  <input type="number" min="1" value={form.guests} onChange={(e) => setForm({ ...form, guests: e.target.value })}
                    data-testid="booking-guests" className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-ink-soft">{t('booking.notes')}</span>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    data-testid="booking-notes" rows="3" className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] outline-none" />
                </label>

                <p className="text-xs text-ink-soft">{t('booking.fee_note')}</p>
                <button onClick={doBook} disabled={busy} data-testid="booking-submit"
                  className={`w-full py-3 rounded-full font-bold btn-hover disabled:opacity-60 inline-flex items-center justify-center gap-2 ${cta.color}`}>
                  <CtaIcon size={18} /> {busy ? t('common.loading') : (item.type === 'driver' ? t('cta.talk_to_driver') : t('cta.book_now'))}
                </button>
                {msg && <p data-testid="booking-msg" className="text-sm text-center mt-2 text-pine font-semibold">{msg}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-ink-soft">
                  {item.type === 'event' || item.type === 'biodiversity' || item.type === 'spot'
                    ? 'This entry is informational. Visit responsibly.'
                    : 'Contact the seller through the location details above.'}
                </p>
                <button onClick={openMaps} data-testid="info-cta"
                  className={`w-full py-3 rounded-full font-bold btn-hover inline-flex items-center justify-center gap-2 ${cta.color}`}>
                  <CtaIcon size={18} /> {t(`cta.${cta.key}`)}
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Sticky bottom bar (mobile) */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 px-4 pb-3">
        <div className="mx-auto max-w-md bg-white rounded-2xl border border-[var(--line)] shadow-[0_-8px_24px_-8px_rgba(20,32,26,0.18)] p-2.5 flex items-center gap-2">
          {item.price > 0 && (
            <div className="pl-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft leading-none">From</div>
              <div className="font-display font-extrabold text-lg text-ink leading-tight">₹{item.price}<span className="text-[10px] text-ink-soft font-semibold">{unit}</span></div>
            </div>
          )}
          <button
            onClick={bookable ? doBook : openMaps}
            disabled={busy}
            data-testid="mobile-sticky-cta"
            className={`ml-auto flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-full font-extrabold btn-hover ${cta.color}`}
          >
            <CtaIcon size={16} /> {bookable ? (item.type === 'driver' ? t('cta.talk_to_driver') : t('cta.book_now')) : t(`cta.${cta.key}`)}
          </button>
        </div>
      </div>

      {/* Mock Payment Modal */}
      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title="Confirm booking payment"
        description={payModal?.description || ''}
        onPay={finishMockPayment}
        prefill={{ upi: `${(user?.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />

      {/* Booking Confirmation */}
      <BookingConfirmation
        open={!!confirm?.open}
        onClose={() => { setConfirm(null); nav('/dashboard'); }}
        mode="booking"
        data={confirm?.data}
        onView={() => { setConfirm(null); nav('/dashboard'); }}
      />
    </div>
  );
}
