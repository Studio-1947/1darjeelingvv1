import React from 'react';
import { useTranslation } from 'react-i18next';
import { Screen, Eyebrow } from './layout';

/** Final onboarding screen: starting price, the ₹99 fee note, submit + back. */
export default function PriceSubmitScreen({
  tone = 'white',
  n,
  heading,
  priceLabel,
  pricePlaceholder,
  priceSuffix,
  feeNote,
  price,
  onPrice,
  priceEditor,
  wide = false,
  showBreakfastOption = false,
  breakfastIncluded = true,
  onBreakfastChange,
  onSubmit,
  onBack,
  busy,
  disabled,
  msg,
}: {
  tone?: 'bg' | 'white' | 'mist';
  n: string;
  heading: string;
  priceLabel: string;
  pricePlaceholder?: string;
  priceSuffix?: string;
  feeNote: string;
  price?: string;
  onPrice?: (value: string) => void;
  /** Replaces the single-price input - drivers price each route separately. */
  priceEditor?: React.ReactNode;
  /** Gives the rate column equal width, for editors wider than one input. */
  wide?: boolean;
  showBreakfastOption?: boolean;
  breakfastIncluded?: boolean;
  onBreakfastChange?: (included: boolean) => void;
  onSubmit: () => void;
  onBack: () => void;
  busy: boolean;
  disabled: boolean;
  msg: string;
}) {
  const { t } = useTranslation();
  return (
    <Screen tone={tone}>
      <Eyebrow n={n}>{heading}</Eyebrow>
      <div className={`mt-8 grid gap-10 lg:gap-16 items-center ${wide ? 'lg:grid-cols-3' : 'lg:grid-cols-5'}`}>
        <div className={wide ? 'lg:col-span-2' : 'lg:col-span-2'}>
          <span className="text-xs font-semibold text-ink-soft uppercase">{priceLabel}</span>
          {priceEditor ? (
            <div className="mt-3">{priceEditor}</div>
          ) : (
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-3xl text-ink font-display font-extrabold">₹</span>
              <input
                required
                type="number"
                min="0"
                value={price}
                onChange={(e) => onPrice?.(e.target.value)}
                placeholder={pricePlaceholder}
                className="px-3 py-2 rounded-xl border border-[var(--line)] bg-white outline-none font-display font-extrabold text-4xl text-ink w-36"
              />
              <span className="text-sm font-semibold text-ink-soft">{priceSuffix}</span>
            </div>
          )}

          {showBreakfastOption && (
            <div className="mt-5 p-4 rounded-2xl border border-[var(--line)] bg-mist/60 space-y-2">
              <span className="text-xs font-bold text-ink-soft uppercase block">
                {t('ob.hs.breakfast_question', { defaultValue: 'Is Breakfast Included in this price?' })}
              </span>
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <label className={`flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${breakfastIncluded ? 'border-pine bg-pine/5 text-pine font-bold' : 'border-[var(--line)] bg-white text-ink font-semibold'}`}>
                  <input
                    type="radio"
                    name="breakfast_included_radio"
                    checked={breakfastIncluded === true}
                    onChange={() => onBreakfastChange?.(true)}
                    className="accent-pine w-4 h-4"
                  />
                  <span className="text-sm">{t('ob.hs.breakfast_yes', { defaultValue: 'Yes, Breakfast Included' })}</span>
                </label>
                <label className={`flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${!breakfastIncluded ? 'border-pine bg-pine/5 text-pine font-bold' : 'border-[var(--line)] bg-white text-ink font-semibold'}`}>
                  <input
                    type="radio"
                    name="breakfast_included_radio"
                    checked={breakfastIncluded === false}
                    onChange={() => onBreakfastChange?.(false)}
                    className="accent-pine w-4 h-4"
                  />
                  <span className="text-sm">{t('ob.hs.breakfast_no', { defaultValue: 'No, Breakfast Extra / Not Included' })}</span>
                </label>
              </div>
            </div>
          )}

          <p className="mt-5 text-xs text-ink-soft leading-relaxed">{feeNote}</p>
        </div>

        <div className={wide ? 'lg:col-span-1' : 'lg:col-span-3'}>
          <div className="mist-panel p-6 space-y-4">
            <button
              onClick={onSubmit}
              disabled={disabled}
              className="w-full py-4 rounded-full bg-flag text-white font-extrabold text-base btn-hover disabled:opacity-60"
            >
              {busy ? t('common.processing') : t('ob.submit_pay')}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-3 rounded-full border border-[var(--line)] text-ink font-bold text-sm btn-hover"
            >
              {t('ob.back_basic')}
            </button>
            {msg && <p className="text-sm text-center text-flag font-semibold">{msg}</p>}
          </div>
        </div>
      </div>
    </Screen>
  );
}
