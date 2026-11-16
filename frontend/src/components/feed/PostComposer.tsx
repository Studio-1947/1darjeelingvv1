import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, CircleNotch as Loader2, X } from '@phosphor-icons/react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { uploadImage } from '@/lib/uploadImage';
import { createPost, HostPost, MAX_POST_LEN, MAX_POST_PHOTOS, updatePost } from '@/lib/posts';
import { Box, Button, FieldError, IconButton, SelectField, TextArea } from '@/components/ag';

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
    <Box data-testid="post-composer">
      <h2>{editing ? t('feed.edit_title') : t('feed.compose_title')}</h2>
      <TextArea
        value={body}
        onChange={(e) => setBody(e.target.value.slice(0, MAX_POST_LEN))}
        rows={4}
        data-testid="post-body"
        placeholder={t('feed.compose_placeholder')}
        aria-label={t('feed.compose_title')}
        hint={<span className="block text-right tabular-nums">{body.length}/{MAX_POST_LEN}</span>}
      />

      <div className="flex flex-wrap items-center gap-2">
        {photos.map((p, i) => (
          <div key={p + i} className="relative w-20 h-20 rounded-[18px] overflow-hidden border border-[var(--warmline)]">
            <img src={p} alt="" className="w-full h-full object-cover" />
            <IconButton small label={t('feed.remove_photo')} onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
              className="absolute top-1 right-1">
              <X />
            </IconButton>
          </div>
        ))}
        {photos.length < MAX_POST_PHOTOS && (
          <label className="ag-btn sm cursor-pointer" aria-disabled={uploading || saving}>
            {uploading ? <Loader2 className="animate-spin" /> : <Camera />}
            <span>{t('feed.add_photo')}</span>
            <input type="file" accept="image/*" multiple className="sr-only" onChange={addPhotos} disabled={uploading || saving} data-testid="post-photo-input" />
          </label>
        )}
      </div>

      {listings.length > 0 && (
        <SelectField label={t('feed.about_which')} value={listingId} onChange={(e) => setListingId(e.target.value)} data-testid="post-listing">
          <option value="">{t('feed.about_none')}</option>
          {listings.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </SelectField>
      )}

      <FieldError id="post-error">{error}</FieldError>

      <div className="flex flex-wrap items-center gap-2 justify-end">
        {editing && (
          <Button variant="stop" onClick={onCancelEdit}>{t('report.cancel')}</Button>
        )}
        <Button
          variant="primary"
          onClick={submit}
          disabled={!body.trim() || saving || uploading}
          data-testid="post-submit"
          icon={saving ? <Loader2 className="animate-spin" /> : undefined}
        >
          {editing ? t('feed.save') : t('feed.post')}
        </Button>
      </div>
    </Box>
  );
}
