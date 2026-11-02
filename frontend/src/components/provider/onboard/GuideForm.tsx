import React from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from '@phosphor-icons/react';
import OnboardHero from './OnboardHero';
import PriceSubmitScreen from './PriceSubmitScreen';
import { Screen, Eyebrow } from './layout';
import AvatarUploader from '../AvatarUploader';
import PricedEditor from '../PricedEditor';
import { OnboardState } from './useProviderOnboard';

const GUIDE_TYPES = ['trekking', 'heritage', 'nature', 'birding', 'tea', 'cultural', 'city', 'photography'];

/**
 * Step 2 for a guide, laid out like the driver and homestay forms: the cover and name, an
 * introduction, the guide themselves, and the services they charge for (at least one priced
 * service is what a guide needs before approval). The rest of the profile — age, seasons,
 * social links and more — is on the business profile page after sign-up.
 */
export default function GuideForm({ o }: { o: OnboardState }) {
  const { t } = useTranslation();
  const { form, update } = o;
  const priced = o.services.filter((s) => s.name.trim() && Number(s.price) > 0);
  const from = priced.length ? Math.min(...priced.map((s) => Number(s.price))) : 0;
  const input = 'mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink';

  return (
    <div data-testid="guide-onboard">
      <OnboardHero
        typeLabel={t('ob.gd.type_label')}
        name={form.business_name}
        onName={(v) => update({ business_name: v })}
        placeholder={t('ob.gd.name_ph')}
        image={form.image_url}
        uploading={o.uploading}
        onUpload={o.handleCoverUpload}
        meta={
          <>
            <span className="flex items-center gap-1.5"><MapPin size={16} /> {form.location || 'Darjeeling'}</span>
            {from > 0 && <span className="flex items-center gap-1.5">₹{from}<span className="font-normal text-white/75">{t('detail.onwards')}</span></span>}
          </>
        }
      />

      <Screen tone="white">
        <Eyebrow n="01">{t('ob.gd.about')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-2 gap-8">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.gd.introduce')}</span>
            <textarea rows={5} value={form.description} onChange={(e) => update({ description: e.target.value })}
              placeholder={t('ob.gd.introduce_ph')} className={input} data-testid="guide-description" />
          </label>
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.gd.base_area')}</span>
              <input value={form.location} onChange={(e) => update({ location: e.target.value })} placeholder="Darjeeling" className={input} data-testid="guide-location" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('ob.contact_phone')}</span>
              <input value={form.contact_phone} onChange={(e) => update({ contact_phone: e.target.value })} inputMode="tel" className={input} />
            </label>
          </div>
        </div>
      </Screen>

      <Screen tone="bg">
        <Eyebrow n="02">{t('detail.meet_guide')}</Eyebrow>
        <div className="mt-8 grid lg:grid-cols-2 gap-8 items-start">
          <AvatarUploader src={form.host_avatar} initial={(form.host_name || form.business_name || '?').charAt(0).toUpperCase()}
            uploading={o.uploadingHostPic} onFileSelected={o.handleHostAvatarUpload} label={t('hostProfile.your_photo')} />
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('hostProfile.your_name')}</span>
              <input value={form.host_name} onChange={(e) => update({ host_name: e.target.value })} className={input} />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('hostProfile.languages')}</span>
              <input value={form.languages} onChange={(e) => update({ languages: e.target.value })} className={input} />
            </label>
            <div>
              <span className="text-xs font-semibold text-ink-soft uppercase">{t('hostProfile.guide_type')}</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {GUIDE_TYPES.map((g) => {
                  const on = o.guideTypes.includes(g);
                  return (
                    <button key={g} type="button" aria-pressed={on}
                      onClick={() => o.setGuideTypes(on ? o.guideTypes.filter((x) => x !== g) : [...o.guideTypes, g])}
                      className={`px-3.5 py-2 rounded-full text-sm font-bold border ${on ? 'bg-[rgba(31,102,86,0.12)] text-[#1F6656] border-[#1F6656]' : 'bg-white text-ink-soft border-[var(--line)]'}`}>
                      {t(`profile.guide_type_${g}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Screen>

      <PriceSubmitScreen
        tone="white"
        n="03"
        wide
        heading={t('ob.gd.complete')}
        priceLabel={t('hostProfile.services')}
        feeNote={t('ob.dr.fee_note')}
        priceEditor={
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">{t('ob.gd.services_note')}</p>
            <PricedEditor rows={o.services} onChange={o.setServices} units={['day', 'trip', 'hour', 'person']}
              unitLabel={(u) => t(`profile.unit_${u}`)} namePlaceholder={t('hostProfile.service_ph')}
              addLabel={t('hostProfile.add_service')} testid="guide-services" />
          </div>
        }
        onSubmit={() => o.submit()}
        onBack={() => o.setStep(1)}
        busy={o.busy}
        disabled={o.busy || o.uploading || priced.length === 0 || !form.description || !form.location}
        msg={o.msg}
      />
    </div>
  );
}
