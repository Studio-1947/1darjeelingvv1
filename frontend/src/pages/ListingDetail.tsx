import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { amenitiesFor } from '@/lib/listingMeta';
import { contentFor, listingImage, galleryImagesFor, personImageFor, fallbackFor } from '@/lib/listingContent';
import SmartImg from '@/components/SmartImg';
import MapEmbed from '@/components/MapEmbed';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import {
  MapPin, Tag, ArrowLeft, Phone, Share2, Heart, Store, Coffee, Ticket,
  Leaf, Mountain, Navigation, ArrowRight, BadgeCheck, Languages, ChevronDown,
  CalendarClock, Route, Crosshair,
} from 'lucide-react';

// The site header is sticky (h-14 mobile / h-16 desktop), so a "full screen"
// section is the viewport minus that, or each one would sit past the fold.
const SCREEN_H = 'min-h-[calc(100svh-3.5rem)] md:min-h-[calc(100svh-4rem)]';

/** Full-viewport section with a centred column. Each part gets its own screen. */
function Screen({ tone = 'bg', wide = false, children, testid }: { tone?: 'bg' | 'white' | 'mist', wide?: boolean, children: React.ReactNode, testid?: string }) {
  const bg = tone === 'white' ? 'bg-white' : tone === 'mist' ? 'bg-mist' : 'bg-[var(--bg)]';
  return (
    <section data-testid={testid} className={`${SCREEN_H} flex items-center ${bg}`}>
      <div className={`mx-auto w-full px-4 md:px-8 py-20 md:py-24 ${wide ? 'max-w-6xl' : 'max-w-4xl'}`}>{children}</div>
    </section>
  );
}

/** Centred section header: eyebrow, title, optional note. */
function SectionHead({ label, title, note }: { label: string, title: string, note?: string }) {
  return (
    <div className="text-center max-w-3xl mx-auto">
      <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-soft">
        {label}
      </div>
      <h2 className="mt-5 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{title}</h2>
      {note && <p className="mt-3 text-ink-soft">{note}</p>}
    </div>
  );
}

