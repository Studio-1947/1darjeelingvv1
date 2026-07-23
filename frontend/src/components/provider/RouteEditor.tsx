import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { optionLabel } from '@/lib/optionLabel';
import { ROUTE_SUGGESTIONS } from '@/constants/listingOptions';

/** List of routes with remove buttons plus an add-on-Enter input row. */
export function RouteListEditor({ routes, onChange, compact = false, emptyNote }: {
  routes: string[];
  onChange: (next: string[]) => void;
  compact?: boolean;
  emptyNote?: string;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');

  const add = () => {
    const value = input.trim();
    if (!value) return;
    onChange([...routes, value]);
    setInput('');
  };

  return (
    <>
      <div className={`space-y-2 ${compact ? 'mb-3' : 'mb-4'}`}>
        {routes.map((r, i) => (
          <div key={i} className={`flex items-center rounded-xl bg-mist border border-[var(--line)] ${compact ? 'gap-2 p-3' : 'gap-3 p-4'}`}>
            <span className={`flex-1 text-ink font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{optionLabel(t, r)}</span>
            <button
              type="button"
              onClick={() => onChange(routes.filter((_, idx) => idx !== i))}
              className="text-flag hover:scale-110 transition-transform"
            >
              <X size={compact ? 14 : 16} />
            </button>
          </div>
        ))}
        {routes.length === 0 && emptyNote && <p className="text-sm text-ink-soft italic">{emptyNote}</p>}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={t('widgets.route_ph')}
          className={`flex-1 rounded-xl border border-[var(--line)] bg-white outline-none font-semibold text-ink ${
            compact ? 'px-3 py-2 text-xs' : 'px-3.5 py-2.5 text-sm'
          }`}
        />
        <button
          type="button"
          onClick={add}
          className={`rounded-xl bg-pine text-white font-bold btn-hover ${
            compact ? 'px-3.5 py-2 text-xs' : 'px-4 py-2.5 text-sm inline-flex items-center gap-1'
          }`}
        >
          {compact ? <Plus size={14} /> : <><Plus size={16} /> {t('common.add')}</>}
        </button>
      </div>
    </>
  );
}

/** Tappable panel of common Darjeeling routes; adds any not already picked. */
export function RouteSuggestions({ routes, onChange }: { routes: string[]; onChange: (next: string[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mist-panel p-5 bg-white space-y-2">
      <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft mb-3">{t('widgets.common_routes')}</p>
      {ROUTE_SUGGESTIONS.map((suggestion) => {
        const added = routes.includes(suggestion);
        return (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              if (!added) onChange([...routes, suggestion]);
            }}
            className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              added
                ? 'bg-pine/10 text-pine border-pine'
                : 'bg-white text-ink-soft border-[var(--line)] hover:border-pine/40 hover:text-ink'
            }`}
          >
            {added ? '✓ ' : '+ '}{optionLabel(t, suggestion)}
          </button>
        );
      })}
    </div>
  );
}
