import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Eye, MapPin } from '@phosphor-icons/react';
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
import AudioGuide from '@/components/AudioGuide';
import { Box, Button, Status } from '@/components/ag';
import BookingFeeModal from '@/components/listing-detail/BookingFeeModal';
import RequestSent from '@/components/listing-detail/RequestSent';
import DetailHero from '@/components/listing-detail/DetailHero';
import type { ShareOutcome } from '@/lib/share';
import {
  AboutSection, PhotoStrip, OffersSection, HostSection, DriverSection, BestTimeSection, RoutesSection,
  LocationSection, HighlightsSection, VisitInfoSection, NearbySection,
} from '@/components/listing-detail/sections';
import { ReserveSection, BookBar } from '@/components/listing-detail/ReserveSection';
import ContactSection from '@/components/listing-detail/ContactSection';
import ReviewsSection from '@/components/listing-detail/ReviewsSection';
import { GuideSection, ServicesSection, RoomsFoodSection, RecommendedDriversSection, PriceListSection, OwnerSection } from '@/components/listing-detail/profileSections';
import { ctaFor } from '@/components/listing-detail/cta';
import { useBookingFlow } from '@/components/listing-detail/useBookingFlow';
import { useAuth } from '@/context/AuthContext';
import { BusinessModeNotice } from '@/components/TravellerOnly';

/**
 * Public listing detail page (red /7 item view): one 720px column - photo, title, photo strip,
 * facts, about, host, prices, map, nearby, booking steps, reviews - and the price + Book now bar
 * over the tab bar. Which blocks show depends on the listing's type. Booking/payment state lives
 * in useBookingFlow; each block is its own component under components/listing-detail.
 */
