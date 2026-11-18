import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { shareLink } from '@/lib/share';
import { openDirections } from '@/lib/directions';
import { ListingDetailSkeleton, LoadingStatus } from '@/components/skeletons';
import { amenitiesFor, hostFor } from '@/lib/listingMeta';
import { contentFor, listingImage, galleryImagesFor, personImageFor, spotInfoFor } from '@/lib/listingContent';
import { groupPhotos } from '@/lib/photoGroups';
import Seo from '@/components/Seo';
import BookingConfirmation from '@/components/BookingConfirmation';
import DeliveryRequestButton from '@/components/DeliveryRequestButton';
import { Box, ButtonLink, Status } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import BookingFeeModal from '@/components/listing-detail/BookingFeeModal';
import RequestSent from '@/components/listing-detail/RequestSent';
import DetailHero, { ItemActions } from '@/components/listing-detail/DetailHero';
import type { ShareOutcome } from '@/lib/share';
import {
  AboutSection, OffersSection, BestTimeSection, RoutesSection, TicketBox,
  LocationSection, VisitInfoSection, NearbySection,
} from '@/components/listing-detail/sections';
import { BookingScreen, BookBar, bookingSteps } from '@/components/listing-detail/ReserveSection';
import ContactSection from '@/components/listing-detail/ContactSection';
import ReviewsSection from '@/components/listing-detail/ReviewsSection';
import {
  GuideSection, ServicesSection, RoomsFoodSection, RecommendedDriversSection, PriceListSection, OwnerSection,
  HostSection, DriverSection, UnavailableNotice,
} from '@/components/listing-detail/profileSections';
import { useBookingFlow } from '@/components/listing-detail/useBookingFlow';
import { useAuth } from '@/context/AuthContext';
import { BusinessModeNotice } from '@/components/TravellerOnly';

/**
 * Public listing page, laid out as the prototype's item view: photo, photo strip, name, place,
 * verified and rating, host, price, Website, Listen / Direction / save / share, then About,
 * Facilities, the host, rooms or fares or menu, the map, nearby, reviews and Report a problem,
 * with the fixed price + "Book now" bar. "Book now" opens the booking screen (prototype V.book),
 * one step per screen, kept in the URL as ?book=<step> so Back and the login round trip work.
 * Booking state lives in useBookingFlow; each block is its own component under listing-detail.
 */
