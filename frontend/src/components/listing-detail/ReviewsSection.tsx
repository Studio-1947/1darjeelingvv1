import React, { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2, X } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { fetchReviews, postReview, deleteReview, CanReview, Review, ReviewSummary } from '@/lib/reviews';
import { uploadImages } from '@/lib/uploadImage';
import { ReviewSkeleton, LoadingStatus, repeat } from '@/components/skeletons';
import { Button, ButtonLink, FieldError, IconButton, TextField } from '@/components/ag';
import { Section } from './primitives';
import ReportDialog, { ReportTarget } from './ReportDialog';

// Matches MAX_REVIEW_PHOTOS in backend/src/routes/reviews.ts.
const MAX_REVIEW_PHOTOS = 6;

/** A review's rating as the prototype writes it (`.starline`): one red star and the number. */
function StarLine({ value }: { value: number }) {
  const { t } = useTranslation();
  return (
    <span className="ag-listing-starline" role="img" aria-label={t('reviews.out_of_5', { value })}>
      <Icon name="star" />{value}
    </span>
  );
}

/** Five 44px stars to tap (prototype `.stars`). */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="ag-listing-stars" role="radiogroup" aria-label={t('reviews.your_rating')}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button key={s} type="button" role="radio" aria-checked={value === s} aria-label={t('reviews.star_aria', { count: s })}
          data-testid={`review-star-${s}`} onClick={() => onChange(s)} className={`ag-listing-star${s <= value ? ' on' : ''}`}>
          <Icon name="star" />
        </button>
      ))}
    </div>
  );
}

/**
 * The reviews box (prototype item page): what others said, then your own rating and review for
 * the signed-in reader, then "Report a problem" under it.
 */
