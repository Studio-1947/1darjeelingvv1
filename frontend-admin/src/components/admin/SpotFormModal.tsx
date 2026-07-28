import { useEffect, useRef, useState } from 'react';
import {
  X, Loader2, Upload, Plus, Trash2, ImageIcon, MapPin, Info, Star, Eye, EyeOff,
} from 'lucide-react';
import { uploadSpotImages } from '@/lib/uploadImage';
import type { AdminSpot } from './SpotsTab';

// Mirrors the server-side caps in backend/src/lib/spots.ts, so the admin is stopped here with a
// clear message rather than by a 400 after filling in a whole form.
export const MAX_GALLERY_IMAGES = 16;
const MAX_HIGHLIGHTS = 12;
const MAX_TAGS = 12;
const MAX_TITLE_LEN = 160;
const MAX_SHORT_TEXT = 200;

export interface SpotFormPayload {
  title: string;
  description: string;
  location: string;
  latitude: number | null;
  longitude: number | null;
  price: number;
  image: string;
  tags: string[];
  extras: {
    images: string[];
    highlights: string[];
    best_time: string;
    timings: string;
    entry_fee: string;
    how_to_reach: string;
    altitude: string;
    address: string;
    published: boolean;
    featured: boolean;
    sort_order: number;
  };
}

interface FormState {
  title: string;
  description: string;
  location: string;
  address: string;
  latitude: string;
  longitude: string;
  price: string;
  image: string;
  timings: string;
  entryFee: string;
  bestTime: string;
  altitude: string;
  howToReach: string;
  sortOrder: string;
  published: boolean;
  featured: boolean;
}

function initialState(spot?: AdminSpot | null): FormState {
  const extras = (spot?.extras || {}) as Record<string, any>;
  return {
    title: spot?.title || '',
    description: spot?.description || '',
    location: spot?.location || '',
    address: extras.address || '',
    latitude: spot?.latitude != null ? String(spot.latitude) : '',
    longitude: spot?.longitude != null ? String(spot.longitude) : '',
    price: spot?.price != null ? String(spot.price) : '0',
    image: spot?.image || '',
    timings: extras.timings || '',
    entryFee: extras.entry_fee || '',
    bestTime: extras.best_time || '',
    altitude: extras.altitude || '',
    howToReach: extras.how_to_reach || '',
    sortOrder: String(spot?.sort_order ?? extras.sort_order ?? 0),
    published: spot ? spot.published !== false : true,
    featured: spot ? spot.featured === true : false,
  };
}

const inputClass =
  'mt-1 w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-flag/20 transition-all';

/** Labelled field wrapper — keeps every row of the form on the same rhythm. */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink-soft">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-soft">{hint}</span>}
    </label>
  );
}

