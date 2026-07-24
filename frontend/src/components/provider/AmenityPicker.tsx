import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { optionLabel } from '@/lib/optionLabel';
import { toggleIn } from './ChipToggleGroup';

/**
 * Amenity checklist + free-text "add your own" input + removable chips of
 * everything picked. `compact` uses the tighter sizing of the dashboard
 * edit modal; the default sizing matches the onboarding screens.
 */
export default function AmenityPicker({
  presets,
  selected,
  onChange,
  customLabel,
  customPlaceholder,
  selectedLabel,
  compact = false,
}: {
  presets: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  customLabel?: string;
  customPlaceholder?: string;
  selectedLabel?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState('');
  const customLabelText = customLabel ?? t('widgets.add_custom_amenity');
  const customPlaceholderText = customPlaceholder ?? t('widgets.custom_amenity_ph');
  const selectedLabelText = selectedLabel ?? t('widgets.selected');

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    if (!selected.includes(value)) onChange([...selected, value]);
    setCustom('');
  };

  return (
    <>
      <div className={compact ? 'grid grid-cols-2 sm:grid-cols-3 gap-2.5' : 'mt-6 grid grid-cols-2 md:grid-cols-4 gap-3'}>
        {presets.map((amenity) => {
          const active = selected.includes(amenity);
          return (
            <button
              key={amenity}
              type="button"
              onClick={() => onChange(toggleIn(selected, amenity))}
              className={`flex items-center text-left rounded-xl border font-semibold transition-all ${
                compact ? 'gap-2.5 p-3 text-xs' : 'gap-3 p-4 text-sm'
              } ${active ? 'bg-pine/10 text-pine border-pine font-bold' : 'bg-white text-ink border-[var(--line)]'}`}
            >
              <input type="checkbox" checked={active} readOnly className="rounded border-[var(--line)] text-pine focus:ring-pine" />
              <span>{optionLabel(t, amenity)}</span>
            </button>
          );
        })}
      </div>

      <div className={compact ? 'max-w-md pt-2' : 'mt-8 max-w-md'}>
        <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">{customLabelText}</span>
        <div className="flex gap-2">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={customPlaceholderText}
            className={`flex-1 rounded-xl border border-[var(--line)] bg-white outline-none font-semibold text-ink ${
              compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm'
            }`}
          />
          <button
            type="button"
            onClick={addCustom}
            className={`rounded-xl bg-pine text-white font-bold btn-hover ${compact ? 'px-3.5 py-2 text-xs' : 'px-4 py-2.5 text-sm'}`}
          >
            {t('common.add')}
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className={compact ? 'pt-1' : 'mt-6 border-t border-[var(--line)] pt-5'}>
          {!compact && (
            <span className="text-xs font-semibold text-ink-soft uppercase block mb-3">
              {selectedLabelText} ({selected.length})
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            {selected.map((amenity) => (
              <span
                key={amenity}
                className={`inline-flex items-center gap-1.5 rounded-full bg-mist border border-[var(--line)] text-ink font-bold ${
                  compact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
                }`}
              >
                {optionLabel(t, amenity)}
                <button
                  type="button"
                  onClick={() => onChange(selected.filter((x) => x !== amenity))}
                  className="text-flag font-extrabold hover:scale-110 transition-transform ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
