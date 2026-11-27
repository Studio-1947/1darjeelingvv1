import React from 'react';
import { MAX_PRICE } from '@/lib/hostFormChecks';
import { useTranslation } from 'react-i18next';
import { Plus, Trash, Camera, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { uploadImage } from '@/lib/uploadImage';
import { Button, IconButton } from '@/components/ag';
import { ROOM_BATHS, ROOM_BEDS, ROOM_FOODS } from '@/lib/roomFit';

export type Priced = {
  name: string; price: number | ''; unit: string; photo?: string;
  /** Homestay rooms only: people the room sleeps, extra mattresses (0-2) and what each extra person pays a night. */
  occ?: number | ''; extra_beds?: number; extra_bed_price?: number | '';
  /** Homestay rooms only, each optional: bed, bathroom and the food the night includes (lib/roomFit.ts ROOM_*). */
  bed?: string; bath?: string; food?: string;
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
  // The rows as they are now, so a photo that finishes uploading lands on what the host typed meanwhile.
  const latest = React.useRef(rows);
  latest.current = rows;
  const set = (i: number, patch: Partial<Priced>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // One photo at a time: each tile keeps its spinner until its own upload is done.
  const pickPhoto = async (i: number, file?: File) => {
    if (!file || busy !== null) return;
    setBusy(i);
    try {
      const photo = await uploadImage(file);
      onChange(latest.current.map((r, j) => (j === i ? { ...r, photo } : r)));
    } catch { /* the row keeps its old photo */ } finally { setBusy(null); }
  };
  return (
    <div className="grid gap-2.5" data-testid={testid}>
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-[18px] border border-[var(--warmline)] bg-[var(--surface)] p-3">
          <div className="flex items-center gap-2">
            <label className={`relative grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-2xl bg-[var(--r-tint)] text-[var(--r)] ${busy !== null ? 'pointer-events-none' : 'cursor-pointer'}`}
              title={t('ui.pricedEditor.add_photo')} aria-label={t('ui.pricedEditor.add_photo')} aria-busy={busy === i}>
              {r.photo ? <img src={r.photo} alt="" className="h-full w-full object-cover" /> : busy !== i && <Camera size={20} />}
              {/* While it uploads, a spinner over the tile, as the avatar does. */}
              {busy === i && (
                <span className="absolute inset-0 grid place-items-center bg-black/45 text-white" data-testid={`${testid}-photo-uploading-${i}`}>
                  <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                </span>
              )}
              <span className="sr-only" role="status" aria-live="polite">{busy === i ? t('common.uploading') : ''}</span>
              <input type="file" accept="image/*" className="sr-only" disabled={busy !== null}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickPhoto(i, f); }} />
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
              {/* What the room has, each optional; the first option leaves it unsaid. */}
              <div className="grid grid-cols-2 gap-2">
                {([['bed', ROOM_BEDS], ['bath', ROOM_BATHS]] as const).map(([k, opts]) => (
                  <select key={k} value={r[k] || ''} onChange={(e) => set(i, { [k]: e.target.value })}
                    aria-label={t(`room.${k}_label`)} className="ag-in" data-testid={`${testid}-${k}-${i}`}>
                    <option value="">{t(`room.${k}_label`)}: {t('room.not_set')}</option>
                    {opts.map((o) => <option key={o} value={o}>{t(`room.${k}_${o}`)}</option>)}
                  </select>
                ))}
              </div>
              <select value={r.food || ''} onChange={(e) => set(i, { food: e.target.value })}
                aria-label={t('room.food_label')} className="ag-in" data-testid={`${testid}-food-${i}`}>
                <option value="">{t('room.food_label')}: {t('room.not_set')}</option>
                {ROOM_FOODS.map((o) => <option key={o} value={o}>{t(`room.food_${o}`)}</option>)}
              </select>
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
