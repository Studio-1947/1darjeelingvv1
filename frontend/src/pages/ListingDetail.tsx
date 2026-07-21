import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { amenitiesFor, hostFor } from '@/lib/listingMeta';
import { contentFor, galleryImagesFor, personImageFor, fallbackFor } from '@/lib/listingContent';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import DetailHero from '@/components/listing-detail/DetailHero';
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

/** Left-aligned section header (matches the hero): eyebrow, title, optional note. */
function SectionHead({ label, title, note }: { label: string, title: string, note?: string }) {
  return (
    <div className="text-left max-w-3xl">
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
  const base = 'w-36 h-36 md:w-44 md:h-44 rounded-full overflow-hidden shadow-lg ring-4 ring-white';
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
  const nav = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const booking = useBookingFlow(item, id);

  useEffect(() => {
    api.get(`/listings/${id}`).then((r) => setItem(r.data.item)).finally(() => setLoading(false));
  }, [id]);

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
    try { await navigator.clipboard.writeText(url); booking.setMsg('Link copied!'); setTimeout(() => booking.setMsg(''), 1500); } catch (e) { console.warn('clipboard failed', e); }
  };

  if (loading) return <div className="mx-auto max-w-5xl p-10 text-ink-soft">{t('common.loading')}</div>;
  if (!item) return <div className="mx-auto max-w-5xl p-10">Not found.</div>;

  const bookable = item.type === 'homestay' || item.type === 'driver';
  // Types that trade — everything else (spots, events, biodiversity) is informational.
  const commercial = ['homestay', 'driver', 'shop', 'cafe'].includes(item.type);

  const unit = item.type === 'homestay' ? t('common.per_night') : item.type === 'driver' ? t('common.per_day') : '';
  const cta = ctaFor(item.type);
  const amenities = amenitiesFor(item);
  const host = hostFor(item);
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
  const personSrc = host.avatar || personImageFor(item);

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

      <AboutSection item={item} about={c.about} />

      {gallery.length > 0 && <PhotosSection item={item} gallery={gallery} fallbackImg={fallbackImg} />}

      {amenities.length > 0 && <OffersSection amenities={amenities} />}

      {/* ============ ABOUT — detailed ============ */}
      <Screen tone="bg" testid="detail-about">
        <SectionHead label={t('detail.about')} title={item.title} />
        <p className="mt-8 text-lg md:text-xl text-ink leading-relaxed max-w-3xl">{c.about}</p>
        {item.tags?.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-start gap-2">
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
          <div className="mt-10 text-left max-w-2xl">
            <Avatar photo={personSrc} initial={initial} />
            <div className="mt-6 flex items-center justify-start gap-2 flex-wrap">
              <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{item.title}</span>
              <span className="chip bg-white"><BadgeCheck size={12} className="mr-1" /> {t('detail.verified')}</span>
            </div>
            <p className="mt-2 text-sm text-ink-soft flex items-center justify-start gap-1.5"><MapPin size={13} /> {item.location}</p>
            <p className="mt-6 text-lg text-ink leading-relaxed">{c.about}</p>
            <p className="mt-5 text-ink-soft flex items-center justify-start gap-2">
              <Languages size={18} className="text-pine" /> {t('detail.speaks')}: Nepali, Hindi, English
            </p>
          </div>
        </Screen>
      )}

      {/* ============ MEET YOUR DRIVER (driver) ============ */}
      {item.type === 'driver' && (
        <Screen tone="bg" testid="detail-driver">
          <SectionHead label={t('detail.meet_driver')} title={t('detail.meet_driver')} />
          <div className="mt-10 text-left max-w-2xl">
            <Avatar photo={personSrc} initial={initial} />
            <div className="mt-6 flex items-center justify-start gap-2 flex-wrap">
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
          <div className="mt-10 max-w-xl rounded-3xl border border-[var(--line)] bg-[var(--bg)] p-8 text-left">
            <CalendarClock size={40} className="text-pine" />
            <p className="mt-4 text-xl md:text-2xl font-display font-bold text-ink leading-snug">{c.bestTime}</p>
          </div>
        </Screen>
      )}

      {/* ============ DRIVER ROUTES (instead of a location map) ============ */}
      {item.type === 'driver' && c.routes && c.routes.length > 0 && (
        <Screen tone="mist" testid="detail-routes">
          <SectionHead label={t('detail.routes')} title={t('detail.routes')} note={t('detail.routes_note')} />
          <div className="mt-10 max-w-2xl space-y-3">
            {c.routes.map((r, i) => (
              <div key={i} className="flex items-start gap-4 p-5 rounded-2xl border border-[var(--line)] bg-white text-left">
                <Route size={22} className="text-pine flex-shrink-0 mt-0.5" />
                <span className="text-ink font-semibold">{r}</span>
              </div>
            ))}
          </div>
        </Screen>
      )}

      {item.type !== 'driver' && (
        <Screen tone="bg" wide testid={item.type === 'biodiversity' ? 'detail-spotted' : 'detail-location'}>
          {item.type === 'biodiversity'
            ? <SectionHead label={t('detail.spotted')} title={t('detail.spotted')} note={t('detail.spotted_note')} />
            : <SectionHead label={t('detail.location')} title={t('detail.location')} />}

          <div className="mt-10 rounded-3xl border border-[var(--line)] overflow-hidden bg-white">
            <MapEmbed coords={c.coords!} title={item.location} className="w-full h-[42vh] min-h-[260px]" />
            <div className="p-6 md:p-8">
              {item.type === 'biodiversity' && c.spotted && c.spotted.length > 0 ? (
                <div className="flex flex-wrap justify-start gap-2">
                  {c.spotted.map((s) => (
                    <span key={s} className="chip"><Crosshair size={12} className="mr-1" /> {s}</span>
                  ))}
                </div>
              ) : (
                <div className="font-display font-extrabold text-2xl text-ink text-left">{item.location}</div>
              )}
              <div className="mt-6 flex justify-start">
                <button onClick={openMaps} data-testid="detail-open-maps"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
                  <Navigation size={16} /> {t('cta.get_directions')} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </Screen>
      )}

      {commercial && (
        <Screen tone="white" testid="detail-reserve">
          <SectionHead label={t('detail.reserve')}
            title={item.price > 0 ? `₹${item.price}${unit}` : t('detail.reserve')}
            note={bookable ? t('booking.fee_note') : t('detail.walk_in_note')} />

          <div className="mt-10 max-w-xl">
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

      <MobileStickyBar item={item} unit={unit} bookable={bookable} cta={cta} busy={booking.busy}
        onBook={booking.doBook} onOpenMaps={openMaps} />

      <MockPaymentModal
        open={!!booking.payModal}
        onClose={() => booking.setPayModal(null)}
        amount={booking.payModal?.amount || 0}
        title="Confirm booking payment"
        description={booking.payModal?.description || ''}
        onPay={booking.finishMockPayment}
        prefill={{ upi: `${(booking.user?.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
      <BookingConfirmation
        open={!!booking.confirm?.open}
        onClose={() => { booking.setConfirm(null); nav('/dashboard'); }}
        mode="booking"
        data={booking.confirm?.data}
        onView={() => { booking.setConfirm(null); nav('/dashboard'); }}
      />
    </div>
  );
}
