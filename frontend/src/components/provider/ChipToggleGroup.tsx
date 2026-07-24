import React from 'react';
import { useTranslation } from 'react-i18next';
import { optionLabel } from '@/lib/optionLabel';

/** Row of pill buttons; highlights the options present in `selected`. */
export default function ChipToggleGroup({ options, selected, onToggle }: {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            // The English value is what gets stored; only the label is translated.
            onClick={() => onToggle(option)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              active ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-[var(--line)]'
            }`}
          >
            {optionLabel(t, option)}
          </button>
        );
      })}
    </div>
  );
}

/** Immutable toggle of a value in a string list - for multi-select chips. */
export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
