import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash, Camera } from '@phosphor-icons/react';
import { uploadImage } from '@/lib/uploadImage';
import { Button, IconButton } from '@/components/ag';

export type Priced = { name: string; price: number | ''; unit: string; photo?: string };

/** Rows of a name, a price and a unit: rooms, food, a guide's services. */
export default function PricedEditor({ rows, onChange, units, unitLabel, namePlaceholder, addLabel, testid, max, fullNote }: {
  rows: Priced[]; onChange: (r: Priced[]) => void; units: string[]; unitLabel: (u: string) => string;
  namePlaceholder: string; addLabel: string; testid: string;
  /** Most rows allowed (a shop's goods stop at ten); the add button gives way to `fullNote`. */
  max?: number; fullNote?: string;
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
            <input type="number" min={0} value={r.price} onChange={(e) => set(i, { price: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
              placeholder="₹" aria-label={t('ui.pricedEditor.price')} className="ag-in" />
            <select value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} aria-label={t('ui.pricedEditor.unit')} className="ag-in">
              {units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
            </select>
          </div>
        </div>
      ))}
      {full ? (
        <p className="ag-small">{fullNote}</p>
      ) : (
        <Button size="sm" icon={<Plus />} className="self-start" onClick={() => onChange([...rows, { name: '', price: '', unit: units[0] }])}>
          {addLabel}
        </Button>
      )}
    </div>
  );
}
