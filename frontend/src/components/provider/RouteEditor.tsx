import React, { useState } from 'react';
import { MAX_PRICE } from '@/lib/hostFormChecks';
import { useTranslation } from 'react-i18next';
import { Plus, X } from '@phosphor-icons/react';
import { optionLabel } from '@/lib/optionLabel';
import { RouteFare, RouteUnit, DEFAULT_ROUTE_UNIT } from '@/lib/routeFares';
import { Button, IconButton } from '@/components/ag';

/** List of routes with remove buttons plus an add-on-Enter input row. */
export function RouteListEditor({ routes, onChange, emptyNote }: {
  routes: RouteFare[];
  onChange: (next: RouteFare[]) => void;
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
    <div className="grid gap-2">
      {routes.map((r, i) => (
        <div key={i} className="flex items-center gap-2 rounded-[18px] border border-[var(--warmline)] bg-[var(--surface)] py-2 pl-4 pr-2">
          <span className="min-w-0 flex-1 text-sm text-[var(--ink-strong)]">{optionLabel(t, r.route)}</span>
          {r.price > 0 && (
            <span className="ag-price text-sm">₹{r.price} <span className="unit">{t(`widgets.per_${r.unit}`)}</span></span>
          )}
          <IconButton small label={t('widgets.remove_route', { route: r.route })} onClick={() => onChange(routes.filter((_, idx) => idx !== i))}>
            <X />
          </IconButton>
        </div>
      ))}
      {routes.length === 0 && emptyNote && <p className="ag-small">{emptyNote}</p>}
      <div className="flex items-center gap-2">
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
          aria-label={t('widgets.route_ph')}
          className="ag-in min-w-0 flex-1"
        />
        <Button size="sm" icon={<Plus />} onClick={add}>{t('common.add')}</Button>
      </div>
    </div>
  );
}

/**
 * Per-route rate entry: one price + unit per route the driver operates.
 * Deliberately edits only prices - routes are added/removed in RouteListEditor -
 * so a driver setting fares can't accidentally lose a route.
 */
export function RouteFareTable({ routes, onChange, emptyNote }: {
  routes: RouteFare[];
  onChange: (next: RouteFare[]) => void;
  emptyNote?: string;
}) {
  const { t } = useTranslation();

  const patch = (i: number, fields: Partial<RouteFare>) =>
    onChange(routes.map((r, idx) => (idx === i ? { ...r, ...fields } : r)));

  if (routes.length === 0) {
    return <p className="ag-small">{emptyNote || t('ob.dr.rates_empty')}</p>;
  }

  const units: RouteUnit[] = ['trip', 'day'];

  return (
    <div className="grid gap-2.5">
      {routes.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-[18px] border border-[var(--warmline)] bg-[var(--surface)] p-3">
          <span className="text-sm font-medium text-[var(--ink-strong)]">{optionLabel(t, r.route)}</span>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="0"
              max={MAX_PRICE}
              value={r.price || ''}
              onChange={(e) => patch(i, { price: Math.min(MAX_PRICE, Number(e.target.value) || 0) })}
              placeholder={`₹ ${t('widgets.rate_ph')}`}
              aria-label={t('widgets.rate_for_route', { route: r.route })}
              className="ag-in"
            />
            <div className="ag-seg" role="group" aria-label={t('ui.pricedEditor.unit')}>
              {units.map((u) => (
                <button key={u} type="button" onClick={() => patch(i, { unit: u })} aria-pressed={r.unit === u}
                  className={r.unit === u ? '!bg-[var(--surface)] !text-[var(--r)] shadow-sm' : undefined}>
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
