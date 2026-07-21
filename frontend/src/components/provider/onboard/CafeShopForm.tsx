import React from 'react';
import { MapPin } from 'lucide-react';
import { CAFE_AMENITIES, SHOP_AMENITIES, CAFE_TAGS, SHOP_TAGS } from '@/constants/listingOptions';
import ChipToggleGroup, { toggleIn } from '../ChipToggleGroup';
import AmenityPicker from '../AmenityPicker';
import GalleryUploader from '../GalleryUploader';
import { Screen, Eyebrow } from './layout';
import OnboardHero from './OnboardHero';
import PriceSubmitScreen from './PriceSubmitScreen';
import { OnboardState } from './useProviderOnboard';

/** Step 2 for cafés and shops — one flow, with type-specific copy and presets. */
export default function CafeShopForm({ o }: { o: OnboardState }) {
  const { form, update } = o;
  const isCafe = form.business_type === 'cafe';
  const typeLabel = isCafe ? 'Café' : 'Shop';
  const amenityPresets = isCafe ? CAFE_AMENITIES : SHOP_AMENITIES;
  const tagPresets = isCafe ? CAFE_TAGS : SHOP_TAGS;

  return (
    <div className="pb-10">
      <OnboardHero
        typeLabel={typeLabel}
        name={form.business_name}
        onName={(v) => update({ business_name: v })}
        placeholder={isCafe ? 'e.g. Glenary’s Bakery & Café' : 'e.g. Nathmull’s Tea House'}
        image={form.image_url}
        uploading={o.uploading}
        onUpload={o.handleCoverUpload}
        meta={
          <>
            <span className="flex items-center gap-1.5"><MapPin size={16} /> {form.location || 'Darjeeling Town'}</span>
            {form.price_from && <span className="flex items-center gap-1.5">₹{form.price_from}<span className="font-normal text-white/75"> avg spend</span></span>}
          </>
        }
      />

      {/* ABOUT */}
      <Screen tone="bg">
        <Eyebrow n="01">About the {isCafe ? 'café' : 'shop'}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3 space-y-4">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">
              {isCafe ? 'Describe Your Café' : 'Describe Your Shop'}
            </h2>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={isCafe
                ? 'Tell visitors about your café — the vibe, menu highlights, seating, and what makes it special...'
                : 'Tell visitors about your shop — what you sell, your story, unique products, and why they should visit...'}
              className="w-full px-4 py-3.5 rounded-2xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
            />
          </div>

          <div className="lg:col-span-2 mist-panel p-5 md:p-6 w-full space-y-4 bg-white">
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">Location / Area</span>
              <input
                required
                type="text"
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="e.g. Nehru Road, Darjeeling"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">Full Address</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="e.g. 12 Nehru Road, near Chowrasta"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">Contact Phone</span>
              <input
                required
                type="text"
                value={form.contact_phone}
                onChange={(e) => update({ contact_phone: e.target.value })}
                placeholder="e.g. +91 98765 43210"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div className="pt-1">
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">Tags</span>
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
        <Eyebrow n="02">What we offer</Eyebrow>
        <div className="mt-8">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Select Your Offerings</h2>
          <p className="text-sm text-ink-soft mt-2">Pick what applies to your {isCafe ? 'café' : 'shop'}, and add anything custom.</p>
          <AmenityPicker
            presets={amenityPresets}
            selected={o.selectedAmenities}
            onChange={o.setSelectedAmenities}
            customLabel="Add Custom Offering"
            customPlaceholder={isCafe ? 'e.g. Live music nights' : 'e.g. Free gift wrapping'}
            selectedLabel="Selected"
          />
        </div>
      </Screen>

      {/* PHOTOS */}
      <Screen tone="mist">
        <Eyebrow n="03">Photos</Eyebrow>
        <div className="mt-8">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">
            {isCafe ? 'Show Off Your Space & Food' : 'Show Off Your Products & Store'}
          </h2>
          <p className="text-sm text-ink-soft mt-2 mb-6">
            {isCafe
              ? 'Upload photos of your café interior, food, drinks, and views. These appear as a gallery on your public listing.'
              : 'Upload photos of your products, storefront, and displays. These appear as a gallery on your public listing.'}
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
        heading="Complete & go live"
        priceLabel={isCafe ? 'Average Spend (₹/Person)' : 'Average Item Price (₹)'}
        pricePlaceholder={isCafe ? '300' : '500'}
        priceSuffix={isCafe ? 'per person' : 'onwards'}
        feeNote={`A one-time platform fee of ₹99 lists your ${isCafe ? 'café' : 'shop'} live on the 1 Darjeeling directory.`}
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
