import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

const TYPES = ['homestay', 'driver', 'shop', 'cafe', 'spot', 'event', 'biodiversity'];

interface ListingFormValues {
  title: string;
  type: string;
  description: string;
  location: string;
  price: string;
  image: string;
  tags: string;
}

interface ListingFormModalProps {
  open: boolean;
  onClose: () => void;
  initial?: Partial<ListingFormValues> & { id?: string };
  onSubmit: (values: {
    title: string;
    type: string;
    description: string;
    location: string;
    price: number;
    image: string;
    tags: string[];
  }) => Promise<void>;
}

export default function ListingFormModal({ open, onClose, initial, onSubmit }: ListingFormModalProps) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<ListingFormValues>({
    title: initial?.title || '',
    type: initial?.type || 'homestay',
    description: initial?.description || '',
    location: initial?.location || '',
    price: initial?.price != null ? String(initial.price) : '',
    image: initial?.image || '',
    tags: Array.isArray((initial as any)?.tags) ? (initial as any).tags.join(', ') : (initial?.tags || ''),
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!form.title.trim() || !form.description.trim() || !form.location.trim()) {
      setErr('Title, description and location are required');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        type: form.type,
        description: form.description.trim(),
        location: form.location.trim(),
        price: Number(form.price) || 0,
        image: form.image.trim(),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      onClose();
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog" aria-modal="true" data-testid="listing-form-modal"
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 md:p-5 border-b border-[var(--line)]">
          <div className="font-display font-bold text-lg text-ink">{isEdit ? 'Edit listing' : 'Add listing'}</div>
          <button onClick={onClose} data-testid="listing-form-close" className="p-1.5 rounded-full hover:bg-mist" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 md:p-6 space-y-4 overflow-y-auto">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Title</span>
            <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
              data-testid="listing-form-title"
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
          </label>

          {!isEdit && (
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Type</span>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                data-testid="listing-form-type"
                className="mt-1 w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-sm capitalize focus:ring-2 focus:ring-primary/20 outline-none">
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          )}

          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Description</span>
            <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              data-testid="listing-form-description" rows={3}
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Location</span>
            <input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              data-testid="listing-form-location"
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Price (₹)</span>
              <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                data-testid="listing-form-price"
                className="mt-1 w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Image URL</span>
              <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })}
                data-testid="listing-form-image"
                className="mt-1 w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Tags (comma separated)</span>
            <input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })}
              data-testid="listing-form-tags"
              className="mt-1 w-full rounded-xl border border-[var(--line)] px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-primary/20 outline-none" />
          </label>

          {err && <p className="text-xs text-flag font-semibold">{err}</p>}

          <button type="submit" disabled={busy} data-testid="listing-form-submit"
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-pine text-white font-bold py-3 text-sm btn-hover disabled:opacity-60">
            {busy && <Loader2 size={16} className="animate-spin" />}
            {isEdit ? 'Save changes' : 'Add listing'}
          </button>
        </form>
      </div>
    </div>
  );
}