export default function ListingDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { hash } = useLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const booking = useBookingFlow(item, id);
  const { isHostMode, provider } = useAuth();

  useEffect(() => {
    // `cancelled` guards against the responses arriving out of order: navigating from one
    // listing to another could otherwise let the first, slower response overwrite the second
    // and leave the previous listing rendered under the new URL (with the booking flow then
    // holding one listing's data and the other's id).
    let cancelled = false;
    setLoading(true);
    // Clearing the item first means a failed or missing listing shows "not found" rather than
    // silently leaving the previously viewed one on screen.
    setItem(null);
    api.get(`/listings/${id}`)
      .then((r) => { if (!cancelled) setItem(r.data.item); })
      .catch(() => { if (!cancelled) setItem(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Arriving on /listing/:id#reviews (the star on a feed card) used to land at
  // the top of the page: the page renders a loading placeholder first, so at
  // navigation time there is no #reviews element for anything to scroll to.
  // Once the listing is in, the section exists - jump to it then.
  useEffect(() => {
    if (loading || !item || !hash) return;
    // getElementById, not querySelector: a hash is arbitrary user-controlled text, and anything
    // that isn't a valid CSS selector (/listing/<id>#1, or a percent-encoded one) makes
    // querySelector throw, which took the whole page down to a blank screen.
    const el = document.getElementById(decodeURIComponent(hash.slice(1)));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading, item, hash]);

  // Every directions button on this page - the action row, the map, the contact
  // box - routes to this listing's own pin through here.
  const openMaps = () => openDirections(item);

  const shareIt = async (): Promise<ShareOutcome> => {
    if (!item) return 'failed';
    // Share the canonical listing URL rather than window.location.href, which would
    // carry an incidental #reviews hash into whatever the visitor pastes it into.
    return shareLink({
      title: item.title,
      text: item.description,
      url: `${window.location.origin}/listing/${item.id}`,
    });
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

  // A host who switched availability off takes no bookings (the server refuses them too).
  // Off when the host switched availability off, or their free start is used up and not paid yet
  // (backend lib/hostGrace.ts); the page stays up either way.
  const available = item.extras?.available !== false && item.bookings_paused !== true;
  const reservable = item.type === 'homestay' || item.type === 'driver' || item.type === 'guide';
  const bookable = !ownPreview && available && reservable;
  // Booked online (homestay/driver/guide) get the booking steps; shops, cafes and events instead get
  // a direct-contact box. Spots and biodiversity stay purely informational.
  const contactable = !ownPreview && ['shop', 'cafe', 'event'].includes(item.type);
  const place = item.type === 'spot' || item.type === 'event' || item.type === 'biodiversity';

  // A homestay's price is per person, not per night - the provider onboarding asks for
  // "Starting Price (₹/Head)", so the unit reads "/ person / night" in every language (QA 3.1).
  // Drivers and guides charge by the day.
  const unit = item.type === 'homestay' ? t('common.per_head') : (item.type === 'driver' || item.type === 'guide') ? t('common.per_day') : '';
  const cta = ctaFor(item.type, item.request_to_book === true);
  const amenities = amenitiesFor(item);
  const host = hostFor(item);
  const c = contentFor(item);
  // Admin-authored visitor info  only tourist spots carry it (see the admin console).
  const spotInfo = spotInfoFor(item);
  const isSpot = item.type === 'spot';

  const ownPhotos: string[] = Array.isArray(item.extras?.images) ? item.extras.images.filter((u: unknown) => typeof u === 'string' && u) : [];
  // The strip: drivers show the car photos they uploaded (never a stand-in); a homestay labels its
  // own photos by what they show (front, outside, room); everyone else gets their own photos or
  // the curated set.
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
  // Driver titles read "Tenzing - Local Taxi Driver"; the heading wants the
  // person, not the role, so keep only what precedes the dash.
  const driverName = (item.title || '').split(/\s+[-–-]\s+/)[0].trim();
  const offersTitle = (item.type === 'driver' || item.type === 'guide') && driverName
    ? t('detail.offers_by', { name: driverName })
    : t('detail.offers');
  const roomCount = Array.isArray(item.extras?.rooms) ? item.extras.rooms.length : 0;
  const showHost = !place && !ownPreview && (host.known || !!item.host_page_path);
  const delivery = !ownPreview && ['cafe', 'shop', 'homestay'].includes(item.type) && !item.bookings_paused && item.extras?.home_delivery;

  // "Book now" on the bar brings up the booking steps, ready to fill.
  const goBook = () => {
    const el = document.getElementById('book');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.querySelector<HTMLElement>('input:not([disabled]), select, button')?.focus({ preventScroll: true });
  };

  return (
    <div className="ag-wrap">
      {/* Every listing used to inherit the site-wide title and description, so
          Ghum Monastery and a Lebong homestay were indistinguishable to Google
          and to a WhatsApp link preview - only the <h1> differed (QA 3.4). The
          canonical is spelled out because a listing is reached with a trip's
          dates attached, and those must not fragment it into separate URLs. */}
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
            <Eye className="w-5 h-5 flex-none text-[var(--r)]" aria-hidden="true" />
            <p className="ag-small !text-[var(--ink-strong)]">{t('business_gate.preview')}</p>
          </Box>
        )}
        {item.not_live && (
          <Box flat data-testid="listing-not-live" className="!py-3 !gap-2">
            <Status className="self-start">{t('detail.not_live_tag', 'Not live yet')}</Status>
            <p className="ag-small !text-[var(--ink-strong)]">{t('business_gate.not_live')}</p>
          </Box>
        )}

        <DetailHero item={item} onShare={shareIt}>
          {showHost && (
            <p className="ag-small">
              {host.known && <>{t('detail.host_label', 'Host:')} </>}
              {item.host_page_path ? (
                <Link to={item.host_page_path} data-testid="listing-host-page" className="inline-flex items-center gap-0.5 text-[var(--r)] font-medium no-underline">
                  {host.known ? host.name : t('ui.listingDetail.see_host_page')} <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
              ) : <b className="font-medium text-[var(--ink-strong)]">{host.name}</b>}
            </p>
          )}
          {!isSpot && item.price > 0 && (
            <p className="m-0 text-[16px] leading-6 text-[var(--ink7)]">
              {(!unit || roomCount > 1) && <span className="ag-small">{t('common.starting_from')} </span>}
              <span className="text-[20px] font-medium text-[var(--ink-strong)]">₹{Number(item.price).toLocaleString('en-IN')}</span>
              {unit && <span className="ag-small"> {unit}</span>}
            </p>
          )}
          {item.type === 'event' && !(item.price > 0) && <p className="ag-small">{t('common.entry_varies')}</p>}
        </DetailHero>

        <div className="ag-row" data-testid="detail-actions">
          <AudioGuide title={item.title} aboutText={c.about || item.description} />
          <Button variant="tonal" size="sm" onClick={openMaps} icon={<MapPin />} data-testid="detail-directions">{t('detail.direction', 'Direction')}</Button>
          {delivery && <span className="contents" data-testid="listing-host-links"><DeliveryRequestButton listing={item} /></span>}
        </div>

        <PhotoStrip item={item} photos={strip} testid={ownStay ? 'detail-gallery' : 'detail-photos'}
          label={item.type === 'driver' ? t('detail.car_photos') : t('detail.photos')} />

        {/* The facts list: timings, entry fee, best season, altitude and the way there for a spot
            (all admin-entered, skipped when none is filled in); the season of a festival. */}
        {isSpot && spotInfo.has && (
          <VisitInfoSection
            facts={{ timings: spotInfo.timings, entryFee: spotInfo.entryFee, bestTime: spotInfo.bestTime, altitude: spotInfo.altitude }}
            howToReach={spotInfo.howToReach}
          />
        )}
        {item.type === 'event' && c.bestTime && <BestTimeSection bestTime={c.bestTime} />}

        <AboutSection item={item} about={c.about}
          label={item.type === 'driver' ? t('detail.about_driver') : item.type === 'guide' ? t('detail.about_guide') : t('detail.about')} />

        {/* A curated spot says why it's worth the trip. */}
        {isSpot && spotInfo.highlights.length > 0 && <HighlightsSection highlights={spotInfo.highlights} />}

        {/* Biodiversity entries are a species or habitat, not somewhere with facilities; a spot
            whose admin wrote real highlights skips the generic type-level amenities too. */}
        {item.type !== 'biodiversity' && !(isSpot && spotInfo.highlights.length > 0) && amenities.length > 0 && (
          <OffersSection amenities={amenities} title={offersTitle} />
        )}

        {item.type === 'homestay' && host.known && <HostSection item={item} host={host} personSrc={personSrc} />}
        {/* Drivers show the same photo here as the hero, so the face you scrolled past is the face you meet. */}
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

        {/* A place to visit leads on to stays and drivers near it, and to the guides
            (persona test 2026-11-09: spot pages were a dead end for planning the trip). */}
        {place && <NearbySection item={item} />}

        {!ownPreview && reservable && (
          <ReserveSection item={item} unit={unit} bookable={bookable} available={available} cta={cta} booking={booking} />
        )}

        {contactable && <ContactSection item={item} onOpenMaps={openMaps} />}

        <ReviewsSection item={item} />
      </div>

      {bookable && <BookBar item={item} unit={unit} onBook={goBook} />}

      <BookingFeeModal
        bookingId={booking.feeFor}
        onClose={() => { booking.setFeeFor(null); nav('/dashboard'); }}
        onConfirmed={(b) => { booking.setFeeFor(null); booking.setConfirm({ open: true, data: b }); }}
      />

      <RequestSent
        booking={booking.requested}
        title={item?.title || ''}
        onClose={() => booking.setRequested(null)}
        onTrips={() => { booking.setRequested(null); nav('/my-trips'); }}
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
