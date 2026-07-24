import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { VEHICLE_TYPES } from '@/constants/listingOptions';
import ChipToggleGroup from '../ChipToggleGroup';
import AvatarUploader from '../AvatarUploader';
import GalleryUploader from '../GalleryUploader';
import { RouteListEditor, RouteSuggestions, RouteFareTable, StartingRateSummary } from '../RouteEditor';
import { allRoutesPriced } from '@/lib/routeFares';
import { Screen, Eyebrow } from './layout';
import OnboardHero from './OnboardHero';
import PriceSubmitScreen from './PriceSubmitScreen';
import { OnboardState } from './useProviderOnboard';

/** Step 2 for drivers - profile, vehicle, routes, trip gallery, and price. */
export default function DriverForm({ o }: { o: OnboardState }) {
  const { t } = useTranslation();
  const { form, update } = o;
  return (
    <div className="pb-10">
      <OnboardHero
        typeLabel={t('ob.dr.type_label')}
        name={form.business_name}
        onName={(v) => update({ business_name: v })}
        placeholder={t('ob.dr.name_ph')}
        image={form.image_url}
        uploading={o.uploading}
        onUpload={o.handleCoverUpload}
        meta={
          <>
            <span className="flex items-center gap-1.5"><MapPin size={16} /> {form.location || t('ob.dr.default_location')}</span>
            <span className="flex items-center gap-1.5">₹{o.routeStartingPrice || '2500'}<span className="font-normal text-white/75">{t('ob.dr.onwards')}</span></span>
          </>
        }
      />

      {/* ABOUT / BIO */}
      <Screen tone="bg">
        <Eyebrow n="01">{t('ob.dr.about')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3 space-y-4">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('ob.dr.introduce')}</h2>
            <textarea
              required
              rows={5}
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
              placeholder={t('ob.dr.introduce_ph')}
              className="w-full px-4 py-3.5 rounded-2xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
            />
          </div>

          <div className="lg:col-span-2 mist-panel p-5 md:p-6 w-full space-y-4 bg-white">
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.dr.base_area')}</span>
              <input
                required
                type="text"
                value={form.location}
                onChange={(e) => update({ location: e.target.value })}
                placeholder={t('ob.dr.base_ph')}
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
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-1">{t('el.car_model')}</span>
              <input
                required
                type="text"
                value={o.carModel}
                onChange={(e) => o.setCarModel(e.target.value)}
                placeholder={t('ob.dr.car_model_ph')}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">{t('ob.dr.vehicle_category')}</span>
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
        <Eyebrow n="02">{t('ob.dr.meet_driver')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-2 text-center lg:text-left">
            <AvatarUploader
              src={form.host_avatar}
              initial={form.business_name || 'D'}
              uploading={o.uploadingHostPic}
              onFileSelected={o.handleHostAvatarUpload}
              label={t('ob.dr.upload_photo')}
              className="flex flex-col items-center lg:items-start gap-3"
            />
            <p className="mt-4 text-xs text-ink-soft max-w-xs mx-auto lg:mx-0">
              {t('ob.dr.photo_note')}
            </p>
          </div>

          <div className="lg:col-span-3 space-y-5">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.dr.driver_name')}</span>
              <input
                type="text"
                value={form.host_name}
                onChange={(e) => update({ host_name: e.target.value })}
                placeholder={t('ob.dr.driver_name_ph')}
                className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
              />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.dr.gender')}</span>
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
                  {t('ob.dr.male')}
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
                  {t('ob.dr.female')}
                </label>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.dr.languages')}</span>
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

      {/* ROUTES COVERED */}
      <Screen tone="white">
        <Eyebrow n="03">{t('ob.dr.pin_routes')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
          <div className="lg:col-span-3">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('ob.dr.route_config')}</h2>
            <p className="text-sm text-ink-soft mt-2 mb-6">{t('ob.dr.route_note')}</p>
            <RouteListEditor
              routes={o.routes}
              onChange={o.setRoutes}
              emptyNote={t('ob.dr.routes_empty')}
            />
          </div>

          <div className="lg:col-span-2">
            <RouteSuggestions routes={o.routes} onChange={o.setRoutes} />
          </div>
        </div>
      </Screen>

      {/* PHOTO GALLERY */}
      <Screen tone="mist">
        <Eyebrow n="04">{t('ob.dr.additional_photos')}</Eyebrow>
        <div className="mt-8">
          <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">{t('ob.dr.show_vehicle')}</h2>
          <p className="text-sm text-ink-soft mt-2 mb-6">{t('ob.dr.gallery_note')}</p>
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
        wide
        heading={t('ob.dr.complete')}
        priceLabel={t('ob.dr.rates_label')}
        feeNote={t('ob.dr.fee_note')}
        priceEditor={
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">{t('ob.dr.rates_note')}</p>
            <RouteFareTable routes={o.routes} onChange={o.setRoutes} emptyNote={t('ob.dr.rates_empty')} />
            <StartingRateSummary routes={o.routes} />
          </div>
        }
        onSubmit={() => o.submit()}
        onBack={() => o.setStep(1)}
        busy={o.busy}
        disabled={o.busy || o.uploading || !allRoutesPriced(o.routes) || !form.description || !form.location}
        msg={o.msg}
      />
    </div>
  );
}
