import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { amenitiesFor, hostFor, areaNoteFor } from '@/lib/listingMeta';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import {
  MapPin, Tag, ArrowLeft, Phone, Share2, Heart, MessageCircle, Store, Coffee, Ticket,
  Leaf, Mountain, Navigation, ArrowRight, BadgeCheck, Languages, Info, ChevronDown,
} from 'lucide-react';

// The site header is sticky (h-14 mobile / h-16 desktop), so a "full screen"
// section is the viewport minus that, or each one would sit past the fold.
const SCREEN_H = 'min-h-[calc(100svh-3.5rem)] md:min-h-[calc(100svh-4rem)]';

/** Full-viewport section. Every part of the listing gets a screen of its own. */
function Screen({ tone = 'bg', children, testid }: { tone?: 'bg' | 'white' | 'mist', children: React.ReactNode, testid?: string }) {
  const bg = tone === 'white' ? 'bg-white' : tone === 'mist' ? 'bg-mist' : 'bg-[var(--bg)]';
  return (
    <section data-testid={testid} className={`${SCREEN_H} flex items-center ${bg}`}>
      <div className="mx-auto max-w-6xl w-full px-4 md:px-8 py-20 md:py-24">{children}</div>
    </section>
  );
}

function Eyebrow({ n, children }: { n: string, children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-soft">
      <span className="text-pine">{n}</span>
      <span className="w-8 h-px bg-[var(--line)]" />
      {children}
    </div>
  );
}

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
  // Types that trade — everything else (spots, events, biodiversity) is informational.
  const commercial = item && ['homestay', 'driver', 'shop', 'cafe'].includes(item.type);

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
  const amenities = amenitiesFor(item);
  const host = hostFor(item);
  const priceLabel = item.type === 'shop' || item.type === 'cafe' ? t('detail.avg_spend') : t('common.starting_from');

  // Section numbering runs across whichever sections this listing type shows.
  let step = 0;
  const nextStep = () => String(++step).padStart(2, '0');

  return (
    <div className="pb-28 lg:pb-0">
      {/* ============ 01 · HERO — full screen ============ */}
      <section className={`relative ${SCREEN_H} h-[calc(100svh-3.5rem)] md:h-[calc(100svh-4rem)] w-full overflow-hidden bg-mist`} data-testid="detail-hero">
        {item.image && <img src={item.image} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/45" />

        <button onClick={() => nav(-1)} data-testid="detail-back"
          className="absolute top-4 left-4 md:top-6 md:left-8 inline-flex items-center gap-2 pl-3 pr-4 py-2.5 rounded-full bg-white/95 backdrop-blur text-sm font-bold text-ink btn-hover">
          <ArrowLeft size={16} /> {t('common.back')}
        </button>

        <div className="absolute top-4 right-4 md:top-6 md:right-8 flex gap-2">
          <button onClick={() => setLiked(!liked)} data-testid="detail-like" aria-label={t('common.save')}
            className="w-11 h-11 rounded-full bg-white/95 backdrop-blur grid place-items-center btn-hover">
            <Heart size={18} className={liked ? 'fill-flag text-flag' : 'text-ink'} />
          </button>
          <button onClick={shareIt} data-testid="detail-share" aria-label="Share"
            className="w-11 h-11 rounded-full bg-white/95 backdrop-blur grid place-items-center btn-hover">
            <Share2 size={18} className="text-ink" />
          </button>
        </div>

        <div className="absolute inset-x-0 bottom-0">
          <div className="mx-auto max-w-6xl px-4 md:px-8 pb-28 md:pb-20">
            <span className="chip bg-white/90 capitalize">{t(`categories.${item.type}`)}</span>
            <h1 className="mt-4 font-display font-extrabold text-5xl sm:text-6xl md:text-8xl text-white leading-[0.95] max-w-4xl"
              data-testid="listing-title">{item.title}</h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-white/90 text-base md:text-lg font-semibold">
              <span className="flex items-center gap-1.5"><MapPin size={18} /> {item.location}</span>
              {item.price > 0 && (
                <span className="flex items-center gap-1.5">
                  ₹{item.price}<span className="font-normal text-white/75">{unit || ` ${t('detail.onwards')}`}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-6 hidden md:flex justify-center text-white/70">
          <ChevronDown size={26} className="animate-bounce" />
        </div>
      </section>

      {/* ============ ABOUT — full screen ============ */}
      <Screen tone="bg" testid="detail-about">
        <Eyebrow n={nextStep()}>{t('detail.about')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3">
            <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
              {item.title}
            </h2>
            <p className="mt-6 text-lg md:text-xl text-ink leading-relaxed">{item.description}</p>
            {item.tags?.length > 0 && (
              <div className="mt-7 flex flex-wrap gap-2">
                {item.tags.map((tg: string) => <span key={tg} className="chip"><Tag size={11} className="mr-1" /> {tg}</span>)}
              </div>
            )}
          </div>

          <div className="lg:col-span-2 mist-panel p-6 md:p-7 w-full">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-pine mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-xs uppercase tracking-widest text-ink-soft font-bold">{t('detail.location')}</div>
                  <div className="text-ink font-semibold">{item.location}</div>
                </div>
              </div>
              {item.price > 0 && (
                <div className="flex items-start gap-3">
                  <Tag size={18} className="text-pine mt-0.5 flex-shrink-0" />
                  <div>
                    <div className="text-xs uppercase tracking-widest text-ink-soft font-bold">{priceLabel}</div>
                    <div className="text-ink font-semibold">₹{item.price}{unit}</div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2.5">
              <button onClick={openMaps} data-testid="detail-directions"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-sm btn-hover">
                <Navigation size={15} /> {t('cta.get_directions')}
              </button>
              {item.type === 'driver' && host.phone && (
                <a href={`tel:${host.phone.replace(/\D/g, '')}`} data-testid="detail-call"
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
      </Screen>

      {/* ============ WHAT THIS PLACE OFFERS — full screen ============ */}
      {amenities.length > 0 && (
        <Screen tone="white" testid="detail-offers">
          <Eyebrow n={nextStep()}>{t('detail.offers')}</Eyebrow>
          <h2 className="mt-8 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight max-w-2xl">
            {t('detail.offers')}
          </h2>
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {amenities.map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
                <Icon size={24} className="text-pine flex-shrink-0" />
                <span className="text-ink font-semibold">{label}</span>
              </div>
            ))}
          </div>
        </Screen>
      )}

      {/* ============ MEET YOUR HOST (homestays) — full screen ============ */}
      {item.type === 'homestay' && (
        <Screen tone="mist" testid="detail-host">
          <Eyebrow n={nextStep()}>{t('detail.host')}</Eyebrow>
          <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
            <div className="lg:col-span-2">
              <div className="w-32 h-32 md:w-44 md:h-44 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-6xl md:text-7xl">
                {host.initial}
              </div>
              <div className="mt-6 flex items-center gap-2 flex-wrap">
                <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{host.name}</span>
                {host.verified && (
                  <span className="chip bg-white"><BadgeCheck size={12} className="mr-1" /> {t('detail.verified')}</span>
                )}
              </div>
              <p className="mt-1.5 text-sm text-ink-soft flex items-center gap-1.5"><MapPin size={13} /> {item.location}</p>
            </div>

            <div className="lg:col-span-3">
              <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
                {t('detail.host')}
              </h2>
              <p className="mt-6 text-lg md:text-xl text-ink leading-relaxed">{host.bio}</p>
              <p className="mt-6 text-ink-soft flex items-center gap-2">
                <Languages size={18} className="text-pine" /> {t('detail.speaks')}: {host.languages.join(', ')}
              </p>
              {host.phone && (
                <a href={`tel:${host.phone}`} data-testid="detail-host-call"
                  className="mt-7 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
                  <Phone size={16} /> {t('cta.contact_provider')}
                </a>
              )}
            </div>
          </div>
        </Screen>
      )}

      {/* ============ WHERE YOU'LL BE — full screen ============ */}
      <Screen tone="bg" testid="detail-location">
        <Eyebrow n={nextStep()}>{t('detail.location')}</Eyebrow>
        <h2 className="mt-8 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight max-w-2xl">
          {t('detail.location')}
        </h2>
        <div className="mt-10 rounded-3xl border border-[var(--line)] overflow-hidden">
          {/* Contour-style placeholder — the listing model carries no coordinates yet */}
          <div className="relative h-[38vh] min-h-[220px] bg-mist grain">
            <div className="absolute inset-0 opacity-[0.5] bg-[radial-gradient(circle_at_30%_40%,transparent_0,transparent_38px,var(--line)_39px,var(--line)_40px,transparent_41px),radial-gradient(circle_at_70%_65%,transparent_0,transparent_58px,var(--line)_59px,var(--line)_60px,transparent_61px)]" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="w-16 h-16 rounded-full bg-flag text-white grid place-items-center shadow-lg">
                <MapPin size={28} />
              </div>
            </div>
          </div>
          <div className="p-6 md:p-8 bg-white flex flex-col md:flex-row md:items-end md:justify-between gap-5">
            <div>
              <div className="font-display font-extrabold text-2xl text-ink">{item.location}</div>
              <p className="mt-2 text-ink-soft leading-relaxed flex items-start gap-2 max-w-xl">
                <Info size={15} className="mt-1 flex-shrink-0" /> {areaNoteFor(item.type)}
              </p>
            </div>
            <button onClick={openMaps} data-testid="detail-open-maps"
              className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
              <Navigation size={16} /> {t('cta.get_directions')} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </Screen>

      {/* ============ PRICE / BOOKING — full screen ============ */}
      <Screen tone="white" testid="detail-price">
        <Eyebrow n={nextStep()}>{commercial ? priceLabel : t('cta.explore')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-2">
            {commercial && item.price > 0 ? (
              <>
                <div className="text-xs uppercase tracking-widest text-ink-soft font-bold">{priceLabel}</div>
                <div className="mt-2 font-display font-extrabold text-6xl md:text-7xl text-ink leading-none">
                  ₹{item.price}
                  <span className="block mt-2 text-lg md:text-xl text-ink-soft font-semibold">{unit || t('detail.onwards')}</span>
                </div>
              </>
            ) : (
              <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
                {item.title}
              </h2>
            )}
            <p className="mt-6 text-ink-soft leading-relaxed max-w-md">
              {bookable ? t('booking.fee_note') : commercial ? t('detail.walk_in_note') : t('detail.info_note')}
            </p>
          </div>

          <div className="lg:col-span-3">
            <div className="mist-panel p-6 md:p-8">
              {bookable ? (
                <div className="space-y-4">
                  {item.type === 'homestay' && (
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <span className="text-xs font-semibold text-ink-soft">{t('booking.checkin')}</span>
                        <input type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                          data-testid="booking-checkin" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-semibold text-ink-soft">{t('booking.checkout')}</span>
                        <input type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                          data-testid="booking-checkout" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                      </label>
                    </div>
                  )}
                  <label className="block">
                    <span className="text-xs font-semibold text-ink-soft">{t('booking.guests')}</span>
                    <input type="number" min="1" value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) || 1 })}
                      data-testid="booking-guests" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-ink-soft">{t('booking.notes')}</span>
                    <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      data-testid="booking-notes" rows={3} className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none" />
                  </label>

                  <button onClick={doBook} disabled={busy} data-testid="booking-submit"
                    className={`w-full py-4 rounded-full font-bold btn-hover disabled:opacity-60 inline-flex items-center justify-center gap-2 ${cta.color}`}>
                    <CtaIcon size={18} /> {busy ? t('common.loading') : (item.type === 'driver' ? t('cta.talk_to_driver') : t('cta.book_now'))}
                  </button>
                  {msg && <p data-testid="booking-msg" className="text-sm text-center text-pine font-semibold">{msg}</p>}
                </div>
              ) : (
                <button onClick={openMaps} data-testid="info-cta"
                  className={`w-full py-4 rounded-full font-bold btn-hover inline-flex items-center justify-center gap-2 ${cta.color}`}>
                  <CtaIcon size={18} /> {t(`cta.${cta.key}`)}
                </button>
              )}
            </div>
          </div>
        </div>
      </Screen>

      {/* Sticky bottom bar (mobile) */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 px-4 pb-3">
        <div className="mx-auto max-w-md bg-white rounded-2xl border border-[var(--line)] shadow-[0_-8px_24px_-8px_rgba(20,32,26,0.18)] p-2.5 flex items-center gap-2">
          {item.price > 0 && (
            <div className="pl-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft leading-none">{t('common.starting_from')}</div>
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
