import React from 'react';
import { MapPin } from 'lucide-react';
import { VEHICLE_TYPES } from '@/constants/listingOptions';
import ChipToggleGroup from '../ChipToggleGroup';
import AvatarUploader from '../AvatarUploader';
import GalleryUploader from '../GalleryUploader';
import { RouteListEditor, RouteSuggestions } from '../RouteEditor';
import { Screen, Eyebrow } from './layout';
import OnboardHero from './OnboardHero';
import PriceSubmitScreen from './PriceSubmitScreen';
import { OnboardState } from './useProviderOnboard';

/** Step 2 for drivers - profile, vehicle, routes, trip gallery, and price. */
export default function DriverForm({ o }: { o: OnboardState }) {
  const { form, update } = o;
  return (
    <div className="pb-10">
      <OnboardHero
        typeLabel="Driver"
        name={form.business_name}
        onName={(v) => update({ business_name: v })}
        placeholder="e.g. Tenzing – Local Taxi Driver"
        image={form.image_url}
        uploading={o.uploading}
        onUpload={o.handleCoverUpload}
        meta={
          <>
            <span className="flex items-center gap-1.5"><MapPin size={16} /> {form.location || 'Darjeeling Town'}</span>
            <span className="flex items-center gap-1.5">₹{form.price_from || '2500'}<span className="font-normal text-white/75">/day starting</span></span>
          </>
        }
      />

      {/* ABOUT / BIO */}
      <Screen tone="bg">
        <Eyebrow n="01">About the driver</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3 space-y-4">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Introduce Yourself</h2>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="Tell travellers about yourself, your experience, the areas you know well, and what makes a trip with you memorable..."
              className="w-full px-4 py-3.5 rounded-2xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
            />
          </div>

          <div className="lg:col-span-2 mist-panel p-5 md:p-6 w-full space-y-4 bg-white">
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">Location / Base Area</span>
              <input
                required
                type="text"
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder="e.g. Darjeeling Town"
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
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-1">Car Model / Vehicle Name</span>
              <input
                required
                type="text"
                value={o.carModel}
                onChange={(e) => o.setCarModel(e.target.value)}
                placeholder="e.g. Mahindra Bolero, Innova Crysta, Swift Dzire"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">Vehicle Category</span>
              <ChipToggleGroup
                options={VEHICLE_TYPES}
                selected={o.vehicleType ? [o.vehicleType] : []}
                onToggle={o.setVehicleType}
              />
            </div>
          </div>
        </div>
      </Screen>

      {/* MEET YOUR DRIVER - photo & name */}
      <Screen tone="mist">
        <Eyebrow n="02">Meet your driver</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-2 text-center lg:text-left">
            <AvatarUploader
              src={form.host_avatar}
              initial={form.business_name || 'D'}
              uploading={o.uploadingHostPic}
              onFileSelected={o.handleHostAvatarUpload}
              label="Upload Your Photo"
              className="flex flex-col items-center lg:items-start gap-3"
            />
            <p className="mt-4 text-xs text-ink-soft max-w-xs mx-auto lg:mx-0">
              This photo appears on your public listing page in the "Meet Your Driver" section.
            </p>
          </div>

          <div className="lg:col-span-3 space-y-5">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">Your Driver Name (as shown publicly)</span>
              <input
                type="text"
                value={form.host_name}
                onChange={(e) => update({ host_name: e.target.value })}
                placeholder="e.g. Tenzing Lepcha"
                className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">Gender</span>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={o.gender === 'male'}
                    onChange={() => o.setGender('male')}
                    className="accent-pine"
                  />
                  Male
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-ink cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={o.gender === 'female'}
                    onChange={() => o.setGender('female')}
                    className="accent-pine"
                  />
                  Female
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">Languages Spoken</span>
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

      {/* ROUTES COVERED */}
      <Screen tone="white">
        <Eyebrow n="03">Pin your routes</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Route Configuration (Where to / From)</h2>
            <p className="text-sm text-ink-soft mt-2 mb-6">Pin the exact routes and trips you operate (From - To). Travellers see these directly on your driver profile page.</p>
            <RouteListEditor
              routes={o.routes}
              onChange={o.setRoutes}
              emptyNote="No routes added yet. Use the input below."
            />
          </div>

          <div className="lg:col-span-2">
            <RouteSuggestions routes={o.routes} onChange={o.setRoutes} />
          </div>
        </div>
      </Screen>

      {/* PHOTO GALLERY */}
      <Screen tone="mist">
        <Eyebrow n="04">Additional photos</Eyebrow>
        <div className="mt-8">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Show Off Your Vehicle & Trips</h2>
          <p className="text-sm text-ink-soft mt-2 mb-6">Upload photos of your vehicle, trips you've done, and scenic routes. These appear as a gallery on your public listing page.</p>
          <GalleryUploader
            images={o.gallery}
            uploading={o.uploadingGallery}
            onFilesSelected={o.handleGalleryUpload}
            onRemove={(i) => o.setGallery(o.gallery.filter((_, idx) => idx !== i))}
          />
        </div>
      </Screen>

      <PriceSubmitScreen
        tone="bg"
        n="05"
        heading="Complete & go live"
        priceLabel="Starting Rate (₹/Day)"
        pricePlaceholder="2500"
        priceSuffix="/ day onwards"
        feeNote="A one-time platform fee of ₹99 is charged to list your driver profile live on the 1 Darjeeling directory."
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
