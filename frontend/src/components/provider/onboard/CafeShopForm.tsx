import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { CAFE_AMENITIES, SHOP_AMENITIES, CAFE_TAGS, SHOP_TAGS } from '@/constants/listingOptions';
import ChipToggleGroup, { toggleIn } from '../ChipToggleGroup';
import AmenityPicker from '../AmenityPicker';
import GalleryUploader from '../GalleryUploader';
import LocationPicker from '@/components/LocationPicker';
import { Screen, Eyebrow } from './layout';
import OnboardHero from './OnboardHero';
import PriceSubmitScreen from './PriceSubmitScreen';
import { OnboardState } from './useProviderOnboard';

/** Step 2 for cafés and shops - one flow, with type-specific copy and presets. */
export default function CafeShopForm({ o }: { o: OnboardState }) {
  const { t } = useTranslation();
  const { form, update } = o;
  const isCafe = form.business_type === 'cafe';
  const typeLabel = isCafe ? t('ob.cs.cafe_label') : t('ob.cs.shop_label');
  const amenityPresets = isCafe ? CAFE_AMENITIES : SHOP_AMENITIES;
  const tagPresets = isCafe ? CAFE_TAGS : SHOP_TAGS;

  return (
    <div className="pb-10">
      <OnboardHero
        typeLabel={typeLabel}
        name={form.business_name}
        onName={(v) => update({ business_name: v })}
        placeholder={isCafe ? t('ob.cs.cafe_name_ph') : t('ob.cs.shop_name_ph')}
        image={form.image_url}
        uploading={o.uploading}
        onUpload={o.handleCoverUpload}
        meta={
          <>
            <span className="flex items-center gap-1.5"><MapPin size={16} /> {form.location || t('ob.dr.default_location')}</span>
            {form.price_from && <span className="flex items-center gap-1.5">₹{form.price_from}<span className="font-normal text-white/75"> {t('ob.cs.avg_spend_meta')}</span></span>}
          </>
        }
      />

      {/* ABOUT */}
      <Screen tone="bg">
        <Eyebrow n="01">{isCafe ? t('ob.cs.about_cafe') : t('ob.cs.about_shop')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3 space-y-4">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">
              {isCafe ? t('ob.cs.describe_cafe') : t('ob.cs.describe_shop')}
            </h2>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={isCafe ? t('ob.cs.describe_cafe_ph') : t('ob.cs.describe_shop_ph')}
              className="w-full px-4 py-3.5 rounded-2xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
            />
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
                placeholder={t('ob.cs.address_ph')}
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
                placeholder={t('ob.dr.phone_ph')}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div className="pt-1">
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">{t('ob.cs.tags')}</span>
              <ChipToggleGroup
                options={tagPresets}
                selected={o.selectedTags}
                onToggle={(tag) => o.setSelectedTags(toggleIn(o.selectedTags, tag))}
              />
            </div>
          </div>
        </div>
      </Screen>

      {/* WHAT WE OFFER */}
      <Screen tone="white">
        <Eyebrow n="02">{t('ob.cs.what_we_offer')}</Eyebrow>
        <div className="mt-8">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('ob.cs.select_offerings')}</h2>
          <p className="text-sm text-ink-soft mt-2">{isCafe ? t('ob.cs.offer_note_cafe') : t('ob.cs.offer_note_shop')}</p>
          <AmenityPicker
            presets={amenityPresets}
            selected={o.selectedAmenities}
            onChange={o.setSelectedAmenities}
            customLabel={t('ob.cs.custom_offering')}
            customPlaceholder={isCafe ? t('ob.cs.custom_ph_cafe') : t('ob.cs.custom_ph_shop')}
            selectedLabel={t('widgets.selected')}
          />
        </div>
      </Screen>

      {/* PHOTOS */}
      <Screen tone="mist">
        <Eyebrow n="03">{t('ob.cs.photos')}</Eyebrow>
        <div className="mt-8">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">
            {isCafe ? t('ob.cs.show_cafe') : t('ob.cs.show_shop')}
          </h2>
          <p className="text-sm text-ink-soft mt-2 mb-6">
            {isCafe ? t('ob.cs.photos_note_cafe') : t('ob.cs.photos_note_shop')}
          </p>
          <GalleryUploader
            images={o.gallery}
            uploading={o.uploadingGallery}
            onFilesSelected={o.handleGalleryUpload}
            onRemove={(i) => o.setGallery(o.gallery.filter((_, idx) => idx !== i))}
          />
        </div>
      </Screen>

      <PriceSubmitScreen
        tone="white"
        n="04"
        heading={t('ob.dr.complete')}
        priceLabel={isCafe ? t('ob.cs.price_cafe') : t('ob.cs.price_shop')}
        pricePlaceholder={isCafe ? '300' : '500'}
        priceSuffix={isCafe ? t('ob.cs.suffix_cafe') : t('ob.cs.suffix_shop')}
        feeNote={isCafe ? t('ob.cs.fee_note_cafe') : t('ob.cs.fee_note_shop')}
        price={form.price_from}
        onPrice={(v) => update({ price_from: v })}
        onSubmit={() => o.submit()}
        onBack={() => o.setStep(1)}
        busy={o.busy}
        disabled={o.busy || o.uploading || o.uploadingGallery || !form.price_from || !form.description || !form.location}
        msg={o.msg}
      />
    </div>
  );
}
