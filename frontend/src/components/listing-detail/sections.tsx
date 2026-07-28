import React from 'react';
import { useTranslation } from 'react-i18next';
import SmartImg from '@/components/SmartImg';
import MapEmbed from '@/components/MapEmbed';
import { optionLabel } from '@/lib/optionLabel';
import { RouteFare } from '@/lib/routeFares';
import {
  MapPin, Tag, Navigation, ArrowRight, Languages,
  CalendarClock, Route, Crosshair, Clock, Ticket, Mountain, Sparkles, Compass,
} from 'lucide-react';
import { Screen, SectionHead, Avatar, ALIGN_TEXT, ALIGN_ROW, ALIGN_BLOCK } from './primitives';
import VerifiedBadge from '@/components/provider/VerifiedBadge';

// One component per full-screen section of the listing detail page. The page
// decides which sections a listing type gets; each section only renders it.

/** Detailed "about" text plus the listing's tags. */
export function AboutSection({ item, about, label }: { item: any; about?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <Screen tone="bg" testid="detail-about">
      <SectionHead label={label || t('detail.about')} title={item.title} />
      {/* whitespace-pre-line so an `about` written as multiple paragraphs
          (separated by blank lines) keeps its breaks instead of collapsing.
          The measure widens with the viewport rather than staying at 3xl, which
          left a lot of empty column on a desktop screen. Phones are narrower
          than 3xl to begin with, so the base cap is what they keep. */}
      <p className={`mt-8 text-lg md:text-xl text-ink leading-relaxed ${ALIGN_TEXT} max-w-3xl md:max-w-4xl lg:max-w-5xl ${ALIGN_BLOCK} whitespace-pre-line`}>{about}</p>
      {item.tags?.length > 0 && (
        <div className={`mt-8 flex flex-wrap ${ALIGN_ROW} gap-2`}>
          {item.tags.map((tg: string) => <span key={tg} className="chip"><Tag size={11} className="mr-1" /> {optionLabel(t, tg)}</span>)}
        </div>
      )}
    </Screen>
  );
}

/**
 * "Why go" bullets for a tourist spot, written by an admin in the console
 * (extras.highlights). Renders nothing when the spot has none.
 */
