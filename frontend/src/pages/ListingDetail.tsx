import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { amenitiesFor, hostFor } from '@/lib/listingMeta';
import { contentFor, listingImage, galleryImagesFor, personImageFor, fallbackFor } from '@/lib/listingContent';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import DetailHero, { ShareOutcome } from '@/components/listing-detail/DetailHero';
import {
  AboutSection, PhotosSection, OffersSection, StayGallerySection,
  HostSection, DriverSection, BestTimeSection, RoutesSection, LocationSection,
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

  const shareIt = async (): Promise<ShareOutcome> => {
    if (!item) return 'failed';
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text: item.description, url });
        return 'shared';
      } catch (e: any) {
        // The user dismissing the native share sheet throws AbortError - that's a deliberate
        // cancel, not a failure, so don't silently fall back to copying the link behind their back.
        if (e?.name === 'AbortError') return 'shared';
        console.warn('share failed', e);
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch (e) {
      console.warn('clipboard failed', e);
      return 'failed';
    }
  };

  if (loading) return <div className="mx-auto max-w-5xl p-10 text-ink-soft">{t('common.loading')}</div>;
  if (!item) return <div className="mx-auto max-w-5xl p-10">Not found.</div>;

  const bookable = item.type === 'homestay' || item.type === 'driver';
  // Booked online (homestay/driver) get the reserve form; shops, cafes and events instead get a
  // direct-contact/action screen. Spots and biodiversity stay purely informational.
  const contactable = ['shop', 'cafe', 'event'].includes(item.type);

  const unit = item.type === 'homestay' ? t('common.per_night') : item.type === 'driver' ? t('common.per_day') : '';
  const cta = ctaFor(item.type);
  const amenities = amenitiesFor(item);
  const host = hostFor(item);
  const c = contentFor(item);
  const initial = (item.title || '?').trim().charAt(0).toUpperCase();
  const fallbackImg = fallbackFor(item.type);

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
      <DetailHero item={item} unit={unit} onShare={shareIt} />

      <AboutSection item={item} about={c.about}
        label={item.type === 'driver' ? t('detail.about_driver') : t('detail.about')} />

      {/* Drivers get their portrait and routes instead of a place gallery. */}
      {item.type !== 'driver' && gallery.length > 0 && (
        <PhotosSection item={item} gallery={gallery} fallbackImg={fallbackImg} />
      )}

      {amenities.length > 0 && <OffersSection amenities={amenities} title={offersTitle} />}

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
