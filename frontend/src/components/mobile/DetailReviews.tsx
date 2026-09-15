import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { Star, X, Camera, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { useLoginGate } from '@/components/LoginGate';
import { fetchReviews, postReview, Review, ReviewSummary } from '@/lib/reviews';
import { uploadImages } from '@/lib/uploadImage';
import { MobileSheet, Touch, PrimaryButton, Slab } from '@/components/mobile';

const MAX_REVIEW_PHOTOS = 6;

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={size}
          weight={s <= Math.round(value) ? 'fill' : 'regular'}
          className={s <= Math.round(value) ? 'text-[var(--mu-orange)]' : 'text-[var(--mu-border-strong)]'}
        />
      ))}
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Touch key={s} onClick={() => onChange(s)} aria-label={`${s} star`}>
          <Star size={30} weight={s <= value ? 'fill' : 'regular'} className={s <= value ? 'text-[var(--mu-orange)]' : 'text-[var(--mu-border-strong)]'} />
        </Touch>
      ))}
    </div>
  );
}

/**
 * Reviews for the mobile listing detail page: real summary + list from
 * fetchReviews, and a write-sheet posting through the same postReview the
 * desktop ReviewsSection uses. RN's ReviewSheet has no photo attachment -
 * this keeps the desktop's real photo-upload capability (reusing
 * uploadImages, same helper KYC/onboarding photo uploads already use)
 * rather than dropping a working feature to match RN exactly.
 */
export default function MobileDetailReviews({ itemId }: { itemId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { requireAuth } = useLoginGate();

  const [summary, setSummary] = useState<ReviewSummary>({ count: 0, average: 0 });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : undefined;

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchReviews(itemId);
      setSummary(data.summary);
      setReviews(data.reviews);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [itemId]);

  const openSheet = () => {
    if (!requireAuth('review')) return;
    if (myReview) {
      setRating(myReview.rating);
      setComment(myReview.comment);
      setPhotos(myReview.photos || []);
    }
    setError('');
    setOpen(true);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = MAX_REVIEW_PHOTOS - photos.length;
    if (remaining <= 0) return;
    const selected = Array.from(files).slice(0, remaining);
    setUploading(true);
    setError('');
    try {
      const urls = await uploadImages(selected);
      setPhotos((prev) => [...prev, ...urls]);
    } catch (err: any) {
      setError(typeof err === 'string' ? err : err?.message || t('mobileDetail.upload_failed'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const submit = async () => {
    if (rating < 1) { setError(t('reviews.pick_rating')); return; }
    setSubmitting(true);
    setError('');
    try {
      await postReview(itemId, rating, comment.trim(), photos);
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('reviews.save_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between">
        <h2 className="font-[family-name:var(--mu-font-display)] font-black text-xl text-[var(--mu-ink)]">
          {t('reviews.title')}
        </h2>
        <Touch onClick={openSheet} className="text-xs font-bold" style={{ color: 'var(--mu-green)' }}>
          {t('reviews.write')}
        </Touch>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <Stars value={summary.average} />
        <span className="text-sm font-bold text-[var(--mu-ink)]">{summary.count > 0 ? summary.average.toFixed(1) : '–'}</span>
        <span className="text-xs text-[var(--mu-text-muted)]">{t('reviews.count', { count: summary.count })}</span>
      </div>

      <div className="mt-4 space-y-2.5">
        {loading ? (
          <p className="text-sm text-[var(--mu-text-muted)]">{t('reviews.loading')}</p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-[var(--mu-text-muted)]">{t('reviews.empty')}</p>
        ) : (
          reviews.slice(0, 4).map((r) => (
            <div key={r.id} className="rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs" style={{ background: 'var(--mu-green-tint)', color: 'var(--mu-green-deep)' }}>
                    {(r.author_name || '?').trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-[var(--mu-ink)] truncate">{r.author_name}</div>
                    <div className="text-[11px] text-[var(--mu-text-faint)]">{new Date(r.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
                <Stars value={r.rating} size={12} />
              </div>
              {r.comment && <p className="mt-2 text-sm text-[var(--mu-text-body)] leading-relaxed">{r.comment}</p>}
              {r.photos && r.photos.length > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto">
                  {r.photos.map((p, i) => (
                    <img key={i} src={p} alt="" className="w-14 h-14 rounded-[var(--mu-r-tile-sm)] object-cover flex-shrink-0" />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
        {reviews.length > 4 && (
          <p className="text-xs text-[var(--mu-text-muted)]">{t('mobileDetail.more_reviews', { count: reviews.length - 4 })}</p>
        )}
      </div>

      <MobileSheet open={open} onClose={() => setOpen(false)} title={myReview ? t('reviews.update_title') : t('reviews.write')}>
        {!user ? (
          <div className="text-center">
            <p className="text-sm text-[var(--mu-text-body)]">{t('reviews.signed_out')}</p>
            <PrimaryButton onClick={() => nav(`/login?next=${encodeURIComponent(loc.pathname)}`)} className="mt-4 w-full">
              {t('reviews.sign_in_cta')}
            </PrimaryButton>
          </div>
        ) : (
          <div>
            <Slab>{t('reviews.your_rating')}</Slab>
            <div className="mt-1.5"><StarPicker value={rating} onChange={setRating} /></div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder={t('reviews.comment_placeholder')}
              className="mt-3.5 w-full px-3.5 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-bg)] text-sm text-[var(--mu-ink)] outline-none resize-none"
            />
            <div className="mt-3.5 flex flex-wrap items-center gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative w-14 h-14 rounded-[var(--mu-r-tile-sm)] overflow-hidden border border-[var(--mu-border)]">
                  <img src={p} alt="" className="w-full h-full object-cover" />
                  <Touch onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </Touch>
                </div>
              ))}
              {photos.length < MAX_REVIEW_PHOTOS && (
                <label className="w-14 h-14 rounded-[var(--mu-r-tile-sm)] border border-dashed border-[var(--mu-border-strong)] flex items-center justify-center text-[var(--mu-text-muted)]">
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                  <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploading || submitting} className="hidden" />
                </label>
              )}
            </div>
            {error && <p className="mt-2.5 text-sm font-semibold" style={{ color: 'var(--mu-danger)' }}>{error}</p>}
            <PrimaryButton onClick={submit} disabled={submitting || uploading} className="mt-4 w-full">
              {submitting ? t('common.loading') : myReview ? t('reviews.update_cta') : t('reviews.post')}
            </PrimaryButton>
          </div>
        )}
      </MobileSheet>
    </div>
  );
}
