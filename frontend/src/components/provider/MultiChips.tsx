import React from 'react';
import { Check } from '@phosphor-icons/react';
import { Chip, Chips } from '@/components/ag';

/** A guide's kinds of guiding and the seasons they work (backend lib/hostProfile.ts GUIDE_TYPES, SEASONS). */
export const GUIDE_TYPES = ['trekking', 'heritage', 'nature', 'birding', 'tea', 'cultural', 'city', 'photography'];
export const SEASONS = ['spring', 'summer', 'monsoon', 'autumn', 'winter'];

/** Tap to pick any number of options; a picked one shows a tick. */
export default function MultiChips({ options, selected, onChange, label }: {
  options: string[]; selected: string[]; onChange: (v: string[]) => void; label: (o: string) => string;
}) {
  return (
    <Chips>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Chip key={o} on={on} onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}>
            {on && <Check weight="bold" aria-hidden="true" />}{label(o)}
          </Chip>
        );
      })}
    </Chips>
  );
}
