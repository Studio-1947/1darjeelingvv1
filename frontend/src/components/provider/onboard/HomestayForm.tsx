import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { HOMESTAY_AMENITIES, HOMESTAY_TAGS } from '@/constants/listingOptions';
import ChipToggleGroup, { toggleIn } from '../ChipToggleGroup';
import AmenityPicker from '../AmenityPicker';
import AvatarUploader from '../AvatarUploader';
import GalleryUploader from '../GalleryUploader';
import LocationPicker from '@/components/LocationPicker';
import { Screen, Eyebrow } from './layout';
import OnboardHero from './OnboardHero';
import PriceSubmitScreen from './PriceSubmitScreen';
import { OnboardState } from './useProviderOnboard';

/** Step 2 for homestays - a live replica of the public listing page to fill in. */
export default function HomestayForm({ o }: { o: OnboardState }) {
  const { t } = useTranslation();
  const { form, update } = o;
  return (
    <div className="pb-10">
      <OnboardHero
        typeLabel={t('ob.hs.type_label')}
        name={form.business_name}
        onName={(v) => update({ business_name: v })}
        placeholder={t('ob.hs.name_ph')}
        image={form.image_url}
        uploading={o.uploading}
        onUpload={o.handleCoverUpload}
        meta={
          <>
            <span className="flex items-center gap-1.5"><MapPin size={16} /> {form.location || t('ob.hs.default_location')}</span>
            <span className="flex items-center gap-1.5">₹{form.price_from || '1500'}<span className="font-normal text-white/75">{t('ob.hs.per_night_starting')}</span></span>
          </>
        }
      />

      {/* ABOUT */}
      <Screen tone="bg">
        <Eyebrow n="01">{t('ob.hs.about')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3 space-y-4">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('ob.hs.describe')}</h2>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={t('ob.hs.describe_ph')}
              className="w-full px-4 py-3.5 rounded-2xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
            />

            <div className="pt-4 space-y-3">
              <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider block">
                {t('ob.hs.photos_title', { defaultValue: 'Property Photos' })}
              </span>
              <p className="text-xs text-ink-soft">
                {t('ob.hs.photos_note', { defaultValue: 'Add photos of your homestay, rooms, views, and surroundings to show on your public listing page.' })}
              </p>
              <GalleryUploader
                images={o.gallery}
                uploading={o.uploadingGallery}
                onFilesSelected={o.handleGalleryUpload}
                onRemove={(i) => o.setGallery(o.gallery.filter((_, idx) => idx !== i))}
              />
            </div>
          </div>

          <div className="lg:col-span-2 mist-panel p-5 md:p-6 w-full space-y-4 bg-white">
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.location_area')}</span>
              <div className="mt-2">
                <LocationPicker
                  initialLat={form.latitude}
                  initialLng={form.longitude}
                  onLocationSelect={(lat, lng, name) =>
                    update({ latitude: lat, longitude: lng, ...(name ? { location: name } : {}) })
                  }
                />
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.full_address')}</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder={t('ob.hs.address_ph')}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.contact_phone')}</span>
              <input
                required
                type="text"
                value={form.contact_phone}
                onChange={(e) => update({ contact_phone: e.target.value })}
                placeholder={t('ob.hs.phone_ph')}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div className="pt-2">
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">{t('el.listing_tags')}</span>
              <ChipToggleGroup
                options={HOMESTAY_TAGS}
                selected={o.selectedTags}
                onToggle={(tag) => o.setSelectedTags(toggleIn(o.selectedTags, tag))}
              />
            </div>
          </div>
        </div>
      </Screen>

      {/* WHAT THIS PLACE OFFERS */}
      <Screen tone="white">
        <Eyebrow n="01.5">{t('ob.hs.offers')}</Eyebrow>
        <div className="mt-8 w-full">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('ob.hs.select_amenities')}</h2>
          <p className="text-sm text-ink-soft mt-2">{t('ob.hs.amenities_note')}</p>
          <AmenityPicker
            presets={HOMESTAY_AMENITIES}
            selected={o.selectedAmenities}
            onChange={o.setSelectedAmenities}
            customLabel={t('ob.hs.custom_amenity')}
            customPlaceholder={t('widgets.custom_amenity_ph')}
            selectedLabel={t('ob.hs.selected_amenities')}
          />
        </div>
      </Screen>

      {/* MEET YOUR HOST */}
      <Screen tone="mist">
        <Eyebrow n="02">{t('ob.hs.meet_host')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-2 text-center lg:text-left">
            <AvatarUploader
              src={form.host_avatar}
              initial={form.host_name || 'Host'}
              uploading={o.uploadingHostPic}
              onFileSelected={o.handleHostAvatarUpload}
              label={t('el.upload_host_photo')}
              className="flex flex-col items-center lg:items-start gap-3"
            />
            <div className="mt-5 flex flex-col gap-1 w-full text-left">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('el.host_name')}</span>
              <input
                type="text"
                value={form.host_name}
                onChange={(e) => update({ host_name: e.target.value })}
                placeholder={t('ob.hs.host_name_ph')}
                className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
          </div>

          <div className="lg:col-span-3 space-y-5">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.hs.host_bio')}</span>
              <textarea
                rows={3}
                value={form.host_bio}
                onChange={(e) => update({ host_bio: e.target.value })}
                placeholder={t('ob.hs.host_bio_ph')}
                className="px-4 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.hs.languages')}</span>
              <input
                type="text"
                value={form.languages}
                onChange={(e) => update({ languages: e.target.value })}
                placeholder={t('ob.languages_ph')}
                className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
          </div>
        </div>
      </Screen>

      <PriceSubmitScreen
        tone="white"
        n="03"
        heading={t('ob.hs.complete')}
        priceLabel={t('ob.hs.price_label')}
        pricePlaceholder="1500"
        priceSuffix={t('ob.hs.price_suffix')}
        feeNote={t('ob.hs.fee_note')}
        price={form.price_from}
        onPrice={(v) => update({ price_from: v })}
        showBreakfastOption
        breakfastIncluded={o.selectedAmenities.includes('Breakfast Included')}
        onBreakfastChange={(inc) => {
          if (inc) {
            if (!o.selectedAmenities.includes('Breakfast Included')) {
              o.setSelectedAmenities([...o.selectedAmenities, 'Breakfast Included']);
            }
          } else {
            o.setSelectedAmenities(o.selectedAmenities.filter((a) => a !== 'Breakfast Included'));
          }
        }}
        onSubmit={() => o.submit()}
        onBack={() => o.setStep(1)}
        busy={o.busy}
        disabled={o.busy || o.uploading || !form.price_from || !form.description || !form.location}
        msg={o.msg}
      />
    </div>
  );
}
