import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { House, Car, Coffee, Storefront as Shop, Check, Camera } from '@phosphor-icons/react';
import type { OnboardState } from '@/components/provider/onboard/useProviderOnboard';
import { VEHICLE_TYPES, HOMESTAY_AMENITIES, CAFE_AMENITIES, SHOP_AMENITIES } from '@/constants/listingOptions';
import { RouteListEditor, RouteSuggestions, RouteFareTable, StartingRateSummary } from '@/components/provider/RouteEditor';
import { MobileScreen, PrimaryButton, Touch, Slab } from '@/components/mobile';

const ROLES: { id: 'homestay' | 'driver' | 'cafe' | 'shop'; Icon: any }[] = [
  { id: 'homestay', Icon: House },
  { id: 'driver', Icon: Car },
  { id: 'cafe', Icon: Coffee },
  { id: 'shop', Icon: Shop },
];

/**
 * Mobile provider onboarding, matching RN's join.tsx -> setup.tsx -> (submit
 * triggers the real ₹99 payment automatically, so there's no separate
 * "plan" step to build) sequence, consuming the same useProviderOnboard()
 * hook state the desktop step components use - no new business logic, only
 * new mobile-styled layout. `guide` is excluded: no backend listing type
 * supports it, and it isn't in this app's own BUSINESS_TYPES constant either.
 *
 * Pragmatic scope note: the driver step reuses the existing (desktop-styled)
 * RouteEditor widgets as-is rather than rebuilding a mobile-specific fare
 * picker - real per-route pricing is complex enough that re-skinning it is
 * disproportionate for this phase; it's fully functional, just not
 * --mu-token-styled internally.
 */
