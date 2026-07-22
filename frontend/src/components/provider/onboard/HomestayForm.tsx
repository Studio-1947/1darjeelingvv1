import React from 'react';
import { MapPin } from 'lucide-react';
import { HOMESTAY_AMENITIES, HOMESTAY_TAGS } from '@/constants/listingOptions';
import ChipToggleGroup, { toggleIn } from '../ChipToggleGroup';
import AmenityPicker from '../AmenityPicker';
import AvatarUploader from '../AvatarUploader';
import { Screen, Eyebrow } from './layout';
import OnboardHero from './OnboardHero';
import PriceSubmitScreen from './PriceSubmitScreen';
import { OnboardState } from './useProviderOnboard';

/** Step 2 for homestays - a live replica of the public listing page to fill in. */
export default function HomestayForm({ o }: { o: OnboardState }) {
  const { form, update } = o;
  return (
    <div className="pb-10">
      <OnboardHero
        typeLabel="Homestay"
        name={form.business_name}
        onName={(v) => update({ business_name: v })}
        placeholder="Enter stay name..."
        image={form.image_url}
        uploading={o.uploading}
        onUpload={o.handleCoverUpload}
        meta={
          <>
            <span className="flex items-center gap-1.5"><MapPin size={16} /> {form.location || 'Lebong, Darjeeling'}</span>
            <span className="flex items-center gap-1.5">₹{form.price_from || '1500'}<span className="font-normal text-white/75">/night starting</span></span>
          </>
        }
      />

      {/* ABOUT */}
      <Screen tone="bg">
        <Eyebrow n="01">About the stay</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3 space-y-4">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Describe Your Homestay</h2>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Describe your homestay, rooms, meals, view, and unique things about your stay..."
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
                placeholder="e.g. Lebong, Darjeeling"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">Full Address</span>
              <input
                type="text"
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="e.g. 15 Gandhi Road, near Clock Tower"
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
                placeholder="e.g. +91 88888 88888"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div className="pt-2">
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">Listing Tags</span>
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
        <Eyebrow n="01.5">What this place offers</Eyebrow>
        <div className="mt-8 w-full">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Select Stay Amenities</h2>
          <p className="text-sm text-ink-soft mt-2">Choose what amenities you offer guests, and add any other custom ones.</p>
          <AmenityPicker
            presets={HOMESTAY_AMENITIES}
            selected={o.selectedAmenities}
            onChange={o.setSelectedAmenities}
            customLabel="Add Other Custom Amenity"
            customPlaceholder="e.g. Bonfire, Pet allowed"
            selectedLabel="All Selected Amenities"
          />
        </div>
      </Screen>

      {/* MEET YOUR HOST */}
      <Screen tone="mist">
        <Eyebrow n="02">Meet your host</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-2 text-center lg:text-left">
            <AvatarUploader
              src={form.host_avatar}
              initial={form.host_name || 'Host'}
              uploading={o.uploadingHostPic}
              onFileSelected={o.handleHostAvatarUpload}
              label="Upload Host Photo"
              className="flex flex-col items-center lg:items-start gap-3"
            />
            <div className="mt-5 flex flex-col gap-1 w-full text-left">
              <span className="text-xs font-semibold text-ink-soft uppercase">Host Name</span>
              <input
                type="text"
                value={form.host_name}
                onChange={(e) => update({ host_name: e.target.value })}
                placeholder="e.g. Mrs. Pradhan"
                className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
          </div>

          <div className="lg:col-span-3 space-y-5">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">Host Bio / Welcome Message</span>
              <textarea
                rows={3}
                value={form.host_bio}
                onChange={(e) => update({ host_bio: e.target.value })}
                placeholder="Tell guests about yourself. e.g. We are a family of four who love introducing visitors to Gorkha traditions..."
                className="px-4 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">Languages Spoken (comma separated)</span>
              <input
                type="text"
                value={form.languages}
                onChange={(e) => update({ languages: e.target.value })}
                placeholder="Nepali, Hindi, English"
                className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
          </div>
        </div>
      </Screen>

      <PriceSubmitScreen
        tone="white"
        n="03"
        heading="Complete profile"
        priceLabel="Starting Price (₹/Night)"
        pricePlaceholder="1500"
        priceSuffix="/ night onwards"
        feeNote="A one-time platform fee of ₹99 is charged to list your stay profile live on the homepage directory."
        price={form.price_from}
        onPrice={(v) => update({ price_from: v })}
        onSubmit={() => o.submit()}
        onBack={() => o.setStep(1)}
        busy={o.busy}
        disabled={o.busy || o.uploading || !form.price_from || !form.description || !form.location}
        msg={o.msg}
      />
    </div>
  );
}
