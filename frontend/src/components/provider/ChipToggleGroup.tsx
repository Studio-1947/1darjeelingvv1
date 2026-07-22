import React from 'react';

/** Row of pill buttons; highlights the options present in `selected`. */
export default function ChipToggleGroup({ options, selected, onToggle }: {
  options: string[];
  selected: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              active ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-[var(--line)]'
            }`}
          >
            {option}
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
