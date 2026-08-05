import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { shareLink } from '@/lib/share';
import { openDirections } from '@/lib/directions';
import { ListingDetailSkeleton, LoadingStatus } from '@/components/skeletons';
import { amenitiesFor, hostFor } from '@/lib/listingMeta';
import { contentFor, listingImage, galleryImagesFor, personImageFor, spotInfoFor } from '@/lib/listingContent';
import Seo from '@/components/Seo';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import DetailHero from '@/components/listing-detail/DetailHero';
import type { ShareOutcome } from '@/lib/share';
import {
  AboutSection, PhotosSection, OffersSection, StayGallerySection,
  HostSection, DriverSection, BestTimeSection, RoutesSection, LocationSection,
  HighlightsSection, VisitInfoSection,
} from '@/components/listing-detail/sections';
import { ReserveSection, MobileStickyBar } from '@/components/listing-detail/ReserveSection';
import ContactSection from '@/components/listing-detail/ContactSection';
import ReviewsSection from '@/components/listing-detail/ReviewsSection';
import { ctaFor } from '@/components/listing-detail/cta';
import { useBookingFlow } from '@/components/listing-detail/useBookingFlow';

/**
 * Public listing detail page: a stack of full-screen sections chosen by the
 * listing's type. Booking/payment state lives in useBookingFlow; each section
 * is its own component under components/listing-detail.
 */
export default function ListingDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const nav = useNavigate();
  const { hash } = useLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const booking = useBookingFlow(item, id);

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
  // the top of the hero: the page renders a loading placeholder first, so at
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

  // Every directions CTA on this page - the one under the map, the walk-in
  // action, the mobile sticky bar, the contact screen - routes to this listing's
  // own pin through here.
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
  if (!item) return <div className="mx-auto max-w-5xl p-10">{t('common.not_found')}</div>;

  const bookable = item.type === 'homestay' || item.type === 'driver';
  // Booked online (homestay/driver) get the reserve form; shops, cafes and events instead get a
  // direct-contact/action screen. Spots and biodiversity stay purely informational.
  const contactable = ['shop', 'cafe', 'event'].includes(item.type);

  // A homestay's price is per person, not per night - the provider onboarding asks
  // for "Starting Price (₹/Head)". The `common.per_night` key said "/ head" in
  // English and "per night" in Hindi, Nepali and Bengali, so the same listing made
  // two different commercial claims depending on the language (QA 3.1).
  const unit = item.type === 'homestay' ? t('common.per_head') : item.type === 'driver' ? t('common.per_day') : '';
  const cta = ctaFor(item.type);
  const amenities = amenitiesFor(item);
  const host = hostFor(item);
  const c = contentFor(item);
  // Admin-authored visitor info — only tourist spots carry it (see the admin console).
  const spotInfo = spotInfoFor(item);
  const isSpot = item.type === 'spot';
  const initial = (item.title || '?').trim().charAt(0).toUpperCase();

  const gallery = galleryImagesFor(item);
  const personSrc = host.avatar || personImageFor(item);
  // Drivers show the same photo here as the hero, so the face you scrolled past
  // is the face you meet - no second stock person.
  const driverSrc = listingImage(item, 600, 600);
  // Driver titles read "Tenzing - Local Taxi Driver"; the heading wants the
  // person, not the role, so keep only what precedes the dash.
  const driverName = (item.title || '').split(/\s+[-–-]\s+/)[0].trim();
  const offersTitle = item.type === 'driver' && driverName
    ? t('detail.offers_by', { name: driverName })
    : t('detail.offers');

  return (
    <div className="pb-28 lg:pb-0">
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

      <DetailHero item={item} unit={unit} onShare={shareIt} />

      <AboutSection item={item} about={c.about}
        label={item.type === 'driver' ? t('detail.about_driver') : t('detail.about')} />

      {/* A curated spot leads with why it's worth the trip, before the photos. */}
      {isSpot && spotInfo.highlights.length > 0 && <HighlightsSection highlights={spotInfo.highlights} />}

      {/* Drivers get their portrait and routes instead of a place gallery. */}
      {item.type !== 'driver' && gallery.length > 0 && (
        <PhotosSection item={item} gallery={gallery} />
      )}

      {/* Timings, entry fee, best season, altitude and directions — all admin-entered, so
          the section is skipped entirely for a spot that has none of them filled in. */}
      {isSpot && spotInfo.has && (
        <VisitInfoSection
          facts={{
            timings: spotInfo.timings,
            entryFee: spotInfo.entryFee,
            bestTime: spotInfo.bestTime,
            altitude: spotInfo.altitude,
          }}
          howToReach={spotInfo.howToReach}
        />
      )}

      {/* Biodiversity entries are a species or habitat, not somewhere with
          facilities - "what this place offers" has nothing to say about them.
          A spot whose admin wrote real highlights skips it too: the generic
          type-level amenities would only restate them less specifically. */}
      {item.type !== 'biodiversity' && !(isSpot && spotInfo.highlights.length > 0) && amenities.length > 0 && (
        <OffersSection amenities={amenities} title={offersTitle} />
      )}

      {item.type === 'homestay' && item.extras?.images && item.extras.images.length > 0 && (
        <StayGallerySection images={item.extras.images} />
      )}

      {item.type === 'homestay' && <HostSection item={item} host={host} personSrc={personSrc} />}

      {item.type === 'driver' && <DriverSection item={item} about={c.about} personSrc={driverSrc} initial={initial} />}

      {item.type === 'event' && c.bestTime && <BestTimeSection bestTime={c.bestTime} />}

      {item.type === 'driver' && c.routes && c.routes.length > 0 && <RoutesSection routes={c.routes} />}

      {item.type !== 'driver' && (
        <LocationSection item={item} coords={c.coords} spotted={c.spotted} onOpenMaps={openMaps} />
      )}

      {bookable && (
        <ReserveSection item={item} unit={unit} bookable={bookable} cta={cta} booking={booking} onOpenMaps={openMaps} />
      )}

      {contactable && <ContactSection item={item} onOpenMaps={openMaps} />}

      <ReviewsSection item={item} />

      <MobileStickyBar item={item} unit={unit} bookable={bookable} cta={cta} busy={booking.busy}
        onBook={booking.doBook} onOpenMaps={openMaps} />

      <MockPaymentModal
        open={!!booking.payModal}
        onClose={() => booking.setPayModal(null)}
        amount={booking.payModal?.amount || 0}
        title={t('booking.pay_confirm')}
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
