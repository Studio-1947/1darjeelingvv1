import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Plus } from '@phosphor-icons/react';
import { optionLabel } from '@/lib/optionLabel';
import { Button, Chip, Chips } from '@/components/ag';
import { toggleIn } from './ChipToggleGroup';

/**
 * Amenity chips (the presets plus anything the host added) and an "add your own" field.
 * Tapping a chip picks or drops it; a custom one disappears when dropped.
 */
export default function AmenityPicker({ presets, selected, onChange }: {
  presets: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState('');
  const own = selected.filter((a) => !presets.includes(a));

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    if (!selected.includes(value)) onChange([...selected, value]);
    setCustom('');
  };

  return (
    <div className="grid gap-3">
      <Chips>
        {[...presets, ...own].map((amenity) => {
          const on = selected.includes(amenity);
          return (
            <Chip key={amenity} on={on} onClick={() => onChange(toggleIn(selected, amenity))}>
              {on && <Check weight="bold" aria-hidden="true" />}{optionLabel(t, amenity)}
            </Chip>
          );
        })}
      </Chips>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder={t('widgets.custom_amenity_ph')}
          aria-label={t('widgets.add_custom_amenity')}
          className="ag-in min-w-0 flex-1"
        />
        <Button size="sm" icon={<Plus />} onClick={addCustom}>{t('common.add')}</Button>
      </div>
    </div>
  );
}
