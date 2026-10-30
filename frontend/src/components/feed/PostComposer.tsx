import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CircleNotch as Loader2, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { uploadImage } from '@/lib/uploadImage';
import { createPost, HostPost, MAX_POST_LEN, MAX_POST_PHOTOS, updatePost } from '@/lib/posts';

type MyListing = { id: string; title: string };

/**
 * Write or edit a post: the words, up to four photos (uploaded as soon as they are picked, the
 * same way listing photos are), and optionally which of the host's own listings it is about.
 */
export default function PostComposer({
  editing,
  onSaved,
  onCancelEdit,
}: {
  editing?: HostPost | null;
  onSaved: (post: HostPost) => void;
  onCancelEdit?: () => void;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [listingId, setListingId] = useState('');
  const [listings, setListings] = useState<MyListing[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/bookings/provider')
      .then((r) => setListings((r.data.listings || []).map((l: any) => ({ id: l.id, title: l.title }))))
      .catch(() => setListings([]));
  }, []);

  useEffect(() => {
    setBody(editing?.body ?? '');
    setPhotos(editing?.photos ?? []);
    setListingId(editing?.listing?.id ?? '');
    setError('');
  }, [editing]);

  const addPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, MAX_POST_PHOTOS - photos.length);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      for (const f of files) {
        const url = await uploadImage(f);
        setPhotos((p) => [...p, url].slice(0, MAX_POST_PHOTOS));
      }
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || t('feed.upload_failed'));
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!body.trim() || saving || uploading) return;
    setSaving(true);
    setError('');
    try {
      const input = { body: body.trim(), photos, listing_id: listingId || null };
      const saved = editing ? await updatePost(editing.id, input) : await createPost(input);
      toast.success(editing ? t('feed.updated') : t('feed.posted'));
      if (!editing) {
        setBody('');
        setPhotos([]);
        setListingId('');
      }
      onSaved(saved);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('feed.post_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="post-composer" className="rounded-3xl border border-[var(--line)] bg-white p-4 md:p-5">
      <div className="font-display font-bold text-ink">{editing ? t('feed.edit_title') : t('feed.compose_title')}</div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_POST_LEN))}
        rows={4}
        data-testid="post-body"
        placeholder={t('feed.compose_placeholder')}
        aria-label={t('feed.compose_title')}
        className="mt-3 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-ink text-sm resize-y focus:ring-2 focus:ring-pine/20"
      />
      <div className="text-right text-[11px] text-ink-soft">
        {body.length}/{MAX_POST_LEN}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {photos.map((p, i) => (
          <div key={p + i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--line)]">
            <img src={p} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              aria-label={t('feed.remove_photo')}
              onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-flag"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {photos.length < MAX_POST_PHOTOS && (
          <label className="w-16 h-16 rounded-xl border-2 border-dashed border-[var(--line)] hover:border-pine grid place-items-center cursor-pointer text-ink-soft hover:text-pine">
            {uploading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <span className="flex flex-col items-center gap-0.5">
                <Camera size={18} />
                <span className="text-[9px] font-bold">{t('feed.add_photo')}</span>
              </span>
            )}
            <input type="file" accept="image/*" multiple className="hidden" onChange={addPhotos} disabled={uploading || saving} data-testid="post-photo-input" />
          </label>
        )}
      </div>

      {listings.length > 0 && (
        <label className="mt-3 block">
          <span className="text-xs font-semibold text-ink-soft uppercase">{t('feed.about_which')}</span>
          <select
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            data-testid="post-listing"
            className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-white text-ink text-sm"
          >
            <option value="">{t('feed.about_none')}</option>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="mt-2 text-sm text-flag font-semibold">{error}</p>}

      <div className="mt-4 flex items-center gap-2 justify-end">
        {editing && (
          <button type="button" onClick={onCancelEdit} className="px-5 py-2.5 rounded-full border border-[var(--line)] text-ink font-bold">
            {t('report.cancel')}
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!body.trim() || saving || uploading}
          data-testid="post-submit"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-50"
        >
          {saving && <Loader2 size={15} className="animate-spin" />}
          {editing ? t('feed.save') : t('feed.post')}
        </button>
      </div>
    </div>
  );
}
