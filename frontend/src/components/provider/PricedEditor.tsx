import React from 'react';
import { Plus, Trash, Camera } from '@phosphor-icons/react';
import { uploadImage } from '@/lib/uploadImage';

export type Priced = { name: string; price: number | ''; unit: string; photo?: string };

const input = 'w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink';

/** Rows of a name, a price and a unit: rooms, food, a guide's services. */
export default function PricedEditor({ rows, onChange, units, unitLabel, namePlaceholder, addLabel, testid, max, fullNote }: {
  rows: Priced[]; onChange: (r: Priced[]) => void; units: string[]; unitLabel: (u: string) => string;
  namePlaceholder: string; addLabel: string; testid: string;
  /** Most rows allowed (a shop's goods stop at ten); the add button gives way to `fullNote`. */
  max?: number; fullNote?: string;
}) {
  const full = max !== undefined && rows.length >= max;
  const [busy, setBusy] = React.useState<number | null>(null);
  const pickPhoto = async (i: number, file?: File) => {
    if (!file) return;
    setBusy(i);
    try { set(i, { photo: await uploadImage(file) }); } catch { /* the row keeps its old photo */ } finally { setBusy(null); }
  };
  const set = (i: number, patch: Partial<Priced>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2" data-testid={testid}>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[2.5rem_1fr_8.5rem_auto] sm:grid-cols-[2.5rem_1fr_7rem_8.5rem_auto] gap-2 items-center">
          <label className="w-10 h-10 rounded-xl border border-[var(--line)] bg-white overflow-hidden grid place-items-center cursor-pointer text-ink-soft row-span-2 sm:row-span-1"
            title="Add a photo" aria-label="Add a photo">
            {busy === i ? <span className="text-[10px]">…</span> : r.photo ? <img src={r.photo} alt="" className="w-full h-full object-cover" /> : <Camera size={16} />}
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(i, e.target.files?.[0])} />
          </label>
          <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder={namePlaceholder}
            aria-label={namePlaceholder} className={`${input} col-span-3 sm:col-span-1`} />
          <input type="number" min={0} value={r.price} onChange={(e) => set(i, { price: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })}
            placeholder="₹" aria-label="Price" className={`${input}`} />
          <select value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} aria-label="Unit" className={`${input}`}>
            {units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
          </select>
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove"
            className="w-10 h-10 rounded-full grid place-items-center text-ink-soft hover:bg-white">
            <Trash size={18} />
          </button>
        </div>
      ))}
      {full ? (
        <p className="text-xs text-ink-soft">{fullNote}</p>
      ) : (
        <button type="button" onClick={() => onChange([...rows, { name: '', price: '', unit: units[0] }])}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--line)] bg-white text-sm font-bold text-ink btn-hover">
          <Plus size={16} /> {addLabel}
        </button>
      )}
    </div>
  );
}

