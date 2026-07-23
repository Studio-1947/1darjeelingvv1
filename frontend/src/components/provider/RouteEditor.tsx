import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { optionLabel } from '@/lib/optionLabel';
import { ROUTE_SUGGESTIONS } from '@/constants/listingOptions';
import { RouteFare, RouteUnit, DEFAULT_ROUTE_UNIT, startingPriceFrom } from '@/lib/routeFares';

/** List of routes with remove buttons plus an add-on-Enter input row. */
export function RouteListEditor({ routes, onChange, compact = false, emptyNote }: {
  routes: RouteFare[];
  onChange: (next: RouteFare[]) => void;
  compact?: boolean;
  emptyNote?: string;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');

  const add = () => {
    const value = input.trim();
    if (!value) return;
    // Adding the same route twice would give it two prices with no way to tell
    // which one applies, so a duplicate is a no-op rather than a second row.
    if (routes.some((r) => r.route.toLowerCase() === value.toLowerCase())) {
      setInput('');
      return;
    }
    onChange([...routes, { route: value, price: 0, unit: DEFAULT_ROUTE_UNIT }]);
    setInput('');
  };

  return (
    <>
      <div className={`space-y-2 ${compact ? 'mb-3' : 'mb-4'}`}>
        {routes.map((r, i) => (
          <div key={i} className={`flex items-center rounded-xl bg-mist border border-[var(--line)] ${compact ? 'gap-2 p-3' : 'gap-3 p-4'}`}>
            <span className={`flex-1 text-ink font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{optionLabel(t, r.route)}</span>
            {r.price > 0 && (
              <span className={`font-display font-extrabold text-pine ${compact ? 'text-xs' : 'text-sm'}`}>
                ₹{r.price}
                <span className="font-sans font-semibold text-ink-soft"> {t(`widgets.per_${r.unit}`)}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(routes.filter((_, idx) => idx !== i))}
              className="text-flag hover:scale-110 transition-transform"
              aria-label={t('widgets.remove_route', { route: r.route })}
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

/**
 * Per-route rate entry: one price + unit per route the driver operates.
 * Deliberately edits only prices - routes are added/removed in RouteListEditor -
 * so a driver setting fares can't accidentally lose a route.
 */
export function RouteFareTable({ routes, onChange, compact = false, emptyNote }: {
  routes: RouteFare[];
  onChange: (next: RouteFare[]) => void;
  compact?: boolean;
  emptyNote?: string;
}) {
  const { t } = useTranslation();

  const patch = (i: number, fields: Partial<RouteFare>) =>
    onChange(routes.map((r, idx) => (idx === i ? { ...r, ...fields } : r)));

  if (routes.length === 0) {
    return <p className="text-sm text-ink-soft italic">{emptyNote || t('ob.dr.rates_empty')}</p>;
  }

  const units: RouteUnit[] = ['trip', 'day'];

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {routes.map((r, i) => (
        <div
          key={i}
          className={`flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-[var(--line)] bg-white ${compact ? 'p-3' : 'p-4'}`}
        >
          <span className={`flex-1 text-ink font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>
            {optionLabel(t, r.route)}
          </span>

          <div className="flex items-center gap-2">
            <span className={`text-ink font-display font-extrabold ${compact ? 'text-base' : 'text-lg'}`}>₹</span>
            <input
              type="number"
              min="0"
              value={r.price || ''}
              onChange={(e) => patch(i, { price: Number(e.target.value) || 0 })}
              placeholder={t('widgets.rate_ph')}
              aria-label={t('widgets.rate_for_route', { route: r.route })}
              className={`rounded-xl border border-[var(--line)] bg-white outline-none font-display font-extrabold text-ink ${
                compact ? 'px-2.5 py-1.5 text-base w-24' : 'px-3 py-2 text-xl w-28'
              }`}
            />

            <div className="flex rounded-full border border-[var(--line)] overflow-hidden">
              {units.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => patch(i, { unit: u })}
                  aria-pressed={r.unit === u}
                  className={`font-bold transition-colors ${compact ? 'px-2.5 py-1.5 text-[10px]' : 'px-3 py-2 text-xs'} ${
                    r.unit === u ? 'bg-pine text-white' : 'bg-white text-ink-soft hover:text-ink'
                  }`}
                >
                  {t(`widgets.per_${u}`)}
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Read-only "₹X onwards", derived from the cheapest quoted route. */
export function StartingRateSummary({ routes }: { routes: RouteFare[] }) {
  const { t } = useTranslation();
  const from = startingPriceFrom(routes);
  if (!from) return null;
  return (
    <p className="text-sm text-ink-soft">
      {t('ob.dr.starting_rate')}{' '}
      <span className="font-display font-extrabold text-2xl text-ink align-middle">₹{from}</span>{' '}
      {t('ob.dr.onwards')}
    </p>
  );
}

/** Tappable panel of common Darjeeling routes; adds any not already picked. */
export function RouteSuggestions({ routes, onChange }: { routes: RouteFare[]; onChange: (next: RouteFare[]) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mist-panel p-5 bg-white space-y-2">
      <p className="text-xs font-extrabold uppercase tracking-widest text-ink-soft mb-3">{t('widgets.common_routes')}</p>
      {ROUTE_SUGGESTIONS.map((suggestion) => {
        const added = routes.some((r) => r.route === suggestion);
        return (
          <button
            key={suggestion}
            type="button"
            onClick={() => {
              if (!added) onChange([...routes, { route: suggestion, price: 0, unit: DEFAULT_ROUTE_UNIT }]);
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