export default function ListingDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const booking = useBookingFlow(item, id);
  const { isHostMode, provider } = useAuth();
  const step = Math.max(0, Math.floor(Number(params.get('book')) || 0));

  useEffect(() => {
    // `cancelled` guards against out-of-order responses when moving from one listing to another.
    let cancelled = false;
    setLoading(true);
    // Cleared first so a failed or missing listing shows "not found", not the previous one.
    setItem(null);
    api.get(`/listings/${id}`)
      .then((r) => { if (!cancelled) setItem(r.data.item); })
      .catch(() => { if (!cancelled) setItem(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // /listing/:id#reviews (the star on a feed card): jump to the section once the listing is in.
  useEffect(() => {
    if (loading || !item || !hash || step) return;
    // getElementById, not querySelector: a hash is arbitrary text and an invalid selector throws.
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, item, hash, step]);

  // Each booking step is its own screen: start it at the top.
  useEffect(() => { if (step) window.scrollTo(0, 0); }, [step]);

  const openMaps = () => openDirections(item);

  const shareIt = async (): Promise<ShareOutcome> => {
    if (!item) return 'failed';
    // The canonical listing URL, not window.location.href (which may carry #reviews).
    return shareLink({ title: item.title, text: item.description, url: `${window.location.origin}/listing/${item.id}` });
  };

  if (loading) {
    return (
      <>
        <LoadingStatus label={t('common.loading')} />
        <ListingDetailSkeleton />
      </>
    );
  }
  if (!item) {
    return (
      <div className="ag-wrap"><div className="ag-main">
        <Box><h2>{t('common.not_found')}</h2></Box>
      </div></div>
    );
  }

  // On the business side a host sees only their own listing, as a preview with booking off.
  const ownPreview = isHostMode && !!provider && item.provider_id === provider.id;
  if (isHostMode && !ownPreview) return <BusinessModeNotice />;

  // Off when the host switched availability off, or their free start is used up and not paid yet
  // (backend lib/hostGrace.ts); the page stays up either way.
  const available = item.extras?.available !== false && item.bookings_paused !== true;
  const reservable = item.type === 'homestay' || item.type === 'driver' || item.type === 'guide';
  const bookable = !ownPreview && available && reservable;
  const contactable = !ownPreview && ['shop', 'cafe', 'event'].includes(item.type);
  const place = item.type === 'spot' || item.type === 'event' || item.type === 'biodiversity';
  const isSpot = item.type === 'spot';

  // A homestay is priced per person per night; drivers and guides by the day.
  const unit = item.type === 'homestay' ? t('common.per_head') : (item.type === 'driver' || item.type === 'guide') ? t('common.per_day') : '';
  const amenities = amenitiesFor(item);
  const host = hostFor(item);
  const c = contentFor(item);
  const spotInfo = spotInfoFor(item);
  // Only the languages the host gave (never a default list).
  const languages: string[] = Array.isArray(item.extras?.languages) ? item.extras.languages.filter(Boolean) : [];

  // ---------- the booking screen (prototype V.book) and the "Request sent" screen ----------
  const goStep = (n: number) => setParams((p) => { const q = new URLSearchParams(p); if (n) q.set('book', String(n)); else q.delete('book'); return q; });

  const modals = (
    <>
      <BookingFeeModal
        bookingId={booking.feeFor}
        onClose={() => { booking.setFeeFor(null); nav('/dashboard'); }}
        onConfirmed={(b) => { booking.setFeeFor(null); booking.setConfirm({ open: true, data: b }); }}
      />
      <BookingConfirmation
        open={!!booking.confirm?.open}
        onClose={() => { booking.setConfirm(null); nav('/dashboard'); }}
        mode="booking"
        data={booking.confirm?.data}
        onView={() => { booking.setConfirm(null); nav('/dashboard'); }}
      />
    </>
  );

  if (booking.requested) {
    return (
      <div className="ag-wrap ag-listing">
        <RequestSent booking={booking.requested} title={item.title} onTrips={() => { booking.setRequested(null); nav('/my-trips'); }} />
      </div>
    );
  }

  if (step > 0 && bookable) {
    const total = bookingSteps(item.type);
    return (
      <div className="ag-wrap ag-listing">
        <Seo title={item.title} canonical={`${window.location.origin}/listing/${item.id}`} />
        <BookingScreen item={item} unit={unit} step={Math.min(step, total)} booking={booking} onNext={() => goStep(Math.min(step + 1, total))} />
        {modals}
      </div>
    );
  }

  // ---------- the listing ----------
  const ownPhotos: string[] = Array.isArray(item.extras?.images) ? item.extras.images.filter((u: unknown) => typeof u === 'string' && u) : [];
  // Drivers show the car photos they uploaded (never a stand-in); a homestay labels its own photos
  // by what they show (front, outside, room); everyone else gets their own photos or the curated set.
  const ownStay = item.type === 'homestay' && ownPhotos.length > 0;
  const strip = (() => {
    if (item.type === 'driver') return ownPhotos.map((src) => ({ src }));
    if (ownStay) {
      const groups = groupPhotos(ownPhotos, item.extras?.photo_kinds);
      const labelled = groups.length > 1 || groups[0]?.kind !== 'other';
      return groups.flatMap(({ kind, urls }) => urls.map((src, i) => ({
        src, tag: labelled ? t(`photoKind.${kind}`) : undefined, groupTestid: i === 0 ? `gallery-group-${kind}` : undefined,
      })));
    }
    return galleryImagesFor(item).map((src) => ({ src }));
  })();
  const personSrc = host.avatar || personImageFor(item);
  const roomCount = Array.isArray(item.extras?.rooms) ? item.extras.rooms.length : 0;
  const showHost = !place && !ownPreview && (host.known || !!item.host_page_path);
  const delivery = !ownPreview && ['cafe', 'shop', 'homestay'].includes(item.type) && !item.bookings_paused && item.extras?.home_delivery;
  const spotFacts = isSpot && spotInfo.highlights.length > 0
    ? spotInfo.highlights.map((h: string) => ({ label: h }))
    : amenities.map((a) => ({ label: a.label, labelKey: a.labelKey }));

  const hostLine = showHost ? (
    <p className="ag-small">
      {t('listing.pf_host', 'Host')}:{' '}
      {item.host_page_path ? (
        <Link to={item.host_page_path} data-testid="listing-host-page" className="ag-listing-plink">
          <b>{host.known ? host.name : t('ui.listingDetail.see_host_page')}</b><Icon name="arrowne" />
        </Link>
      ) : <b className="font-medium text-[var(--ink-strong)]">{host.name}</b>}
    </p>
  ) : null;

  return (
    <div className="ag-wrap ag-listing">
      {/* Each listing gets its own title, description and canonical (QA 3.4). */}
      <Seo
        title={item.title}
        description={c.about || item.description}
        image={listingImage(item, 1200, 630)}
        canonical={`${window.location.origin}/listing/${item.id}`}
        ogType={bookable ? 'product' : 'place'}
      />

      <div className="ag-main">
        {ownPreview && (
          <Box tone="blush" flat data-testid="own-listing-preview" className="!flex-row !items-center !py-3">
            <Icon name="search" size={20} className="text-[var(--r)]" />
            <p className="ag-small !text-[var(--ink-strong)]">{t('business_gate.preview')}</p>
          </Box>
        )}
        {item.not_live && (
          <Box flat data-testid="listing-not-live" className="!py-3 !gap-2">
            <Status className="self-start">{t('detail.not_live_tag', 'Not live yet')}</Status>
            <p className="ag-small !text-[var(--ink-strong)]">{t('business_gate.not_live')}</p>
          </Box>
        )}

        <DetailHero item={item} photos={strip} host={hostLine}
          stripTestid={ownStay ? 'detail-gallery' : 'detail-photos'}
          stripLabel={item.type === 'driver' ? t('detail.car_photos') : t('listing.photos', 'Photos')} />

        {/* Places to visit: the entry ticket box. Everything else: the price line. */}
        {(isSpot || item.type === 'biodiversity') ? (
          <TicketBox price={Number(item.price) || 0} entryFee={spotInfo.entryFee && !(Number(item.price) > 0) ? spotInfo.entryFee : undefined} />
        ) : Number(item.price) > 0 ? (
          <p className="ag-listing-lead">
            {(!unit || roomCount > 1) && <span className="ag-small">{t('listing.from', 'From')} </span>}
            <span className="price">₹{Number(item.price).toLocaleString('en-IN')}</span>
            {unit && <span className="ag-small"> {unit}</span>}
          </p>
        ) : item.type === 'event' ? <p className="ag-listing-lead"><span className="ag-small">{t('common.entry_varies')}</span></p> : null}

        {/* Website beside Ask to book (the fixed bar carries Book now), then the "asking is free" line. */}
        {reservable && !ownPreview && !available && <UnavailableNotice />}
        {(item.host_page_path || bookable) && (
          <div className="ag-listing-stack">
            {item.host_page_path && (
              <div className="ag-row">
                <ButtonLink variant="tonal" go className="ag-listing-web" to={item.host_page_path} icon={<Icon name="globe" />} data-testid="listing-website">
                  {t('listing.pf_site', 'Website')}
                </ButtonLink>
              </div>
            )}
            {bookable && <p className="ag-small">{t('listing.askfree', 'Asking is free. You pay nothing now.')} {t('listing.numlater', 'You get the phone number after you book.')}</p>}
          </div>
        )}

        {delivery && (
          <div className="ag-listing-dlv" data-testid="listing-host-links">
            <span className="ag-listing-dlvtag"><svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 15.5h5l3-6h3l2 6M13.5 9.5L12 6H9" /></svg> {t('listing.hasdlv', 'Home delivery')}</span>
            <DeliveryRequestButton listing={item} />
          </div>
        )}

        <ItemActions item={item} about={c.about || item.description} onDirections={openMaps} onShare={shareIt} />

        <AboutSection item={item} about={c.about} languages={languages} />

        {isSpot && <VisitInfoSection facts={{ timings: spotInfo.timings, bestTime: spotInfo.bestTime, altitude: spotInfo.altitude }} howToReach={spotInfo.howToReach} />}
        {item.type === 'event' && c.bestTime && <BestTimeSection bestTime={c.bestTime} />}

        {/* Biodiversity entries are a species or habitat, not somewhere with facilities. */}
        {item.type !== 'biodiversity' && spotFacts.length > 0 && <OffersSection amenities={spotFacts} list={isSpot} />}

        {item.type === 'homestay' && host.known && <HostSection item={item} host={host} personSrc={personSrc} />}
        {item.type === 'driver' && <DriverSection item={item} personSrc={listingImage(item, 600, 600)} />}
        {item.type === 'guide' && <GuideSection item={item} photo={host.avatar || listingImage(item, 600, 600)} />}
        {(item.type === 'cafe' || item.type === 'shop') && <OwnerSection item={item} verified={!!item.provider_verified} />}

        {item.type === 'homestay' && (
          <RoomsFoodSection
            rooms={Array.isArray(item.extras?.rooms) ? item.extras.rooms : []}
            meals={Array.isArray(item.extras?.meals) ? item.extras.meals : []}
            homeDelivery={item.extras?.home_delivery === true}
          />
        )}
        {item.type === 'driver' && c.routes && c.routes.length > 0 && <RoutesSection routes={c.routes} />}
        {(item.type === 'cafe' || item.type === 'shop') && (
          <PriceListSection
            kind={item.type === 'cafe' ? 'menu' : 'goods'}
            rows={Array.isArray(item.extras?.[item.type === 'cafe' ? 'menu' : 'goods']) ? item.extras[item.type === 'cafe' ? 'menu' : 'goods'] : []}
            homeDelivery={item.extras?.home_delivery === true}
            capacity={Number(item.extras?.capacity) || 0}
            openingHours={typeof item.extras?.opening_hours === 'string' ? item.extras.opening_hours : ''}
            shopKind={item.type === 'shop' ? item.extras?.shop_kind : undefined}
          />
        )}
        {item.type === 'guide' && <ServicesSection services={Array.isArray(item.extras?.services) ? item.extras.services : []} />}

        {(item.type === 'homestay' || item.type === 'cafe' || item.type === 'shop') && Array.isArray(item.extras?.recommended_drivers) && item.extras.recommended_drivers.length > 0 && (
          <RecommendedDriversSection ids={item.extras.recommended_drivers} />
        )}

        {item.type !== 'driver' && item.type !== 'guide' && (
          <LocationSection item={item} coords={c.coords} spotted={c.spotted} onOpenMaps={openMaps} />
        )}

        {/* A place to visit leads on to stays and drivers near it, and to the guides. */}
        {place && <NearbySection item={item} />}

        {contactable && <ContactSection item={item} onOpenMaps={openMaps} />}

        <ReviewsSection item={item} />
      </div>

      {bookable && <BookBar item={item} unit={unit} onBook={() => goStep(1)} />}
      {modals}
    </div>
  );
}
