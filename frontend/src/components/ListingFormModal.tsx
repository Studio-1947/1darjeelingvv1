import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Button, FieldError, SelectField, TextArea, TextField } from '@/components/ag';
import { Sheet } from '@/components/provider/dashboard/widgets';

// 'spot' is deliberately absent: tourist spots are curated content authored only in the admin
// console, and the backend rejects a spot created by anyone but an admin (backend/src/lib/spots.ts).
// Offering it here would just be a dead option that 403s on submit.
const TYPES = ['homestay', 'driver', 'shop', 'cafe', 'event', 'biodiversity'];

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

/** The form values for a given listing, or the blank form when adding a new one. */
function formValuesFrom(initial: ListingFormModalProps['initial']): ListingFormValues {
  return {
    title: initial?.title || '',
    type: initial?.type || 'homestay',
    description: initial?.description || '',
    location: initial?.location || '',
    price: initial?.price != null ? String(initial.price) : '',
    image: initial?.image || '',
    tags: Array.isArray((initial as any)?.tags) ? (initial as any).tags.join(', ') : (initial?.tags || ''),
  };
}

export default function ListingFormModal({ open, onClose, initial, onSubmit }: ListingFormModalProps) {
  const { t } = useTranslation();
  const isEdit = !!initial?.id;
  const [form, setForm] = useState<ListingFormValues>(() => formValuesFrom(initial));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Both callers keep this modal mounted for the life of the page and only toggle `open`, with
  // no `key` to force a remount. Without re-syncing here the state captured on first mount (when
  // `initial` was still undefined) would be all this form ever showed: reopening "add" kept the
  // last listing's values, and the edit path could never prefill at all.
  useEffect(() => {
    if (!open) return;
    setForm(formValuesFrom(initial));
    setErr('');
    // `initial` is rebuilt on every parent render, so the identity of the listing is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (!form.title.trim() || !form.description.trim() || !form.location.trim()) {
      setErr(t('lf.required_error'));
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
      setErr(e?.response?.data?.detail || e.message || t('common.something_wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={isEdit ? t('lf.edit_title') : t('pd.add_listing')} onClose={onClose} closeTestId="listing-form-close" testId="listing-form-modal">
      <form onSubmit={handleSubmit} className="grid gap-4 p-4">
        <TextField label={t('lf.title')} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="listing-form-title" />
        {!isEdit && (
          <SelectField label={t('lf.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} data-testid="listing-form-type">
            {TYPES.map((ty) => <option key={ty} value={ty}>{t(`categories.${ty}`, { defaultValue: ty })}</option>)}
          </SelectField>
        )}
        <TextArea label={t('pd.description')} required rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="listing-form-description" />
        <TextField label={t('lf.location')} required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} data-testid="listing-form-location" />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={t('lf.price')} type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} data-testid="listing-form-price" />
          <TextField label={t('lf.image_url')} value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} data-testid="listing-form-image" />
        </div>
        <TextField label={t('lf.tags')} value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} data-testid="listing-form-tags" />
        <FieldError>{err}</FieldError>
        <Button type="submit" variant="primary" block center disabled={busy} data-testid="listing-form-submit"
          icon={busy ? <Loader2 className="animate-spin" /> : undefined}>
          {isEdit ? t('common.save_changes') : t('pd.add_listing')}
        </Button>
      </form>
    </Sheet>
  );
}
