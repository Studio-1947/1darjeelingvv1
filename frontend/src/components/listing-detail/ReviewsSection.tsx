import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Star, CircleNotch as Loader2, Trash as Trash2, Camera, X, Flag } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { fetchReviews, postReview, deleteReview, CanReview, Review, ReviewSummary } from '@/lib/reviews';
import { uploadImages } from '@/lib/uploadImage';
import { ReviewSkeleton, LoadingStatus, repeat } from '@/components/skeletons';
import { Button, ButtonLink, FieldError, IconButton, TextArea } from '@/components/ag';
import { Section } from './primitives';
import ReportDialog, { ReportTarget } from './ReportDialog';

// Matches MAX_REVIEW_PHOTOS in backend/src/routes/reviews.ts.
const MAX_REVIEW_PHOTOS = 6;

/** Read-only star line for a rating (prototype `.starline`). */
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-0.5 text-[var(--r)]" role="img" aria-label={t('reviews.out_of_5', { value })}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={size} weight={s <= Math.round(value) ? 'fill' : 'regular'} className={s <= Math.round(value) ? '' : 'opacity-30'} />
      ))}
    </span>
  );
}

/** Five 44px stars to tap (prototype `.stars`). */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={t('reviews.your_rating')} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={t('reviews.star_aria', { count: s })}
          data-testid={`review-star-${s}`}
          onMouseEnter={() => setHover(s)}
          onClick={() => onChange(s)}
          className="w-11 h-11 grid place-items-center rounded-full text-[var(--r)] hover:bg-[var(--r-tint)]"
        >
          <Star size={30} weight={s <= (hover || value) ? 'fill' : 'regular'} />
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
      <Section id="reviews" testid="detail-reviews" title={t('reviews.label')}
        action={summary.count > 0 ? (
          <span className="inline-flex items-center gap-1.5 flex-none">
            <Stars value={summary.average} />
            <span className="font-medium text-[var(--ink-strong)]">{summary.average.toFixed(1)}</span>
            <span className="ag-small">({summary.count})</span>
          </span>
        ) : undefined}>
        {/* What others said first, then your own (prototype order). */}
        {loading ? (
          <div className="flex flex-col gap-3">
            <LoadingStatus label={t('reviews.loading')} />
            {repeat(2, (i) => <ReviewSkeleton key={i} />)}
          </div>
        ) : reviews.length === 0 ? (
          <p className="ag-small">{t('reviews.empty')}</p>
        ) : (
          <div className="flex flex-col">
            {reviews.map((r) => (
              <article key={r.id} data-testid={`review-${r.id}`} className="flex flex-col gap-1.5 py-3 border-b border-[var(--warmline)] last:border-b-0 first:pt-0">
                <div className="flex items-center justify-between gap-3">
                  <Stars value={r.rating} />
                  {user && r.user_id !== user.id && (
                    <Button variant="text" size="sm" className="!text-[13px] !text-[var(--ink-muted)]"
                      onClick={() => setReportTarget({ type: 'review', id: r.id, authorId: r.user_id, authorName: r.author_name || '?' })}
                      data-testid={`review-report-${r.id}`}>
                      {t('report.review_link')}
                    </Button>
                  )}
                </div>
                {r.comment && <p className="m-0 text-[15px] leading-[22px] text-[var(--ink7)]">{r.comment}</p>}
                {r.photos && r.photos.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {r.photos.map((p, idx) => (
                      <a key={idx} href={p} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-[12px] overflow-hidden bg-[var(--creme2)]">
                        <img src={p} alt={t('reviews.attachment_alt')} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
                <p className="ag-small !text-[13px]">
                  {r.author_name}, {new Date(r.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </article>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-[var(--warmline)] pt-3">
          {user && !myReview && canReview?.code === 'stay_required' ? (
            // Homestays, drivers and guides are reviewed by people who stayed or rode with them.
            <p data-testid="review-stay-required" className="ag-small">{t('reviews.stay_required')}</p>
          ) : user ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <b className="font-medium text-[var(--ink-strong)]">{myReview ? t('reviews.update_title') : t('detail.rate_q', 'How was it? Tap the stars.')}</b>
                {myReview && (
                  <Button variant="stop" size="sm" onClick={removeMine} disabled={submitting} data-testid="review-delete" icon={<Trash2 />}>
                    {t('reviews.remove')}
                  </Button>
                )}
              </div>
              <StarPicker value={rating} onChange={setRating} />
              <TextArea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} data-testid="review-comment"
                placeholder={t('reviews.comment_placeholder')} aria-label={t('reviews.comment_placeholder')} className="[&_textarea]:!min-h-[96px]" />

              <div className="flex flex-col gap-2">
                <span className="ag-eyebrow">{t('reviews.upload_photos')}</span>
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
                    <label className="w-16 h-16 rounded-[12px] border border-dashed border-[var(--outline)] grid place-items-center cursor-pointer text-[var(--r)] bg-[var(--surface)]">
                      {uploadingPhotos ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <span className="flex flex-col items-center gap-0.5 text-[12px] leading-4">
                          <Camera size={18} aria-hidden="true" />
                          {t('reviews.add_photo')}
                        </span>
                      )}
                      <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} disabled={uploadingPhotos || submitting} className="sr-only" />
                    </label>
                  )}
                </div>
              </div>

              <FieldError id="review-error">{error}</FieldError>
              <div className="ag-row">
                <Button onClick={submit} disabled={submitting || uploadingPhotos} data-testid="review-submit"
                  icon={submitting ? <Loader2 className="animate-spin" /> : <Star />}>
                  {myReview ? t('reviews.update_cta') : t('reviews.post')}
                </Button>
                {myReview && <span className="ag-small !text-[13px]">{t('reviews.single_review_hint', 'Editing your existing review')}</span>}
              </div>
            </>
          ) : (
            <>
              <p className="ag-small">{t('reviews.signed_out')}</p>
              <ButtonLink go size="sm" className="self-start" to={loginHref}>{t('reviews.sign_in_cta')}</ButtonLink>
            </>
          )}
        </div>
      </Section>

      {/* Report a problem (prototype): a report needs an account, so the team can tell one
          person's repeated reports from many people's; signed-out readers sign in first. */}
      {user ? (
        <Button className="self-start" icon={<Flag />} onClick={() => setReportTarget({ type: 'listing', id: item.id })} data-testid="listing-report">
          {t('detail.report_problem', 'Report a problem')}
        </Button>
      ) : (
        <ButtonLink className="self-start" icon={<Flag />} to={loginHref} data-testid="listing-report">
          {t('detail.report_problem', 'Report a problem')}
        </ButtonLink>
      )}
      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} onBlocked={load} />
    </>
  );
}
