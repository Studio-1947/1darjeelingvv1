import React from 'react';
import { useTranslation } from 'react-i18next';
import SmartImg from '@/components/SmartImg';
import MapEmbed from '@/components/MapEmbed';
import {
  MapPin, Tag, Navigation, ArrowRight, BadgeCheck, Languages,
  CalendarClock, Route, Crosshair,
} from 'lucide-react';
import { Screen, SectionHead, Avatar } from './primitives';

// One component per full-screen section of the listing detail page. The page
// decides which sections a listing type gets; each section only renders it.

/** Detailed "about" text plus the listing's tags. */
export function AboutSection({ item, about }: { item: any; about?: string }) {
  const { t } = useTranslation();
  return (
    <Screen tone="bg" testid="detail-about">
      <SectionHead label={t('detail.about')} title={item.title} />
      <p className="mt-8 text-lg md:text-xl text-ink leading-relaxed text-center max-w-3xl mx-auto">{about}</p>
      {item.tags?.length > 0 && (
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {item.tags.map((tg: string) => <span key={tg} className="chip"><Tag size={11} className="mr-1" /> {tg}</span>)}
        </div>
      )}
    </Screen>
  );
}

/** Curated keyword-photo gallery (editorial content, not provider uploads). */
export function PhotosSection({ item, gallery, fallbackImg }: { item: any; gallery: string[]; fallbackImg: string }) {
  const { t } = useTranslation();
  return (
    <Screen tone="white" wide testid="detail-photos">
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
export function OffersSection({ amenities }: { amenities: { Icon: any; label: string }[] }) {
  const { t } = useTranslation();
  return (
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
  );
}

/** Provider-uploaded photo gallery (homestays). */
export function StayGallerySection({ images }: { images: string[] }) {
  return (
    <Screen tone="white" testid="detail-gallery">
      <SectionHead label="Photos" title="Explore the Stay" />
      <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {images.map((url, index) => (
          <div key={index} className="aspect-[4/3] rounded-3xl overflow-hidden border border-[var(--line)] bg-mist shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1">
            <img src={url} alt={`Gallery ${index + 1}`} className="w-full h-full object-cover" />
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
      <div className="mt-10 text-center max-w-2xl mx-auto">
        <Avatar photo={personSrc} initial={host.initial} />
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{host.name}</span>
          {host.verified && (
            <span className="chip bg-white"><BadgeCheck size={12} className="mr-1" /> {t('detail.verified')}</span>
          )}
        </div>
        <p className="mt-2 text-sm text-ink-soft flex items-center justify-center gap-1.5"><MapPin size={13} /> {item.location}</p>
        <p className="mt-6 text-lg text-ink leading-relaxed">{host.bio}</p>
        <p className="mt-5 text-ink-soft flex items-center justify-center gap-2">
          <Languages size={18} className="text-pine" /> {t('detail.speaks')}: {host.languages.join(', ')}
        </p>
      </div>
    </Screen>
  );
}

/** "Meet your driver" (drivers). */
export function DriverSection({ item, about, personSrc, initial }: { item: any; about?: string; personSrc?: string; initial: string }) {
  const { t } = useTranslation();
  return (
    <Screen tone="bg" testid="detail-driver">
      <SectionHead label={t('detail.meet_driver')} title={t('detail.meet_driver')} />
      <div className="mt-10 text-center max-w-2xl mx-auto">
        <Avatar photo={personSrc} initial={initial} />
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <span className="font-display font-extrabold text-2xl md:text-3xl text-ink">{item.title}</span>
          {item.provider_verified && (
            <span className="chip bg-white"><BadgeCheck size={12} className="mr-1" /> {t('detail.verified')}</span>
          )}
        </div>
        <p className="mt-6 text-lg text-ink leading-relaxed">{about}</p>
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
      <div className="mt-10 mx-auto max-w-xl rounded-3xl border border-[var(--line)] bg-[var(--bg)] p-8 text-center">
        <CalendarClock size={40} className="text-pine mx-auto" />
        <p className="mt-4 text-xl md:text-2xl font-display font-bold text-ink leading-snug">{bestTime}</p>
      </div>
    </Screen>
  );
}

/** Routes a driver operates (shown instead of a location map). */
export function RoutesSection({ routes }: { routes: string[] }) {
  const { t } = useTranslation();
  return (
    <Screen tone="mist" testid="detail-routes">
      <SectionHead label={t('detail.routes')} title={t('detail.routes')} note={t('detail.routes_note')} />
      <div className="mt-10 mx-auto max-w-2xl space-y-3">
        {routes.map((r, i) => (
          <div key={i} className="flex items-start gap-4 p-5 rounded-2xl border border-[var(--line)] bg-white text-left">
            <Route size={22} className="text-pine flex-shrink-0 mt-0.5" />
            <span className="text-ink font-semibold">{r}</span>
          </div>
        ))}
      </div>
    </Screen>
  );
}

/** Where you'll be / spotted locations — a real map with a directions CTA. */
export function LocationSection({ item, coords, spotted, onOpenMaps }: {
  item: any;
  coords?: [number, number];
  spotted?: string[];
  onOpenMaps: () => void;
}) {
  const { t } = useTranslation();
  const isBio = item.type === 'biodiversity';
  return (
    <Screen tone="bg" wide testid={isBio ? 'detail-spotted' : 'detail-location'}>
      {isBio
        ? <SectionHead label={t('detail.spotted')} title={t('detail.spotted')} note={t('detail.spotted_note')} />
        : <SectionHead label={t('detail.location')} title={t('detail.location')} />}

      <div className="mt-10 rounded-3xl border border-[var(--line)] overflow-hidden bg-white">
        <MapEmbed coords={coords!} title={item.location} className="w-full h-[42vh] min-h-[260px]" />
        <div className="p-6 md:p-8">
          {isBio && spotted && spotted.length > 0 ? (
            <div className="flex flex-wrap justify-center gap-2">
              {spotted.map((s) => (
                <span key={s} className="chip"><Crosshair size={12} className="mr-1" /> {s}</span>
              ))}
            </div>
          ) : (
            <>
              <div className="font-display font-extrabold text-2xl text-ink text-center">{item.location}</div>
              {item.extras?.address && (
                <div className="mt-1 text-sm font-semibold text-ink-soft text-center">{item.extras.address}</div>
              )}
            </>
          )}
          <div className="mt-6 flex justify-center">
            <button onClick={onOpenMaps} data-testid="detail-open-maps"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
              <Navigation size={16} /> {t('cta.get_directions')} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </Screen>
  );
}