/** Section heading inside the form, so a long spot record stays scannable. */
function Section({ icon: Icon, title, note, children }: {
  icon: any; title: string; note?: string; children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[var(--line)] pt-6 first:border-t-0 first:pt-0">
      <div className="flex items-center gap-2">
        <Icon size={15} className="text-pine" />
        <h3 className="font-display font-extrabold text-base text-ink">{title}</h3>
      </div>
      {note && <p className="mt-1 text-xs text-ink-soft">{note}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Enter-to-add list of short strings, used for highlights and tags. */
function ChipInput({ values, onChange, placeholder, max, testId }: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  max: number;
  testId: string;
}) {
  const [draft, setDraft] = useState('');
  const full = values.length >= max;

  const add = () => {
    const value = draft.trim();
    if (!value || full) return;
    // Duplicates are always a mis-click here, and the public page would render them twice.
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }
    onChange([...values, value.slice(0, MAX_SHORT_TEXT)]);
    setDraft('');
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {values.map((value, i) => (
          <span key={`${value}-${i}`} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-mist border border-[var(--line)] text-xs font-semibold text-ink">
            {value}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, index) => index !== i))}
              className="text-ink-soft hover:text-flag"
              aria-label={`Remove ${value}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the chip rather than submitting the whole form.
            if (e.key === 'Enter') { e.preventDefault(); add(); }
          }}
          disabled={full}
          data-testid={testId}
          placeholder={full ? `Maximum ${max} reached` : placeholder}
          className={`${inputClass} mt-0 flex-1 disabled:opacity-50`}
        />
        <button
          type="button"
          onClick={add}
          disabled={full || !draft.trim()}
          className="shrink-0 inline-flex items-center gap-1 px-4 rounded-xl border border-[var(--line)] text-xs font-bold text-ink hover:bg-mist disabled:opacity-40 transition-colors"
        >
          <Plus size={13} /> Add
        </button>
      </div>
    </div>
  );
}

/**
 * Create/edit form for a tourist spot — the only place a spot is authored.
 *
 * Photos upload straight to the admin-only endpoint and are stored as URLs, so the
 * form always holds hosted images rather than pending files: closing mid-edit can
 * never leave a half-uploaded gallery, and Save sends one clean JSON payload.
 */
export default function SpotFormModal({ open, spot, onClose, onSubmit }: {
  open: boolean;
  /** Editing an existing spot, or null/undefined to create a new one. */
  spot?: AdminSpot | null;
  onClose: () => void;
  onSubmit: (payload: SpotFormPayload) => Promise<void>;
}) {
  const isEdit = !!spot?.id;
  const [form, setForm] = useState<FormState>(() => initialState(spot));
  const [gallery, setGallery] = useState<string[]>(() => ((spot?.extras?.images as string[]) || []));
  const [highlights, setHighlights] = useState<string[]>(() => ((spot?.extras?.highlights as string[]) || []));
  const [tags, setTags] = useState<string[]>(() => spot?.tags || []);
  const [coverUploading, setCoverUploading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState<{ done: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);

  // Reset whenever the modal is (re)opened for a different spot, so an edit never
  // inherits the previous record's photos.
  useEffect(() => {
    if (!open) return;
    setForm(initialState(spot));
    setGallery(((spot?.extras?.images as string[]) || []));
    setHighlights(((spot?.extras?.highlights as string[]) || []));
    setTags(spot?.tags || []);
    setError('');
    titleRef.current?.focus();
  }, [open, spot]);

  // Escape closes — but never mid-save, which would leave the admin unsure whether it landed.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  if (!open) return null;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const pickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked after a failure
    if (!file) return;
    setError('');
    setCoverUploading(true);
    try {
      const [url] = await uploadSpotImages([file]);
      set('image', url);
    } catch (err: any) {
      setError(err?.message || 'Cover upload failed.');
    } finally {
      setCoverUploading(false);
    }
  };

  const pickGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError('');

    const room = MAX_GALLERY_IMAGES - gallery.length;
    if (room <= 0) {
      setError(`The gallery already holds the maximum of ${MAX_GALLERY_IMAGES} photos.`);
      return;
    }
    const accepted = files.slice(0, room);

    setGalleryUploading({ done: 0, total: accepted.length });
    try {
      const urls = await uploadSpotImages(accepted, (done, total) => setGalleryUploading({ done, total }));
      setGallery((prev) => [...prev, ...urls]);
      if (files.length > accepted.length) {
        setError(`Only ${accepted.length} photo(s) were added — the gallery holds at most ${MAX_GALLERY_IMAGES}.`);
      }
    } catch (err: any) {
      setError(err?.message || 'Photo upload failed.');
    } finally {
      setGalleryUploading(null);
    }
  };

  const moveGalleryImage = (index: number, delta: number) => {
    const next = [...gallery];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setGallery(next);
  };

  const parseCoord = (raw: string, label: string, limit: number): number | null => {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < -limit || n > limit) {
      throw new Error(`${label} must be a number between -${limit} and ${limit}.`);
    }
    return n;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!form.title.trim() || !form.description.trim() || !form.location.trim()) {
      setError('Name, area and description are required.');
      return;
    }
    if (form.title.trim().length > MAX_TITLE_LEN) {
      setError(`Name must be ${MAX_TITLE_LEN} characters or fewer.`);
      return;
    }
    if (coverUploading || galleryUploading) {
      setError('Wait for the photos to finish uploading.');
      return;
    }

    let latitude: number | null;
    let longitude: number | null;
    try {
      latitude = parseCoord(form.latitude, 'Latitude', 90);
      longitude = parseCoord(form.longitude, 'Longitude', 180);
    } catch (err: any) {
      setError(err.message);
      return;
    }
    // A single coordinate can't place a pin, and the public map would silently ignore it.
    if ((latitude === null) !== (longitude === null)) {
      setError('Set both latitude and longitude, or leave both blank.');
      return;
    }

    const price = Number(form.price || 0);
    if (!Number.isInteger(price) || price < 0) {
      setError('Entry price must be a whole number of rupees (0 for free).');
      return;
    }
    const sortOrder = Number(form.sortOrder || 0);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      setError('Display order must be a whole number, 0 or greater.');
      return;
    }

    setSaving(true);
    try {
      await onSubmit({
        title: form.title.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        latitude,
        longitude,
        price,
        image: form.image.trim(),
        tags,
        extras: {
          images: gallery,
          highlights,
          best_time: form.bestTime.trim(),
          timings: form.timings.trim(),
          entry_fee: form.entryFee.trim(),
          how_to_reach: form.howToReach.trim(),
          altitude: form.altitude.trim(),
          address: form.address.trim(),
          published: form.published,
          featured: form.featured,
          sort_order: sortOrder,
        },
      });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not save this spot.');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || coverUploading || !!galleryUploading;

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 bg-ink/40 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spot-form-title"
      data-testid="spot-form-modal"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
    >
      <div className="modal-panel mist-panel w-full max-w-3xl my-0 sm:my-8 shadow-2xl border-t-4 border-pine">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-[var(--line)]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-flag">Tourist spots</div>
            <h2 id="spot-form-title" className="mt-1 font-display font-extrabold text-2xl text-ink">
              {isEdit ? 'Edit spot' : 'Add a tourist spot'}
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Curated by admins only — providers can never create or edit these.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            data-testid="spot-form-close"
            className="p-1.5 rounded-full hover:bg-mist disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <Section icon={Info} title="The place" note="What a visitor sees first on the spot's page.">
            <Field label="Name">
              <input
                ref={titleRef}
                required
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                maxLength={MAX_TITLE_LEN}
                data-testid="spot-form-title"
                placeholder="e.g. Tiger Hill Sunrise"
                className={inputClass}
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Area" hint="Shown on cards — e.g. Ghum, Darjeeling.">
                <input
                  required
                  value={form.location}
                  onChange={(e) => set('location', e.target.value)}
                  data-testid="spot-form-location"
                  className={inputClass}
                />
              </Field>
              <Field label="Street address (optional)">
                <input
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  maxLength={MAX_SHORT_TEXT}
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Description" hint="A few paragraphs — this is the 'About this place' text.">
              <textarea
                required
                rows={5}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                data-testid="spot-form-description"
                className={`${inputClass} resize-y`}
              />
            </Field>

            <Field label="Highlights" hint="Short bullets shown as chips — e.g. “Kanchenjunga sunrise”.">
              <ChipInput
                values={highlights}
                onChange={setHighlights}
                max={MAX_HIGHLIGHTS}
                placeholder="Add a highlight and press Enter"
                testId="spot-form-highlight-input"
              />
            </Field>
          </Section>

          <Section icon={ImageIcon} title="Photos" note="The cover is the large image at the top; the gallery appears below it.">
            <div>
              <span className="text-xs font-bold text-ink-soft">Cover photo</span>
              <div className="mt-1 flex flex-wrap items-center gap-4">
                <div className="w-40 h-28 rounded-xl overflow-hidden bg-mist border border-[var(--line)] flex items-center justify-center shrink-0">
                  {form.image
                    ? <img src={form.image} alt="Spot cover" className="w-full h-full object-cover" />
                    : <ImageIcon size={22} className="text-ink-soft" />}
                </div>
                <div className="flex flex-col gap-2">
                  <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-pine text-white text-xs font-bold btn-hover cursor-pointer w-fit">
                    {coverUploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {coverUploading ? 'Uploading…' : form.image ? 'Replace cover' : 'Upload cover'}
                    <input type="file" accept="image/*" onChange={pickCover} disabled={coverUploading} className="hidden" data-testid="spot-form-cover-input" />
                  </label>
                  {form.image && (
                    <button
                      type="button"
                      onClick={() => set('image', '')}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-flag hover:underline w-fit"
                    >
                      <Trash2 size={12} /> Remove cover
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div>
              <span className="text-xs font-bold text-ink-soft">
                Gallery ({gallery.length}/{MAX_GALLERY_IMAGES})
              </span>
              <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 gap-3">
                {gallery.map((url, i) => (
                  <div key={`${url}-${i}`} className="relative aspect-[4/3] rounded-xl overflow-hidden bg-mist border border-[var(--line)] group">
                    <img src={url} alt={`Gallery ${i + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setGallery(gallery.filter((_, index) => index !== i))}
                      className="absolute top-1.5 right-1.5 p-1 rounded-full bg-ink/70 hover:bg-ink text-white"
                      aria-label={`Remove photo ${i + 1}`}
                    >
                      <X size={12} />
                    </button>
                    {/* Gallery order is the display order on the public page, so it's reorderable. */}
                    <div className="absolute bottom-1.5 left-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button type="button" onClick={() => moveGalleryImage(i, -1)} disabled={i === 0}
                        className="px-1.5 rounded bg-ink/70 text-white text-[11px] font-bold disabled:opacity-30" aria-label="Move photo earlier">←</button>
                      <button type="button" onClick={() => moveGalleryImage(i, 1)} disabled={i === gallery.length - 1}
                        className="px-1.5 rounded bg-ink/70 text-white text-[11px] font-bold disabled:opacity-30" aria-label="Move photo later">→</button>
                    </div>
                  </div>
                ))}

                {gallery.length < MAX_GALLERY_IMAGES && (
                  <label className={`aspect-[4/3] rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${
                    galleryUploading ? 'border-pine/50 bg-pine/5 text-pine' : 'border-[var(--line)] text-ink-soft hover:border-flag/50 hover:text-flag'
                  }`}>
                    {galleryUploading ? (
                      <>
                        <Upload size={18} className="animate-pulse" />
                        <span className="text-[10px] font-bold">{galleryUploading.done}/{galleryUploading.total}</span>
                      </>
                    ) : (
                      <>
                        <Plus size={18} />
                        <span className="text-[10px] font-bold">Add photos</span>
                      </>
                    )}
                    <input type="file" accept="image/*" multiple onChange={pickGallery} disabled={!!galleryUploading} className="hidden" data-testid="spot-form-gallery-input" />
                  </label>
                )}
              </div>
            </div>
          </Section>

          <Section icon={Info} title="Visitor information" note="Everything a traveller asks before setting out.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Opening times" hint="e.g. 4:00 AM – 7:00 AM">
                <input value={form.timings} onChange={(e) => set('timings', e.target.value)} maxLength={MAX_SHORT_TEXT} className={inputClass} />
              </Field>
              <Field label="Entry fee (text)" hint="e.g. ₹50 per person, free for children">
                <input value={form.entryFee} onChange={(e) => set('entryFee', e.target.value)} maxLength={MAX_SHORT_TEXT} className={inputClass} />
              </Field>
              <Field label="Best time to visit" hint="e.g. October to December">
                <input value={form.bestTime} onChange={(e) => set('bestTime', e.target.value)} maxLength={MAX_SHORT_TEXT} className={inputClass} />
              </Field>
              <Field label="Altitude" hint="e.g. 2,590 m">
                <input value={form.altitude} onChange={(e) => set('altitude', e.target.value)} maxLength={MAX_SHORT_TEXT} className={inputClass} />
              </Field>
            </div>

            <Field label="How to reach" hint="Directions from town — transport, distance, rough travel time.">
              <textarea rows={3} value={form.howToReach} onChange={(e) => set('howToReach', e.target.value)} className={`${inputClass} resize-y`} />
            </Field>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Entry price (₹)" hint="Numeric — 0 shows the spot as free. Used on cards.">
                <input type="number" min="0" step="1" value={form.price} onChange={(e) => set('price', e.target.value)} data-testid="spot-form-price" className={inputClass} />
              </Field>
              <Field label="Tags">
                <ChipInput values={tags} onChange={setTags} max={MAX_TAGS} placeholder="e.g. sunrise" testId="spot-form-tag-input" />
              </Field>
            </div>
          </Section>

          <Section icon={MapPin} title="Map pin" note="Both fields, or neither — the public page falls back to central Darjeeling.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Latitude" hint="e.g. 27.0028">
                <input value={form.latitude} onChange={(e) => set('latitude', e.target.value)} inputMode="decimal" data-testid="spot-form-latitude" className={inputClass} />
              </Field>
              <Field label="Longitude" hint="e.g. 88.2670">
                <input value={form.longitude} onChange={(e) => set('longitude', e.target.value)} inputMode="decimal" data-testid="spot-form-longitude" className={inputClass} />
              </Field>
            </div>
          </Section>

          <Section icon={Star} title="Publishing" note="Drafts are invisible to visitors until you publish them.">
            <div className="grid sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => set('published', !form.published)}
                data-testid="spot-form-published"
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                  form.published ? 'border-pine bg-pine/5' : 'border-[var(--line)] hover:bg-mist'
                }`}
              >
                {form.published ? <Eye size={18} className="text-pine" /> : <EyeOff size={18} className="text-ink-soft" />}
                <span>
                  <span className="block text-sm font-bold text-ink">{form.published ? 'Published' : 'Draft'}</span>
                  <span className="block text-[11px] text-ink-soft">
                    {form.published ? 'Live on /spots for everyone.' : 'Only visible here in the console.'}
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => set('featured', !form.featured)}
                data-testid="spot-form-featured"
                className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all ${
                  form.featured ? 'border-gold bg-gold/10' : 'border-[var(--line)] hover:bg-mist'
                }`}
              >
                <Star size={18} className={form.featured ? 'text-gold fill-gold' : 'text-ink-soft'} />
                <span>
                  <span className="block text-sm font-bold text-ink">{form.featured ? 'Featured' : 'Not featured'}</span>
                  <span className="block text-[11px] text-ink-soft">Featured spots sort to the top of the list.</span>
                </span>
              </button>
            </div>

            <Field label="Display order" hint="Lower numbers come first among spots with the same featured status.">
              <input type="number" min="0" step="1" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} data-testid="spot-form-sort-order" className={`${inputClass} sm:max-w-[12rem]`} />
            </Field>
          </Section>

          {error && (
            <div className="p-3 rounded-xl bg-flag/10 border border-flag/20 text-sm text-flag font-semibold" data-testid="spot-form-error">
              {error}
            </div>
          )}
        </form>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-full text-sm font-bold text-ink-soft hover:bg-mist disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            data-testid="spot-form-submit"
            className="inline-flex items-center gap-1.5 px-6 py-2 rounded-full bg-flag text-white text-sm font-bold btn-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Save changes' : form.published ? 'Publish spot' : 'Save draft'}
          </button>
        </div>
      </div>
    </div>
  );
}