export default function ReviewsSection({ item }: { item: any }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();
  const [summary, setSummary] = useState<ReviewSummary>({ count: 0, average: 0 });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [canReview, setCanReview] = useState<CanReview | null>(null);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReviews(item.id);
      setSummary(data.summary);
      setReviews(data.reviews);
      setCanReview(data.canReview);
    } finally {
      setLoading(false);
    }
  }, [item.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating);
      setComment(myReview.comment);
      setPhotos(myReview.photos || []);
    }
  }, [myReview]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = MAX_REVIEW_PHOTOS - photos.length;
    if (remaining <= 0) {
      toast.error(t('reviews.photo_limit', { count: MAX_REVIEW_PHOTOS, defaultValue: 'You can attach up to {{count}} photos.' }));
      e.target.value = '';
      return;
    }
    const selected = Array.from(files).slice(0, remaining);
    setUploadingPhotos(true);
    setError('');
    try {
      const urls = await uploadImages(selected);
      setPhotos((prev) => [...prev, ...urls]);
      toast.success(t('reviews.photo_uploaded', 'Photo attached successfully!'));
    } catch (err: any) {
      const msg = typeof err === 'string' ? err : (err?.message || t('reviews.upload_failed', 'Upload failed'));
      setError(msg);
      toast.error(msg);
    } finally {
      setUploadingPhotos(false);
    }
  };

  const submit = async () => {
    if (rating < 1) {
      const msg = t('reviews.pick_rating');
      setError(msg);
      toast.error(msg);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const isUpdate = !!myReview;
      await postReview(item.id, rating, comment.trim(), photos);
      toast.success(
        isUpdate
          ? t('reviews.updated_toast', 'Your review has been updated!')
          : t('reviews.posted_toast', 'Thank you! Your review has been posted.')
      );
      await load();
    } catch (e: any) {
      const errMsg = e?.response?.data?.detail || t('reviews.save_failed');
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const removeMine = async () => {
    if (!myReview) return;
    setSubmitting(true);
    try {
      await deleteReview(myReview.id);
      setRating(0);
      setComment('');
      setPhotos([]);
      toast.success(t('reviews.removed_toast', 'Your review has been removed.'));
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('ui.reviewsSection.remove_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const loginHref = `/login?next=${encodeURIComponent(loc.pathname + '#reviews')}`;

  return (
    <>
      <Section id="reviews" testid="detail-reviews" title={t('listing.reviews', 'Reviews')}>
        {/* What others said first, then your own (prototype order). */}
        {loading ? (
          <div className="flex flex-col gap-3">
            <LoadingStatus label={t('reviews.loading')} />
            {repeat(2, (i) => <ReviewSkeleton key={i} />)}
          </div>
        ) : reviews.length === 0 ? (
          <p className="m-0 text-[var(--ink-muted)]">{t('listing.norev', 'No reviews yet.')}</p>
        ) : (
          reviews.map((r) => (
            <article key={r.id} data-testid={`review-${r.id}`} className="ag-listing-rev">
              <div className="flex items-center justify-between gap-3">
                <StarLine value={r.rating} />
                {user && r.user_id !== user.id && (
                  <Button variant="text" size="sm" className="!text-[13px] !text-[var(--ink-muted)]"
                    onClick={() => setReportTarget({ type: 'review', id: r.id, authorId: r.user_id, authorName: r.author_name || '?' })}
                    data-testid={`review-report-${r.id}`}>
                    {t('report.review_link')}
                  </Button>
                )}
              </div>
              {r.comment && <p className="text-[16px] leading-6 text-[var(--ink7)]">{r.comment}</p>}
              {r.photos && r.photos.length > 0 && (
                <div className="flex flex-wrap gap-2 py-1">
                  {r.photos.map((p, idx) => (
                    <a key={idx} href={p} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-[12px] overflow-hidden bg-[var(--creme2)]">
                      <img src={p} alt={t('reviews.attachment_alt')} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              )}
              <p className="ag-small">
                {r.author_name}, {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </article>
          ))
        )}

        {user && !myReview && canReview?.code === 'stay_required' ? (
          <p data-testid="review-stay-required" className="ag-small">{t('reviews.stay_required')}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <b className="font-medium text-[var(--ink7)]">{myReview ? t('reviews.update_title') : t('listing.revq', 'How was it? Tap the stars.')}</b>
              {myReview && (
                <Button variant="stop" size="sm" onClick={removeMine} disabled={submitting} data-testid="review-delete" icon={<Icon name="close" />}>
                  {t('reviews.remove')}
                </Button>
              )}
            </div>
            <StarPicker value={rating} onChange={setRating} />
            <TextField value={comment} onChange={(e) => setComment(e.target.value)} data-testid="review-comment"
              placeholder={t('listing.revph', 'Write a few words (you can skip)')} aria-label={t('listing.revph', 'Write a few words (you can skip)')} />

            {user && (
              <div className="flex flex-wrap items-center gap-2">
                {photos.map((p, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-[12px] overflow-hidden bg-[var(--creme2)]">
                    <img src={p} alt={t('reviews.attachment_alt')} className="w-full h-full object-cover" />
                    <IconButton small label={t('reviews.remove')} onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 !w-6 !h-6 [&_svg]:!w-3.5 [&_svg]:!h-3.5">
                      <X />
                    </IconButton>
                  </div>
                ))}
                {photos.length < MAX_REVIEW_PHOTOS && (
                  <label className="h-11 px-4 rounded-full border border-dashed border-[var(--outline)] inline-flex items-center gap-2 cursor-pointer text-[14px] font-medium text-[var(--ink-strong)] bg-[var(--surface)]">
                    {uploadingPhotos ? <Loader2 size={18} className="animate-spin text-[var(--r)]" /> : <Icon name="download" size={18} className="text-[var(--r)]" />}
                    {t('reviews.add_photo')}
                    <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploadingPhotos || submitting} className="sr-only" />
                  </label>
                )}
              </div>
            )}

            <FieldError id="review-error">{error}</FieldError>
            <div className="ag-row">
              {/* Signed out, Send review asks for an account first (a review needs a completed stay). */}
              <Button onClick={user ? submit : () => nav(loginHref)} disabled={!rating || submitting || uploadingPhotos} data-testid="review-submit"
                icon={submitting ? <Loader2 className="animate-spin" /> : undefined}>
                {myReview ? t('reviews.update_cta') : t('listing.revsend', 'Send review')}
              </Button>
              {myReview && <span className="ag-small !text-[13px]">{t('reviews.single_review_hint', 'Editing your existing review')}</span>}
            </div>
          </>
        )}
      </Section>

      {/* Report a problem (prototype ghost button): a report needs an account, so the team can tell
          one person's repeated reports from many people's; signed-out readers sign in first. */}
      {user ? (
        <Button className="self-start" onClick={() => setReportTarget({ type: 'listing', id: item.id })} data-testid="listing-report">
          {t('listing.report', 'Report a problem')}
        </Button>
      ) : (
        <ButtonLink className="self-start" to={loginHref} data-testid="listing-report">
          {t('listing.report', 'Report a problem')}
        </ButtonLink>
      )}
      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onBlocked={load} />
    </>
  );
}