export default function MobileProviderOnboardScreen({ o }: { o: OnboardState }) {
  const { t } = useTranslation();
  const [mobileStep, setMobileStep] = useState<'role' | 'basics' | 'details'>(
    o.step === 2 ? 'details' : 'role',
  );

  const type = o.form.business_type as 'homestay' | 'driver' | 'cafe' | 'shop';
  const isDriver = type === 'driver';
  const isCafeShop = type === 'cafe' || type === 'shop';
  const isHomestay = type === 'homestay';
  const amenityPresets = type === 'cafe' ? CAFE_AMENITIES : type === 'shop' ? SHOP_AMENITIES : HOMESTAY_AMENITIES;

  const toggleAmenity = (a: string) =>
    o.setSelectedAmenities(o.selectedAmenities.includes(a) ? o.selectedAmenities.filter((x) => x !== a) : [...o.selectedAmenities, a]);

  const fieldCls = 'mt-1 w-full px-3.5 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] text-sm text-[var(--mu-ink)] outline-none';

  const goBasics = () => setMobileStep('basics');
  const goDetails = () => {
    o.startDesignStep();
    setMobileStep('details');
  };

  return (
    <MobileScreen tone="light" className="lg:hidden min-h-screen flex flex-col pb-[calc(var(--bottom-nav-h)+1rem)]">
      {mobileStep === 'role' && (
        <div className="flex-1 px-6 pt-7">
          <Slab>{t('mobileProviderOnboard.tag')}</Slab>
          <h1 className="mt-1.5 font-[family-name:var(--mu-font-display)] font-black text-2xl text-[var(--mu-ink)] tracking-tight">
            {t('mobileProviderOnboard.role_title')}
          </h1>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {ROLES.map(({ id, Icon }) => {
              const active = type === id;
              return (
                <Touch
                  key={id}
                  onClick={() => o.update({ business_type: id })}
                  className={`text-left p-4 rounded-[var(--mu-r-card)] border ${active ? 'border-[var(--mu-green)] bg-[var(--mu-green-tint)]' : 'border-[var(--mu-border)] bg-[var(--mu-surface)]'}`}
                >
                  <Icon size={24} weight={active ? 'fill' : 'regular'} className={active ? 'text-[var(--mu-green)]' : 'text-[var(--mu-text-muted)]'} />
                  <div className="mt-2 text-sm font-bold text-[var(--mu-ink)]">{t(`mobileProviderOnboard.role_${id}`)}</div>
                  {active && <Check size={14} weight="bold" className="mt-1 text-[var(--mu-green)]" />}
                </Touch>
              );
            })}
          </div>
        </div>
      )}

      {mobileStep === 'basics' && (
        <div className="flex-1 px-6 pt-7 space-y-3">
          <h1 className="font-[family-name:var(--mu-font-display)] font-black text-2xl text-[var(--mu-ink)] tracking-tight">
            {t('mobileProviderOnboard.basics_title')}
          </h1>
          <label className="block">
            <Slab>{t('mobileProviderOnboard.business_name')}</Slab>
            <input value={o.form.business_name} onChange={(e) => o.update({ business_name: e.target.value })} className={fieldCls} />
          </label>
          <label className="block">
            <Slab>{t('mobileProviderOnboard.location')}</Slab>
            <input value={o.form.location} onChange={(e) => o.update({ location: e.target.value })} placeholder="Darjeeling" className={fieldCls} />
          </label>
          <label className="block">
            <Slab>{t('mobileProviderOnboard.phone')}</Slab>
            <input value={o.form.contact_phone} onChange={(e) => o.update({ contact_phone: e.target.value })} className={fieldCls} />
          </label>
          <label className="block">
            <Slab>{t('mobileProviderOnboard.description')}</Slab>
            <textarea value={o.form.description} onChange={(e) => o.update({ description: e.target.value })} rows={3} className={fieldCls} />
          </label>
          {o.msg && <p className="text-sm font-semibold" style={{ color: 'var(--mu-danger)' }}>{o.msg}</p>}
        </div>
      )}

      {mobileStep === 'details' && (
        <div className="flex-1 px-6 pt-7 space-y-4">
          <h1 className="font-[family-name:var(--mu-font-display)] font-black text-2xl text-[var(--mu-ink)] tracking-tight">
            {t('mobileProviderOnboard.details_title')}
          </h1>

          <label className="flex items-center gap-3 rounded-[var(--mu-r-card-xs)] border border-dashed border-[var(--mu-border-strong)] px-3.5 py-3">
            <Camera size={18} className="text-[var(--mu-text-muted)] flex-shrink-0" />
            <span className="flex-1 text-sm font-semibold text-[var(--mu-text-body)]">
              {o.uploading ? t('common.loading') : o.form.image_url ? t('mobileProviderOnboard.photo_uploaded') : t('mobileProviderOnboard.cover_photo')}
            </span>
            <input type="file" accept="image/*" onChange={o.handleCoverUpload} className="hidden" />
          </label>

          {isHomestay && (
            <>
              <label className="block">
                <Slab>{t('mobileProviderOnboard.host_name')}</Slab>
                <input value={o.form.host_name} onChange={(e) => o.update({ host_name: e.target.value })} className={fieldCls} />
              </label>
              <label className="block">
                <Slab>{t('mobileProviderOnboard.price_from')}</Slab>
                <input type="number" value={o.form.price_from} onChange={(e) => o.update({ price_from: e.target.value })} className={fieldCls} />
              </label>
            </>
          )}

          {isDriver && (
            <>
              <label className="block">
                <Slab>{t('mobileProviderOnboard.vehicle_type')}</Slab>
                <select value={o.vehicleType} onChange={(e) => o.setVehicleType(e.target.value)} className={fieldCls}>
                  <option value="">—</option>
                  {VEHICLE_TYPES.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label className="block">
                <Slab>{t('mobileProviderOnboard.car_model')}</Slab>
                <input value={o.carModel} onChange={(e) => o.setCarModel(e.target.value)} className={fieldCls} />
              </label>
              <div className="mobile-ui">
                <Slab>{t('mobileProviderOnboard.routes')}</Slab>
                <div className="mt-1.5">
                  <RouteListEditor routes={o.routes} onChange={o.setRoutes} emptyNote={t('ob.dr.routes_empty')} />
                  <RouteSuggestions routes={o.routes} onChange={o.setRoutes} />
                  <RouteFareTable routes={o.routes} onChange={o.setRoutes} emptyNote={t('ob.dr.rates_empty')} />
                  <StartingRateSummary routes={o.routes} />
                </div>
              </div>
            </>
          )}

          {isCafeShop && (
            <label className="block">
              <Slab>{t('mobileProviderOnboard.address')}</Slab>
              <input value={o.form.address} onChange={(e) => o.update({ address: e.target.value })} className={fieldCls} />
            </label>
          )}

          {!isDriver && (
            <div>
              <Slab>{t('mobileProviderOnboard.amenities')}</Slab>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {amenityPresets.slice(0, 10).map((a) => {
                  const active = o.selectedAmenities.includes(a);
                  return (
                    <Touch
                      key={a}
                      onClick={() => toggleAmenity(a)}
                      className={`px-3 py-1.5 rounded-[var(--mu-r-chip)] border text-xs font-semibold ${active ? 'border-[var(--mu-green)] bg-[var(--mu-green-tint)] text-[var(--mu-green-deep)]' : 'border-[var(--mu-border)] bg-[var(--mu-surface)] text-[var(--mu-text-body)]'}`}
                    >
                      {a}
                    </Touch>
                  );
                })}
              </div>
            </div>
          )}

          {o.msg && <p className="text-sm font-semibold" style={{ color: 'var(--mu-danger)' }}>{o.msg}</p>}
        </div>
      )}

      <div className="px-6 pb-8 pt-3">
        {mobileStep === 'role' && (
          <PrimaryButton onClick={goBasics} className="w-full">{t('mobileProviderOnboard.continue')} →</PrimaryButton>
        )}
        {mobileStep === 'basics' && (
          <div className="flex gap-2.5">
            <Touch onClick={() => setMobileStep('role')} className="flex-1 py-3 rounded-[var(--mu-r-chip)] border border-[var(--mu-border-strong)] text-center text-sm font-bold text-[var(--mu-ink)]">
              {t('common.back', 'Back')}
            </Touch>
            <PrimaryButton onClick={goDetails} className="flex-[1.6]">{t('mobileProviderOnboard.continue')} →</PrimaryButton>
          </div>
        )}
        {mobileStep === 'details' && (
          <PrimaryButton onClick={() => o.submit()} disabled={o.busy} className="w-full">
            {o.busy ? t('common.loading') : t('mobileProviderOnboard.submit')}
          </PrimaryButton>
        )}
      </div>
    </MobileScreen>
  );
}