export function HighlightsSection({ highlights }: { highlights: string[] }) {
  const { t } = useTranslation();
  return (
    <Screen tone="white" testid="detail-highlights">
      <SectionHead label={t('detail.highlights')} title={t('detail.highlights')} note={t('detail.highlights_note')} />
      <div className={`mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 max-w-5xl ${ALIGN_BLOCK}`}>
        {highlights.map((highlight) => (
          <div key={highlight} className="flex items-start gap-4 p-5 rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
            <Sparkles size={22} className="text-pine flex-shrink-0 mt-0.5" />
            <span className="text-ink font-semibold leading-snug">{highlight}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

/**
 * Practical visitor information for a tourist spot — the answers people look for
 * before setting out. Every field is optional; the section only renders when the
 * admin has filled at least one, and each card only appears when it has a value.
 */
export function VisitInfoSection({ facts, howToReach }: {
  facts: { timings?: string; entryFee?: string; bestTime?: string; altitude?: string };
  howToReach?: string;
}) {
  const { t } = useTranslation();
  const cards = [
    { key: 'timings', Icon: Clock, label: t('detail.timings'), value: facts.timings },
    { key: 'entry_fee', Icon: Ticket, label: t('detail.entry_fee'), value: facts.entryFee },
    { key: 'best_time', Icon: CalendarClock, label: t('detail.best_time'), value: facts.bestTime },
    { key: 'altitude', Icon: Mountain, label: t('detail.altitude'), value: facts.altitude },
  ].filter((card) => !!card.value);

  return (
    <Screen tone="mist" testid="detail-visit-info">
      <SectionHead label={t('detail.plan_visit')} title={t('detail.plan_visit')} note={t('detail.plan_visit_note')} />

      {cards.length > 0 && (
        <div className={`mt-10 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 max-w-5xl ${ALIGN_BLOCK}`}>
          {cards.map(({ key, Icon, label, value }) => (
            <div key={key} className="p-6 rounded-2xl border border-[var(--line)] bg-white" data-testid={`detail-fact-${key}`}>
              <Icon size={22} className="text-pine" />
              <div className="mt-4 text-xs font-bold uppercase tracking-widest text-ink-soft">{label}</div>
              <div className="mt-1 font-display font-extrabold text-xl text-ink leading-snug">{value}</div>
            </div>
          ))}
        </div>
      )}

      {howToReach && (
        <div className={`mt-6 max-w-3xl ${ALIGN_BLOCK} p-6 md:p-8 rounded-2xl border border-[var(--line)] bg-white`} data-testid="detail-how-to-reach">
          <div className={`flex items-center ${ALIGN_ROW} gap-2 text-xs font-bold uppercase tracking-widest text-ink-soft`}>
            <Compass size={16} className="text-pine" /> {t('detail.how_to_reach')}
          </div>
          <p className={`mt-3 text-lg text-ink leading-relaxed whitespace-pre-line ${ALIGN_TEXT}`}>{howToReach}</p>
        </div>
      )}
    </Screen>
  );
}

/** Curated keyword-photo gallery (editorial content, not provider uploads). */
export function PhotosSection({ item, gallery, fallbackImg }: { item: any; gallery: string[]; fallbackImg: string }) {
  const { t } = useTranslation();
  return (
    <Screen tone="white" testid="detail-photos">
      <SectionHead label={t('detail.photos')} title={t('detail.photos')} note={t('detail.gallery_note')} />
      <div className="mt-10 grid sm:grid-cols-3 gap-4 md:gap-5">
        {gallery.map((src, i) => (
          <SmartImg key={src + i} src={src} fallback={fallbackImg} alt={`${item.title} ${i + 1}`}
            className="w-full aspect-[4/3] object-cover rounded-2xl border border-[var(--line)]" />
        ))}
      </div>
    </Screen>
  );
}

/** "What this place offers" amenity grid. */
export function OffersSection({ amenities, title }: { amenities: { Icon: any; label: string }[]; title?: string }) {
  const { t } = useTranslation();
  const heading = title || t('detail.offers');
  return (
    <Screen tone="mist" testid="detail-offers">
      <SectionHead label={heading} title={heading} />
      <div className={`mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 max-w-4xl ${ALIGN_BLOCK}`}>
        {amenities.map(({ Icon, label }) => (
          <div key={label} className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--line)] bg-white">
            <Icon size={24} className="text-pine flex-shrink-0" />
            {/* Amenities are stored in English; only the display is localised. */}
            <span className="text-ink font-semibold">{optionLabel(t, label)}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

/** Provider-uploaded photo gallery (homestays). */
export function StayGallerySection({ images }: { images: string[] }) {
  const { t } = useTranslation();
  return (
    <Screen tone="white" testid="detail-gallery">
      <SectionHead label={t('detail.photos')} title={t('detail.stay_gallery_title')} />
      <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((url, index) => (
          <div key={index} className="aspect-[4/3] rounded-3xl overflow-hidden border border-[var(--line)] bg-mist shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <img src={url} alt={t('detail.gallery_alt', { index: index + 1 })} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    </Screen>
  );
}

/** "Meet your host" (homestays). */
export function HostSection({ item, host, personSrc }: { item: any; host: any; personSrc?: string }) {
  const { t } = useTranslation();
  return (
    <Screen tone="bg" testid="detail-host">
      <SectionHead label={t('detail.host')} title={t('detail.host')} />
      <div className={`mt-10 ${ALIGN_TEXT} max-w-2xl ${ALIGN_BLOCK}`}>
        <Avatar photo={personSrc} initial={host.initial} />
        <div className={`mt-6 flex items-center ${ALIGN_ROW} gap-2 flex-wrap`}>
          <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{host.name}</span>
          {host.verified && <VerifiedBadge size="sm" />}
        </div>
        <p className={`mt-2 text-sm text-ink-soft flex items-center ${ALIGN_ROW} gap-1.5`}><MapPin size={13} /> {item.location}</p>
        <p className="mt-6 text-lg text-ink leading-relaxed whitespace-pre-line">{host.bio}</p>
        <p className={`mt-5 text-ink-soft flex items-center ${ALIGN_ROW} gap-2`}>
          <Languages size={18} className="text-pine flex-shrink-0" /> {t('detail.speaks')}: {host.languages.join(', ')}
        </p>
      </div>
    </Screen>
  );
}

/** "Meet your driver" (drivers). */
export function DriverSection({ item, about, personSrc, initial }: { item: any; about?: string; personSrc?: string; initial: string }) {
  const { t } = useTranslation();
  const carModel = item.extras?.car_model;
  const vehicleType = item.extras?.vehicle_type;
  const gender = item.extras?.gender;
  return (
    <Screen tone="bg" testid="detail-driver">
      <SectionHead label={t('detail.meet_driver')} title={t('detail.meet_driver')} />
      <div className={`mt-10 ${ALIGN_TEXT} max-w-2xl ${ALIGN_BLOCK}`}>
        <Avatar photo={personSrc} initial={initial} />
        <div className={`mt-6 flex items-center ${ALIGN_ROW} gap-2 flex-wrap`}>
          <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{item.title}</span>
          {item.provider_verified && <VerifiedBadge size="sm" />}
        </div>
        <div className={`mt-3 flex items-center ${ALIGN_ROW} gap-2 flex-wrap`}>
          {carModel && (
            <span className="chip bg-white border border-[var(--line)] text-ink font-bold text-xs">
              🚘 {carModel}
            </span>
          )}
          {vehicleType && (
            <span className="chip bg-white border border-[var(--line)] text-pine font-bold text-xs capitalize">
              {vehicleType}
            </span>
          )}
          {gender && (
            <span className="chip bg-white border border-[var(--line)] text-ink-soft font-semibold text-xs capitalize">
              {gender}
            </span>
          )}
        </div>
        <p className="mt-6 text-lg text-ink leading-relaxed whitespace-pre-line">{about}</p>
      </div>
    </Screen>
  );
}

/** Best time to visit (festivals / events). */
export function BestTimeSection({ bestTime }: { bestTime: string }) {
  const { t } = useTranslation();
  return (
    <Screen tone="white" testid="detail-besttime">
      <SectionHead label={t('detail.best_time')} title={t('detail.best_time')} />
      <div className={`mt-10 max-w-xl ${ALIGN_BLOCK} rounded-3xl border border-[var(--line)] bg-[var(--bg)] p-8 ${ALIGN_TEXT}`}>
        <CalendarClock size={40} className={`text-pine ${ALIGN_BLOCK}`} />
        <p className="mt-4 text-xl md:text-2xl font-display font-bold text-ink leading-snug">{bestTime}</p>
      </div>
    </Screen>
  );
}

/** Routes a driver operates, each with its own fare (shown instead of a map). */
export function RoutesSection({ routes }: { routes: RouteFare[] }) {
  const { t } = useTranslation();
  return (
    <Screen tone="mist" testid="detail-routes">
      <SectionHead label={t('detail.routes_label')} title={t('detail.routes_title')} note={t('detail.routes_note')} />
      <div className={`mt-10 max-w-2xl ${ALIGN_BLOCK} space-y-3`}>
        {routes.map((r, i) => (
          <div key={i} className="flex items-center gap-4 p-5 rounded-2xl border border-[var(--line)] bg-white text-left">
            <Route size={22} className="text-pine flex-shrink-0" />
            <span className="flex-1 text-ink font-semibold">{optionLabel(t, r.route)}</span>
            {/* Editorial routes carry no quote, so the fare is simply omitted
                rather than rendered as a misleading ₹0. */}
            {r.price > 0 && (
              <span className="flex-shrink-0 text-right">
                <span className="font-display font-extrabold text-lg text-ink">₹{r.price}</span>
                <span className="block text-xs font-semibold text-ink-soft">{t(`widgets.per_${r.unit}`)}</span>
              </span>
            )}
          </div>
        ))}
      </div>
    </Screen>
  );
}

/** Where you'll be / spotted locations - a real map with a directions CTA. */
export function LocationSection({ item, coords, spotted, onOpenMaps }: {
  item: any;
  coords?: [number, number];
  spotted?: string[];
  onOpenMaps: () => void;
}) {
  const { t } = useTranslation();
  const isBio = item.type === 'biodiversity';
  return (
    <Screen tone="bg" testid={isBio ? 'detail-spotted' : 'detail-location'}>
      {isBio
        ? <SectionHead label={t('detail.spotted')} title={t('detail.spotted')} note={t('detail.spotted_note')} />
        : <SectionHead label={t('detail.location')} title={t('detail.location')} />}

      <div className="mt-10 rounded-3xl border border-[var(--line)] overflow-hidden bg-white">
        <MapEmbed coords={coords!} title={item.location} className="w-full h-[42vh] min-h-[260px]" />
        <div className="p-6 md:p-8">
          {isBio && spotted && spotted.length > 0 ? (
            <div className={`flex flex-wrap ${ALIGN_ROW} gap-2`}>
              {spotted.map((s) => (
                <span key={s} className="chip"><Crosshair size={12} className="mr-1" /> {s}</span>
              ))}
            </div>
          ) : (
            <>
              <div className={`font-display font-extrabold text-2xl text-ink ${ALIGN_TEXT}`}>{item.location}</div>
              {item.extras?.address && (
                <div className={`mt-1 text-sm font-semibold text-ink-soft ${ALIGN_TEXT}`}>{item.extras.address}</div>
              )}
            </>
          )}
          <div className={`mt-6 flex ${ALIGN_ROW}`}>
            <button onClick={onOpenMaps} data-testid="detail-open-maps"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
              {t('cta.get_directions')} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </Screen>
  );
}
