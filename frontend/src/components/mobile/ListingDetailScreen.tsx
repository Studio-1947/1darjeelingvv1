import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft, Heart, ShareNetwork as Share2, MapPin, Tag, Translate as Languages,
  Path as Route, Clock, Ticket, Mountains as Mountain, Compass, Crosshair,
  NavigationArrow as Navigation, Phone, ChatCircle as MessageCircle, CalendarPlus,
  ArrowRight,
} from '@phosphor-icons/react';
import { useFavorites } from '@/context/FavoritesContext';
import { useLoginGate } from '@/components/LoginGate';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import MapEmbed from '@/components/MapEmbed';
import { optionLabel } from '@/lib/optionLabel';
import { listingImage } from '@/lib/listingContent';
import { todayStr, addDays, isBadRange } from '@/lib/dates';
import type { BookingFlow } from '@/components/listing-detail/useBookingFlow';
import type { ShareOutcome } from '@/lib/share';
import { MobilePhoto, Touch, PrimaryButton, Chip, Slab, MobileDetailReviews } from '@/components/mobile';

const BOOKING_FEE = 1;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-[family-name:var(--mu-font-display)] font-black text-xl text-[var(--mu-ink)]">{children}</h2>;
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-[var(--mu-r-card)] border border-[var(--mu-border)] bg-[var(--mu-surface)] p-4 ${className}`}>{children}</div>;
}

/**
 * Full mobile-styled rebuild of the listing detail + booking page (Phase 7),
 * matching RN's visual language while reusing every real hook/helper the
 * desktop tree in ListingDetail.tsx already computes - no new data fetching
 * or business logic lives here. Booking stays inline (not a separate route
 * like RN's book/[stayId].tsx) since editable dates/guests on this same page
 * is a real improvement over RN's search-param-only flow, not a gap to copy.
 */
export default function MobileListingDetailScreen({
  item, unit, bookable, contactable, cta, booking, onOpenMaps, onShare,
  amenities, host, c, spotInfo, isSpot, gallery, personSrc, driverSrc, offersTitle,
}: {
  item: any;
  unit: string;
  bookable: boolean;
  contactable: boolean;
  cta: { key: string; Icon: any; color: string };
  booking: BookingFlow;
  onOpenMaps: () => void;
  onShare: () => Promise<ShareOutcome>;
  amenities: { Icon: any; label: string }[];
  host: any;
  c: any;
  spotInfo: any;
  isSpot: boolean;
  gallery: string[];
  personSrc?: string;
  driverSrc: string;
  offersTitle: string;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useLoginGate();
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const liked = isFavorite(item.id);
  const isDriver = item.type === 'driver';
  const isBio = item.type === 'biodiversity';
  const isEvent = item.type === 'event';
  const CtaIcon = cta.Icon;

  const goBack = () => { if (loc.key === 'default') nav('/'); else nav(-1); };

  const handleLike = () => {
    if (!requireAuth('save')) return;
    toggle(item.id).catch(() => {});
  };

  const handleShare = async () => {
    if (!requireAuth('share')) return;
    const outcome = await onShare();
    if (outcome === 'copied' || outcome === 'failed') {
      setShareState(outcome);
      setTimeout(() => setShareState('idle'), outcome === 'copied' ? 1600 : 2400);
    }
  };

  const { form, updateForm, errors, busy, msg, doBook } = booking;
  const today = todayStr();
  const onCheckIn = (value: string) =>
    updateForm({ check_in: value, check_out: isBadRange(value, form.check_out) ? '' : form.check_out });
  const nights = form.check_in && form.check_out
    ? Math.round((Date.parse(form.check_out) - Date.parse(form.check_in)) / 86_400_000)
    : 0;
  const maxGuests = item.type === 'driver' ? (item.extras?.seats || 6) : (item.guests || item.extras?.capacity || 10);
  const isStay = item.type === 'homestay';
  const units = isStay ? Number(form.guests || 1) * Math.max(nights, 0) : 1;
  const stayTotal = (Number(item.price) || 0) * units;
  const needsDates = isStay && nights <= 0;

  const phone: string | null = item.provider_phone || null;
  const waNumber = phone ? phone.replace(/\D/g, '') : '';

  return (
    <div className="mobile-ui lg:hidden min-h-screen pb-[calc(var(--bottom-nav-h)+6rem)]" style={{ background: 'var(--mu-bg)', color: 'var(--mu-ink)' }}>
      {/* Hero */}
      <div className="relative w-full aspect-[4/5]">
        <MobilePhoto src={listingImage(item, 1000, 1250)} alt={item.title} radius="0" className="absolute inset-0 w-full h-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/35" />

        <div className="absolute inset-x-4 flex items-center justify-between" style={{ top: 'max(1rem, env(safe-area-inset-top))' }}>
          <Touch onClick={goBack} className="w-10 h-10 rounded-full bg-white/95 backdrop-blur flex items-center justify-center">
            <ArrowLeft size={17} className="text-[var(--mu-ink)]" />
          </Touch>
          <div className="flex items-center gap-2">
            <Touch onClick={handleLike} aria-pressed={liked} className="w-10 h-10 rounded-full bg-white/95 backdrop-blur flex items-center justify-center">
              <Heart size={17} weight={liked ? 'fill' : 'regular'} className={liked ? 'text-[var(--mu-danger)]' : 'text-[var(--mu-ink)]'} />
            </Touch>
            <Touch onClick={handleShare} className="w-10 h-10 rounded-full bg-white/95 backdrop-blur flex items-center justify-center">
              <Share2 size={17} className="text-[var(--mu-ink)]" />
            </Touch>
          </div>
        </div>
        {shareState !== 'idle' && (
          <span className="absolute top-16 right-4 px-3 py-1.5 rounded-full text-xs font-bold bg-white/95 text-[var(--mu-ink)]">
            {shareState === 'copied' ? t('detail.share_copied') : t('detail.share_failed')}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 px-[var(--mu-gutter)] pb-6">
          <span className="inline-block px-2.5 py-1 rounded-full bg-white/90 text-[10px] font-bold uppercase tracking-wide text-[var(--mu-ink)] capitalize">
            {t(`categories.${item.type}`)}
          </span>
          <h1 className="mt-2 font-[family-name:var(--mu-font-display)] font-black text-[28px] leading-[1.05] text-white">
            {item.title}
          </h1>
          {item.provider_verified && (
            <span className="mt-2 inline-flex rounded-full bg-white/90 p-0.5"><VerifiedBadge size="sm" /></span>
          )}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-white/90 text-sm font-semibold">
            <span className="flex items-center gap-1"><MapPin size={14} /> {item.location}</span>
            {item.price > 0 && (
              <span>₹{item.price}<span className="font-normal text-white/70">{unit || ` ${t('detail.onwards')}`}</span></span>
            )}
          </div>
        </div>
      </div>

      <div className="px-[var(--mu-gutter)]">
        {/* About */}
        <div className="mt-6">
          <SectionTitle>{isDriver ? t('detail.about_driver') : t('detail.about')}</SectionTitle>
          <p className="mt-2 text-sm text-[var(--mu-text-body)] leading-relaxed whitespace-pre-line">{c.about}</p>
          {item.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.tags.map((tg: string) => (
                <Chip key={tg}><Tag size={11} /> {optionLabel(t, tg)}</Chip>
              ))}
            </div>
          )}
        </div>

        {/* Highlights (spot) */}
        {isSpot && spotInfo.highlights.length > 0 && (
          <div className="mt-6">
            <SectionTitle>{t('detail.highlights')}</SectionTitle>
            <div className="mt-2.5 space-y-2">
              {spotInfo.highlights.map((h: string, i: number) => (
                <div key={i} className="flex items-start gap-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] p-3">
                  <Compass size={16} className="text-[var(--mu-green)] flex-shrink-0 mt-0.5" />
                  <span className="text-sm font-semibold text-[var(--mu-ink)]">{h}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {!isDriver && gallery.length > 0 && (
          <div className="mt-6">
            <SectionTitle>{t('detail.photos')}</SectionTitle>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {gallery.map((src, i) => (
                <MobilePhoto key={src + i} src={src} alt={`${item.title} ${i + 1}`} className="aspect-[4/3]" radius="var(--mu-r-tile-sm)" />
              ))}
            </div>
          </div>
        )}

        {/* Visit info (spot) */}
        {isSpot && spotInfo.has && (
          <div className="mt-6">
            <SectionTitle>{t('detail.plan_visit')}</SectionTitle>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {[
                { Icon: Clock, label: t('detail.timings'), value: spotInfo.timings },
                { Icon: Ticket, label: t('detail.entry_fee'), value: spotInfo.entryFee },
                { Icon: Clock, label: t('detail.best_time'), value: spotInfo.bestTime },
                { Icon: Mountain, label: t('detail.altitude'), value: spotInfo.altitude },
              ].filter((f) => f.value).map(({ Icon, label, value }) => (
                <Card key={label}>
                  <Icon size={18} className="text-[var(--mu-green)]" />
                  <div className="mt-2 text-[10px] font-bold uppercase tracking-wide text-[var(--mu-text-muted)]">{label}</div>
                  <div className="mt-0.5 font-[family-name:var(--mu-font-display)] font-bold text-sm text-[var(--mu-ink)]">{value}</div>
                </Card>
              ))}
            </div>
            {spotInfo.howToReach && (
              <Card className="mt-2.5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--mu-text-muted)]">
                  <Compass size={13} className="text-[var(--mu-green)]" /> {t('detail.how_to_reach')}
                </div>
                <p className="mt-1.5 text-sm text-[var(--mu-text-body)] leading-relaxed whitespace-pre-line">{spotInfo.howToReach}</p>
              </Card>
            )}
          </div>
        )}

        {/* Offers */}
        {item.type !== 'biodiversity' && !(isSpot && spotInfo.highlights.length > 0) && amenities.length > 0 && (
          <div className="mt-6">
            <SectionTitle>{offersTitle}</SectionTitle>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              {amenities.map(({ Icon, label }) => (
                <div key={label} className="flex items-center gap-2 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] p-3">
                  <Icon size={17} className="text-[var(--mu-green)] flex-shrink-0" />
                  <span className="text-xs font-semibold text-[var(--mu-ink)]">{optionLabel(t, label)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Host (homestay) */}
        {item.type === 'homestay' && (
          <div className="mt-6">
            <SectionTitle>{t('detail.host')}</SectionTitle>
            <Card className="mt-2.5 flex items-start gap-3">
              <MobilePhoto src={personSrc} alt={host.name} radius="var(--mu-r-avatar)" className="w-14 h-14 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-[family-name:var(--mu-font-display)] font-bold text-base text-[var(--mu-ink)]">{host.name}</span>
                  {host.verified && <VerifiedBadge size="sm" />}
                </div>
                <p className="mt-1.5 text-sm text-[var(--mu-text-body)] leading-relaxed">{host.bio}</p>
                <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--mu-text-muted)]">
                  <Languages size={13} className="text-[var(--mu-green)]" /> {t('detail.speaks')}: {host.languages.join(', ')}
                </p>
              </div>
            </Card>
          </div>
        )}

        {/* Driver + routes */}
        {isDriver && (
          <div className="mt-6">
            <SectionTitle>{t('detail.meet_driver')}</SectionTitle>
            <Card className="mt-2.5 flex items-start gap-3">
              <MobilePhoto src={driverSrc} alt={item.title} radius="var(--mu-r-avatar)" className="w-14 h-14 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-[family-name:var(--mu-font-display)] font-bold text-base text-[var(--mu-ink)]">{item.title}</span>
                  {item.provider_verified && <VerifiedBadge size="sm" />}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  {item.extras?.car_model && <Chip>🚘 {item.extras.car_model}</Chip>}
                  {item.extras?.vehicle_type && <Chip>{item.extras.vehicle_type}</Chip>}
                </div>
                <p className="mt-2 text-sm text-[var(--mu-text-body)] leading-relaxed">{c.about}</p>
              </div>
            </Card>
            {c.routes && c.routes.length > 0 && (
              <div className="mt-3 space-y-2">
                {c.routes.map((r: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] p-3">
                    <Route size={16} className="text-[var(--mu-green)] flex-shrink-0" />
                    <span className="flex-1 text-sm font-semibold text-[var(--mu-ink)]">{optionLabel(t, r.route)}</span>
                    {r.price > 0 && (
                      <span className="text-right flex-shrink-0">
                        <span className="font-[family-name:var(--mu-font-display)] font-bold text-[var(--mu-ink)]">₹{r.price}</span>
                        <span className="block text-[10px] text-[var(--mu-text-muted)]">{t(`widgets.per_${r.unit}`)}</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Best time (event) */}
        {isEvent && c.bestTime && (
          <div className="mt-6">
            <SectionTitle>{t('detail.best_time')}</SectionTitle>
            <Card className="mt-2.5 text-center">
              <Clock size={28} className="mx-auto text-[var(--mu-green)]" />
              <p className="mt-2.5 font-[family-name:var(--mu-font-display)] font-bold text-base text-[var(--mu-ink)]">{c.bestTime}</p>
            </Card>
          </div>
        )}

        {/* Location / spotted */}
        {!isDriver && (
          <div className="mt-6">
            <SectionTitle>{isBio ? t('detail.spotted') : t('detail.location')}</SectionTitle>
            <div className="mt-2.5 rounded-[var(--mu-r-card)] border border-[var(--mu-border)] overflow-hidden bg-[var(--mu-surface)]">
              <MapEmbed coords={c.coords} title={item.location} className="w-full h-[220px]" />
              <div className="p-4">
                {isBio && c.spotted && c.spotted.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {c.spotted.map((s: string) => <Chip key={s}><Crosshair size={11} /> {s}</Chip>)}
                  </div>
                ) : (
                  <>
                    <div className="font-[family-name:var(--mu-font-display)] font-bold text-base text-[var(--mu-ink)]">{item.location}</div>
                    {item.extras?.address && <div className="mt-0.5 text-xs text-[var(--mu-text-muted)]">{item.extras.address}</div>}
                  </>
                )}
                <Touch onClick={onOpenMaps} className="mt-3.5 inline-flex items-center gap-1.5 px-4 py-2 rounded-[var(--mu-r-chip)] border border-[var(--mu-border-strong)] text-sm font-bold text-[var(--mu-ink)]">
                  {t('cta.get_directions')} <ArrowRight size={13} />
                </Touch>
              </div>
            </div>
          </div>
        )}

        {/* Reserve (bookable) */}
        {bookable && (
          <div className="mt-6">
            <SectionTitle>{item.price > 0 ? `₹${item.price}${unit}` : t('detail.reserve')}</SectionTitle>
            <Card className="mt-2.5 space-y-3.5">
              {isStay && (
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="block">
                    <Slab>{t('booking.checkin')}</Slab>
                    <input required type="date" value={form.check_in} min={today} onChange={(e) => onCheckIn(e.target.value)}
                      className="mt-1 w-full px-3 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-bg)] text-sm text-[var(--mu-ink)] outline-none" />
                    {errors.check_in && <span className="mt-1 block text-xs font-semibold" style={{ color: 'var(--mu-danger)' }}>{errors.check_in}</span>}
                  </label>
                  <label className="block">
                    <Slab>{t('booking.checkout')}</Slab>
                    <input required type="date" value={form.check_out} min={form.check_in ? addDays(form.check_in, 1) : addDays(today, 1)}
                      disabled={!form.check_in} onChange={(e) => updateForm({ check_out: e.target.value })}
                      className="mt-1 w-full px-3 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-bg)] text-sm text-[var(--mu-ink)] outline-none disabled:opacity-50" />
                    {errors.check_out && <span className="mt-1 block text-xs font-semibold" style={{ color: 'var(--mu-danger)' }}>{errors.check_out}</span>}
                  </label>
                </div>
              )}

              <label className="block">
                <div className="flex items-center justify-between">
                  <Slab>{t('booking.guests')}</Slab>
                  <span className="text-[11px] text-[var(--mu-text-faint)] font-medium">Max {maxGuests}</span>
                </div>
                <input
                  type="number" min="1" max={maxGuests} value={form.guests}
                  onChange={(e) => updateForm({ guests: Math.min(maxGuests, Math.max(1, Number(e.target.value) || 1)) })}
                  className="mt-1 w-full px-3 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-bg)] text-sm text-[var(--mu-ink)] outline-none"
                />
                {errors.guests && <span className="mt-1 block text-xs font-semibold" style={{ color: 'var(--mu-danger)' }}>{errors.guests}</span>}
              </label>

              <label className="block">
                <Slab>{t('booking.notes')}</Slab>
                <textarea value={form.notes} onChange={(e) => updateForm({ notes: e.target.value })} rows={2}
                  className="mt-1 w-full px-3 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-bg)] text-sm text-[var(--mu-ink)] outline-none resize-none" />
              </label>

              <div className="rounded-[var(--mu-r-card-xs)] bg-[var(--mu-bg)] p-3.5">
                {Number(item.price) > 0 && (
                  <div className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-[var(--mu-text-muted)]">
                      ₹{item.price}{unit}
                      {isStay && !needsDates && <> × {t('widget.guest_count', { count: Number(form.guests) || 1 })} × {t('booking.nights', { count: nights })}</>}
                    </span>
                    <span className="font-bold text-[var(--mu-ink)] whitespace-nowrap">{needsDates ? '' : `₹${stayTotal.toLocaleString('en-IN')}`}</span>
                  </div>
                )}
                {needsDates && <p className="mt-1.5 text-xs text-[var(--mu-text-muted)]">{t('booking.pick_dates_for_total')}</p>}
                {Number(item.price) > 0 && !needsDates && <p className="mt-1 text-xs text-[var(--mu-text-muted)]">{t('booking.paid_to_host')}</p>}
                <div className="mt-3 pt-2.5 border-t border-[var(--mu-border)] flex items-start justify-between gap-3 text-sm">
                  <span className="text-[var(--mu-text-muted)]">{t('booking.confirmation_fee')}</span>
                  <span className="font-bold text-[var(--mu-ink)]">₹{BOOKING_FEE}</span>
                </div>
                <div className="mt-1.5 flex items-start justify-between gap-3">
                  <span className="text-sm font-bold text-[var(--mu-ink)]">{t('booking.payable_now')}</span>
                  <span className="font-[family-name:var(--mu-font-display)] font-black text-base text-[var(--mu-ink)]">₹{BOOKING_FEE}</span>
                </div>
                <Link to="/refunds" className="mt-2 inline-block text-xs font-semibold underline" style={{ color: 'var(--mu-green)' }}>
                  {t('booking.fees_and_refunds')}
                </Link>
              </div>

              <PrimaryButton onClick={doBook} disabled={busy} className="w-full">
                {busy ? t('common.loading') : (isDriver ? t('cta.talk_to_driver') : t('cta.book_now'))} <CtaIcon size={16} />
              </PrimaryButton>
              {msg && <p className="text-sm text-center font-semibold" style={{ color: 'var(--mu-green)' }}>{msg}</p>}
            </Card>
          </div>
        )}

        {/* Contact (shop/cafe/event) */}
        {contactable && (
          <div className="mt-6">
            <SectionTitle>
              {item.type === 'shop' ? t('mobileDetail.contact_shop') : item.type === 'cafe' ? t('mobileDetail.visit_cafe') : t('mobileDetail.join_event')}
            </SectionTitle>
            <Card className="mt-2.5 space-y-2.5">
              {phone ? (
                <>
                  <a href={`tel:${phone}`} className="w-full py-3.5 rounded-[var(--mu-r-chip)] font-bold text-sm flex items-center justify-center gap-2" style={{ background: 'var(--mu-green)', color: 'var(--mu-cream)' }}>
                    <Phone size={16} /> {isEvent ? t('mobileDetail.call_organizer') : t('cta.call_now')}
                  </a>
                  <a href={`https://wa.me/${waNumber}?text=${encodeURIComponent(t('mobileDetail.wa_message', { title: item.title }))}`} target="_blank" rel="noreferrer"
                    className="w-full py-3.5 rounded-[var(--mu-r-chip)] font-bold text-sm text-white flex items-center justify-center gap-2" style={{ background: '#25D366' }}>
                    <MessageCircle size={16} /> {t('mobileDetail.whatsapp')}
                  </a>
                </>
              ) : (
                <p className="text-sm text-center text-[var(--mu-text-muted)]">{t('mobileDetail.no_contact')}</p>
              )}
              <Touch onClick={onOpenMaps} className="w-full py-3.5 rounded-[var(--mu-r-chip)] border border-[var(--mu-border-strong)] font-bold text-sm flex items-center justify-center gap-2 text-[var(--mu-ink)]">
                <Navigation size={16} /> {t('cta.get_directions')}
              </Touch>
            </Card>
          </div>
        )}

        {/* Reviews */}
        <div className="mt-6">
          <MobileDetailReviews itemId={item.id} />
        </div>
      </div>

      {/* Sticky CTA bar */}
      {(bookable || contactable) && (
        <div className="lg:hidden fixed inset-x-0 z-30 px-4" style={{ bottom: 'calc(var(--bottom-nav-h) + 0.75rem)' }}>
          <div className="mobile-ui mx-auto max-w-md rounded-[var(--mu-r-card)] p-2.5 flex items-center gap-2.5" style={{ background: 'var(--mu-surface)', boxShadow: 'var(--mu-shadow-sheet)' }}>
            {item.price > 0 && (
              <div className="pl-1.5 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--mu-text-muted)] truncate">{t('common.starting_from')}</div>
                <div className="font-[family-name:var(--mu-font-display)] font-black text-base text-[var(--mu-ink)] truncate">
                  ₹{item.price}<span className="text-[10px] text-[var(--mu-text-muted)] font-semibold">{unit}</span>
                </div>
              </div>
            )}
            <Touch
              onClick={bookable ? doBook : onOpenMaps}
              disabled={busy}
              className="ml-auto flex-shrink-0 inline-flex items-center gap-1.5 px-5 py-3 rounded-[var(--mu-r-chip)] font-bold text-sm whitespace-nowrap"
              style={{ background: 'var(--mu-green)', color: 'var(--mu-cream)' }}
            >
              {bookable ? <>{isDriver ? t('cta.talk_to_driver') : t('cta.book_now')}</> : <><Navigation size={15} /> {t('cta.get_directions')}</>}
            </Touch>
          </div>
        </div>
      )}
    </div>
  );
}
