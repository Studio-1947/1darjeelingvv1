import React from 'react';
import { useTranslation } from 'react-i18next';
import { optionLabel } from '@/lib/optionLabel';
import { Chip, Chips } from '@/components/ag';

/** Row of chips; the options present in `selected` show red. */
export default function ChipToggleGroup({ options, selected, onToggle }: {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Chips>
      {options.map((option) => (
        // The English value is what gets stored; only the label is translated.
        <Chip key={option} on={selected.includes(option)} onClick={() => onToggle(option)}>
          {optionLabel(t, option)}
        </Chip>
      ))}
    </Chips>
  );
}

/** Immutable toggle of a value in a string list - for multi-select chips. */
export function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}