/** Real photo if it loads, otherwise the branded initial — never a broken face. */
function Avatar({ photo, initial }: { photo?: string, initial: string }) {
  const [failed, setFailed] = useState(false);
  const base = 'w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden mx-auto shadow-lg ring-4 ring-white';
  if (!photo || failed) {
    return (
      <div className={`${base} bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-6xl md:text-7xl`}>
        {initial}
      </div>
    );
  }
  return <img src={photo} alt="" onError={() => setFailed(true)} className={`${base} object-cover`} />;
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
  const heroRef = useRef<HTMLElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get(`/listings/${id}`).then((r) => setItem(r.data.item)).finally(() => setLoading(false));
  }, [id]);

  // On landing, only the hero image shows; then the title block rises up from
  // below into place on its own. The page scrolls normally throughout.
  useEffect(() => {
    if (loading || !item) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        heroContentRef.current,
        { yPercent: 55, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, duration: 1.1, delay: 0.35, ease: 'power3.out' },
      );
    }, heroRef);
    return () => ctx.revert();
  }, [loading, item]);

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
    if (item.type === 'homestay') {
      if (!form.check_in || !form.check_out) {
        setMsg('Check-in and check-out dates are required');
        return;
      }
      if (new Date(form.check_out) <= new Date(form.check_in)) {
        setMsg('Check-out date must be after check-in date');
        return;
      }
    }
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
  const c = contentFor(item);
  const initial = (item.title || '?').trim().charAt(0).toUpperCase();
  const fallbackImg = fallbackFor(item.type);
  const handleBack = () => {
    if (window.history.state && window.history.state.idx > 0) {
      nav(-1);
    } else {
      nav('/');
    }
  };

  const heroSrc = listingImage(item, 2000, 1200);
  const gallery = galleryImagesFor(item);
  const personSrc = personImageFor(item);

  return (
    <div className="pb-28 lg:pb-0">
      {/* ============ HERO — full screen ============ */}
      <section ref={heroRef} className={`relative ${SCREEN_H} h-[calc(100svh-3.5rem)] md:h-[calc(100svh-4rem)] w-full overflow-hidden bg-mist`} data-testid="detail-hero">
        <SmartImg src={heroSrc} fallback={fallbackImg} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/45" />

        <button onClick={handleBack} data-testid="detail-back"
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

        {/* Left-aligned hero content */}
        <div ref={heroContentRef} style={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-start justify-center text-left px-4 md:px-8 lg:px-16">
          <span className="chip bg-white/90 capitalize">{t(`categories.${item.type}`)}</span>
          <h1 className="mt-5 font-display font-extrabold text-5xl sm:text-6xl md:text-8xl text-white leading-[0.95] max-w-4xl"
            data-testid="listing-title">{item.title}</h1>
          <div className="mt-5 flex flex-wrap justify-start items-center gap-x-6 gap-y-2 text-white/90 text-base md:text-lg font-semibold">
            <span className="flex items-center gap-1.5"><MapPin size={18} /> {item.location}</span>
            {item.price > 0 && (
              <span className="flex items-center gap-1.5">
                ₹{item.price}<span className="font-normal text-white/75">{unit || ` ${t('detail.onwards')}`}</span>
              </span>
            )}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-6 hidden md:flex justify-center text-white/70">
          <ChevronDown size={26} className="animate-bounce" />
        </div>
      </section>

      {/* ============ ABOUT — centred, detailed ============ */}
      <Screen tone="bg" testid="detail-about">
        <SectionHead label={t('detail.about')} title={item.title} />
        <p className="mt-8 text-lg md:text-xl text-ink leading-relaxed text-center max-w-3xl mx-auto">{c.about}</p>
        {item.tags?.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {item.tags.map((tg: string) => <span key={tg} className="chip"><Tag size={11} className="mr-1" /> {tg}</span>)}
          </div>
        )}
      </Screen>

      {/* ============ PHOTOS — gallery ============ */}
      {gallery.length > 0 && (
        <Screen tone="white" wide testid="detail-photos">
          <SectionHead label={t('detail.photos')} title={t('detail.photos')} note={t('detail.gallery_note')} />
          <div className="mt-10 grid sm:grid-cols-3 gap-4 md:gap-5">
            {gallery.map((src, i) => (
              <SmartImg key={src + i} src={src} fallback={fallbackImg} alt={`${item.title} ${i + 1}`}
                className="w-full aspect-[4/3] object-cover rounded-2xl border border-[var(--line)]" />
            ))}
          </div>
        </Screen>
      )}

      {/* ============ WHAT THIS PLACE OFFERS (not for wildlife/flora) ============ */}
      {item.type !== 'biodiversity' && amenities.length > 0 && (
        <Screen tone="mist" wide testid="detail-offers">
          <SectionHead label={t('detail.offers')} title={t('detail.offers')} />
          <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 max-w-4xl mx-auto">
            {amenities.map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--line)] bg-white">
                <Icon size={24} className="text-pine flex-shrink-0" />
                <span className="text-ink font-semibold">{label}</span>
              </div>
            ))}
          </div>
        </Screen>
      )}

      {/* ============ MEET YOUR HOST (homestay) ============ */}
      {item.type === 'homestay' && (
        <Screen tone="bg" testid="detail-host">
          <SectionHead label={t('detail.host')} title={t('detail.host')} />
          <div className="mt-10 text-center max-w-2xl mx-auto">
            <Avatar photo={personSrc} initial={initial} />
            <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
              <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{item.title}</span>
              <span className="chip bg-white"><BadgeCheck size={12} className="mr-1" /> {t('detail.verified')}</span>
            </div>
            <p className="mt-2 text-sm text-ink-soft flex items-center justify-center gap-1.5"><MapPin size={13} /> {item.location}</p>
            <p className="mt-6 text-lg text-ink leading-relaxed">{c.about}</p>
            <p className="mt-5 text-ink-soft flex items-center justify-center gap-2">
              <Languages size={18} className="text-pine" /> {t('detail.speaks')}: Nepali, Hindi, English
            </p>
          </div>
        </Screen>
      )}

      {/* ============ MEET YOUR DRIVER (driver) ============ */}
      {item.type === 'driver' && (
        <Screen tone="bg" testid="detail-driver">
          <SectionHead label={t('detail.meet_driver')} title={t('detail.meet_driver')} />
          <div className="mt-10 text-center max-w-2xl mx-auto">
            <Avatar photo={personSrc} initial={initial} />
            <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
              <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{item.title}</span>
              <span className="chip bg-white"><BadgeCheck size={12} className="mr-1" /> {t('detail.verified')}</span>
            </div>
            <p className="mt-6 text-lg text-ink leading-relaxed">{c.about}</p>
          </div>
        </Screen>
      )}

      {/* ============ BEST TIME TO VISIT (festivals) ============ */}
      {item.type === 'event' && c.bestTime && (
        <Screen tone="white" testid="detail-besttime">
          <SectionHead label={t('detail.best_time')} title={t('detail.best_time')} />
          <div className="mt-10 mx-auto max-w-xl rounded-3xl border border-[var(--line)] bg-[var(--bg)] p-8 text-center">
            <CalendarClock size={40} className="text-pine mx-auto" />
            <p className="mt-4 text-xl md:text-2xl font-display font-bold text-ink leading-snug">{c.bestTime}</p>
          </div>
        </Screen>
      )}

      {/* ============ DRIVER ROUTES (instead of a location map) ============ */}
      {item.type === 'driver' && c.routes && c.routes.length > 0 && (
        <Screen tone="mist" testid="detail-routes">
          <SectionHead label={t('detail.routes')} title={t('detail.routes')} note={t('detail.routes_note')} />
          <div className="mt-10 mx-auto max-w-2xl space-y-3">
            {c.routes.map((r, i) => (
              <div key={i} className="flex items-start gap-4 p-5 rounded-2xl border border-[var(--line)] bg-white text-left">
                <Route size={22} className="text-pine flex-shrink-0 mt-0.5" />
                <span className="text-ink font-semibold">{r}</span>
              </div>
            ))}
          </div>
        </Screen>
      )}

      {/* ============ WHERE YOU'LL BE / SPOTTED LOCATIONS (real map) ============ */}
      {item.type !== 'driver' && (
        <Screen tone="bg" wide testid={item.type === 'biodiversity' ? 'detail-spotted' : 'detail-location'}>
          {item.type === 'biodiversity'
            ? <SectionHead label={t('detail.spotted')} title={t('detail.spotted')} note={t('detail.spotted_note')} />
            : <SectionHead label={t('detail.location')} title={t('detail.location')} />}

          <div className="mt-10 rounded-3xl border border-[var(--line)] overflow-hidden bg-white">
            <MapEmbed coords={c.coords!} title={item.location} className="w-full h-[42vh] min-h-[260px]" />
            <div className="p-6 md:p-8">
              {item.type === 'biodiversity' && c.spotted && c.spotted.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {c.spotted.map((s) => (
                    <span key={s} className="chip"><Crosshair size={12} className="mr-1" /> {s}</span>
                  ))}
                </div>
              ) : (
                <div className="font-display font-extrabold text-2xl text-ink text-center">{item.location}</div>
              )}
              <div className="mt-6 flex justify-center">
                <button onClick={openMaps} data-testid="detail-open-maps"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
                  <Navigation size={16} /> {t('cta.get_directions')} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </Screen>
      )}

      {/* ============ RESERVE (commercial types only) ============ */}
      {commercial && (
        <Screen tone="white" testid="detail-reserve">
          <SectionHead label={t('detail.reserve')}
            title={item.price > 0 ? `₹${item.price}${unit}` : t('detail.reserve')}
            note={bookable ? t('booking.fee_note') : t('detail.walk_in_note')} />

          <div className="mt-10 mx-auto max-w-xl">
            <div className="mist-panel p-6 md:p-8">
              {bookable ? (
                <div className="space-y-4">
                  {item.type === 'homestay' && (
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block text-left">
                        <span className="text-xs font-semibold text-ink-soft">{t('booking.checkin')}</span>
                        <input required type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                          data-testid="booking-checkin" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                      </label>
                      <label className="block text-left">
                        <span className="text-xs font-semibold text-ink-soft">{t('booking.checkout')}</span>
                        <input required type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                          data-testid="booking-checkout" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none text-sm" />
                      </label>
                    </div>
                  )}
                  <label className="block text-left">
                    <span className="text-xs font-semibold text-ink-soft">{t('booking.guests')}</span>
                    <input type="number" min="1" value={form.guests} onChange={(e) => setForm({ ...form, guests: Number(e.target.value) || 1 })}
                      data-testid="booking-guests" className="mt-1 w-full px-3 py-3 rounded-xl border border-[var(--line)] bg-white outline-none" />
                  </label>
                  <label className="block text-left">
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
        </Screen>
      )}

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
            className={`ml-auto flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-full font-extrabold btn-hover ${bookable ? cta.color : 'bg-pine text-white'}`}
          >
            {bookable
              ? <><CtaIcon size={16} /> {item.type === 'driver' ? t('cta.talk_to_driver') : t('cta.book_now')}</>
              : <><Navigation size={16} /> {t('cta.get_directions')}</>}
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
