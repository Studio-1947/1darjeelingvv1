import React from 'react';
import { MAX_PRICE } from '@/lib/hostFormChecks';
import { useTranslation } from 'react-i18next';
import { Plus, Trash, Camera } from '@phosphor-icons/react';
import { uploadImage } from '@/lib/uploadImage';
import { Button, IconButton } from '@/components/ag';

export type Priced = {
  name: string; price: number | ''; unit: string; photo?: string;
  /** Homestay rooms only: people the room sleeps, extra mattresses (0-2) and what each extra person pays a night. */
  occ?: number | ''; extra_beds?: number; extra_bed_price?: number | '';
  /** Homestay rooms only: false when the host has let the room outside the app (shown as full). */
  available?: boolean;
};

/** Most people the "Sleeps" picker offers, and extra mattresses a room can take (backend lib/hostProfile.ts). */
const SLEEPS = Array.from({ length: 20 }, (_, i) => i + 1);
const EXTRA_BEDS = [0, 1, 2];

/** Rows of a name, a price and a unit: rooms, food, a guide's services. */
export default function PricedEditor({ rows, onChange, units, unitLabel, namePlaceholder, addLabel, testid, max, fullNote, sleeps }: {
  rows: Priced[]; onChange: (r: Priced[]) => void; units: string[]; unitLabel: (u: string) => string;
  namePlaceholder: string; addLabel: string; testid: string;
  /** Most rows allowed (a shop's goods stop at ten); the add button gives way to `fullNote`. */
  max?: number; fullNote?: string;
  /** Homestay rooms: each row also says how many it sleeps and how many more fit on an extra mattress. */
  sleeps?: boolean;
}) {
  const { t } = useTranslation();
  const full = max !== undefined && rows.length >= max;
  const [busy, setBusy] = React.useState<number | null>(null);
  const set = (i: number, patch: Partial<Priced>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const pickPhoto = async (i: number, file?: File) => {
    if (!file) return;
    setBusy(i);
    try { set(i, { photo: await uploadImage(file) }); } catch { /* the row keeps its old photo */ } finally { setBusy(null); }
  };
  return (
    <div className="grid gap-2.5" data-testid={testid}>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-[18px] border border-[var(--warmline)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-2">
            <label className="grid h-14 w-14 flex-none cursor-pointer place-items-center overflow-hidden rounded-2xl bg-[var(--r-tint)] text-[var(--r)]"
              title={t('ui.pricedEditor.add_photo')} aria-label={t('ui.pricedEditor.add_photo')}>
              {busy === i ? <span className="text-xs">…</span> : r.photo ? <img src={r.photo} alt="" className="h-full w-full object-cover" /> : <Camera size={20} />}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickPhoto(i, e.target.files?.[0])} />
            </label>
            <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder={namePlaceholder}
              aria-label={namePlaceholder} className="ag-in min-w-0 flex-1" />
            <IconButton label={t('ui.pricedEditor.remove')} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Trash />
            </IconButton>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min={0} max={MAX_PRICE} value={r.price} onChange={(e) => set(i, { price: e.target.value === '' ? '' : Math.min(MAX_PRICE, Math.max(0, Number(e.target.value))) })}
              placeholder="₹" aria-label={t('ui.pricedEditor.price')} className="ag-in" />
            {units.length === 1 ? (
              // One unit (a room: always a night for the whole room) is said, not offered as a choice.
              <span className="ag-in flex items-center text-[var(--ink-muted)]">{unitLabel(units[0])}</span>
            ) : (
              <select value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} aria-label={t('ui.pricedEditor.unit')} className="ag-in">
                {units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
              </select>
            )}
          </div>
          {sleeps && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <select value={r.occ || ''} onChange={(e) => set(i, { occ: e.target.value ? Number(e.target.value) : '', ...(e.target.value ? {} : { extra_beds: 0 }) })}
                  aria-label={t('ui.pricedEditor.sleeps_label')} className="ag-in" data-testid={`${testid}-occ-${i}`}>
                  {/* Only a room saved without a size shows "not set"; the host must pick one to save. */}
                  {!r.occ && <option value="">{t('ui.pricedEditor.sleeps_unset')}</option>}
                  {/* A room saved bigger than the list (the server allows 50) keeps its own number as an option. */}
                  {(Number(r.occ) > SLEEPS.length ? [...SLEEPS, Number(r.occ)] : SLEEPS).map((n) => <option key={n} value={n}>{t('ui.pricedEditor.sleeps', { count: n })}</option>)}
                </select>
                <select value={r.extra_beds || 0} disabled={!r.occ} onChange={(e) => set(i, { extra_beds: Number(e.target.value) })}
                  aria-label={t('ui.pricedEditor.extra_label')} className="ag-in" data-testid={`${testid}-extra-${i}`}>
                  {EXTRA_BEDS.map((n) => <option key={n} value={n}>{n ? t('ui.pricedEditor.extra', { count: n }) : t('ui.pricedEditor.extra_none')}</option>)}
                </select>
              </div>
              {!!r.occ && (r.extra_beds || 0) > 0 && (
                <div className="grid gap-1">
                  <input type="number" min={0} max={MAX_PRICE} value={r.extra_bed_price ?? ''}
                    onChange={(e) => set(i, { extra_bed_price: e.target.value === '' ? '' : Math.min(MAX_PRICE, Math.max(0, Number(e.target.value))) })}
                    placeholder={t('ui.pricedEditor.extra_price')} aria-label={t('ui.pricedEditor.extra_price')} className="ag-in" data-testid={`${testid}-extra-price-${i}`} />
                  <p className="ag-small">{t('ui.pricedEditor.extra_price_note')}</p>
                </div>
              )}
              {/* Let outside the app: switched off, the room shows as full and cannot be booked. */}
              <label className="ag-host-switch">
                <span>
                  {/* The same words as the profile's own switch on this page (hostProfile.available_on). */}
                  <b>{t('hostProfile.available_on')}</b>
                  <span className="ag-small">{r.available === false ? t('ui.pricedEditor.room_full_note') : t('ui.pricedEditor.room_open_note')}</span>
                </span>
                {/* Named by the wrapping label, so the note is read too (as the profile's Toggle). */}
                <input type="checkbox" role="switch" checked={r.available !== false}
                  onChange={(e) => set(i, { available: e.target.checked })} data-testid={`${testid}-open-${i}`} />
              </label>
            </>
          )}
        </div>
      ))}
      {full ? (
        <p className="ag-small">{fullNote}</p>
      ) : (
        <Button size="sm" icon={<Plus />} className="self-start" onClick={() => onChange([...rows, { name: '', price: '', unit: units[0], ...(sleeps ? { occ: 2 } : {}) }])}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}
