import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Star, Loader2, Trash2, Camera, Image as ImageIcon, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchReviews, postReview, deleteReview, Review, ReviewSummary } from '@/lib/reviews';
import { uploadImages } from '@/lib/uploadImage';

/** Read-only row of five stars for a given rating (supports halves via rounding). */
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={t('reviews.out_of_5', { value })}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={size} className={s <= Math.round(value) ? 'fill-gold text-gold' : 'text-ink-soft/40'} />
      ))}
    </span>
  );
}

/** Clickable 1–5 star picker for composing a review. */
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
          className="btn-hover"
        >
          <Star size={26} className={s <= (hover || value) ? 'fill-gold text-gold' : 'text-ink-soft/40'} />
        </button>
      ))}
    </div>
  );
}

/** Reviews + rating summary for a listing, with an add/edit form for the signed-in user. */
export default function ReviewsSection({ item }: { item: any }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const loc = useLocation();
  const [summary, setSummary] = useState<ReviewSummary>({ count: 0, average: 0 });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const myReview = user ? reviews.find((r) => r.user_id === user.id) : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchReviews(item.id);
      setSummary(data.summary);
      setReviews(data.reviews);
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
    setUploadingPhotos(true);
    setError('');
    try {
      const urls = await uploadImages(files);
      setPhotos((prev) => [...prev, ...urls]);
    } catch (err: any) {
      setError(err?.message || t('reviews.upload_failed'));
    } finally {
      setUploadingPhotos(false);
    }
  };

  const submit = async () => {
    if (rating < 1) { setError(t('reviews.pick_rating')); return; }
    setSubmitting(true);
    setError('');
    try {
      await postReview(item.id, rating, comment.trim(), photos);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('reviews.save_failed'));
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
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="reviews" data-testid="detail-reviews" className="bg-white scroll-mt-20">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8 py-16 md:py-24">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-soft">{t('reviews.label')}</div>
          <h2 className="mt-5 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
            {t('reviews.title')}
          </h2>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Stars value={summary.average} size={20} />
            <span className="text-ink font-bold text-lg">
              {summary.count > 0 ? summary.average.toFixed(1) : '-'}
            </span>
            <span className="text-ink-soft text-sm">
              {t('reviews.count', { count: summary.count })}
            </span>
          </div>
        </div>

        {/* Compose / edit (signed-in) or a sign-in prompt */}
        <div className="mt-10 mist-panel p-6 md:p-8">
          {user ? (
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-display font-bold text-lg text-ink">
                  {myReview ? t('reviews.update_title') : t('reviews.write')}
                </h3>
                {myReview && (
                  <button onClick={removeMine} disabled={submitting} data-testid="review-delete"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-flag hover:text-[#8a1e1e] disabled:opacity-50">
                    <Trash2 size={13} /> {t('reviews.remove')}
                  </button>
                )}
              </div>
              <div className="mt-3"><StarPicker value={rating} onChange={setRating} /></div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                data-testid="review-comment"
                placeholder={t('reviews.comment_placeholder')}
                className="mt-3 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-ink text-sm resize-none focus:ring-2 focus:ring-pine/20 transition-all"
              />

              {/* Photo Upload Section */}
              <div className="mt-4">
                <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">{t('reviews.upload_photos')}</span>
                <div className="flex flex-wrap items-center gap-3">
                  {photos.map((p, idx) => (
                    <div key={idx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-[var(--line)] group">
                      <img src={p} alt={t('reviews.attachment_alt')} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setPhotos(photos.filter((_, i) => i !== idx))}
                        className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-flag transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                  <label className="w-16 h-16 rounded-xl border-2 border-dashed border-[var(--line)] hover:border-pine grid place-items-center cursor-pointer bg-white text-ink-soft hover:text-pine transition-colors">
                    {uploadingPhotos ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <div className="flex flex-col items-center gap-0.5">
                        <Camera size={18} />
                        <span className="text-[9px] font-bold">{t('reviews.add_photo')}</span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhotos || submitting}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {error && <p className="mt-2 text-sm text-flag font-semibold">{error}</p>}
              <button onClick={submit} disabled={submitting || uploadingPhotos} data-testid="review-submit"
                className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-60">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                {myReview ? t('reviews.update_cta') : t('reviews.post')}
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-ink-soft">{t('reviews.signed_out')}</p>
              <Link to={`/login?next=${encodeURIComponent(loc.pathname + '#reviews')}`}
                className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-flag text-white font-bold btn-hover">
                {t('reviews.sign_in_cta')}
              </Link>
            </div>
          )}
        </div>

        {/* Existing reviews */}
        <div className="mt-8 space-y-4">
          {loading ? (
            <p className="text-ink-soft text-center">{t('reviews.loading')}</p>
          ) : reviews.length === 0 ? (
            <p className="text-ink-soft text-center">{t('reviews.empty')}</p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} data-testid={`review-${r.id}`} className="rounded-2xl border border-[var(--line)] p-4 md:p-5 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-bold flex-shrink-0">
                      {(r.author_name || '?').trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-ink text-sm truncate">{r.author_name}</div>
                      <div className="text-[11px] text-ink-soft">{new Date(r.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <Stars value={r.rating} />
                </div>
                {r.comment && <p className="mt-3 text-ink leading-relaxed text-sm">{r.comment}</p>}
                {r.photos && r.photos.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {r.photos.map((p, idx) => (
                      <a key={idx} href={p} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-xl overflow-hidden border border-[var(--line)] hover:opacity-90 transition-opacity">
                        <img src={p} alt={t('reviews.attachment_alt')} className="w-full h-full object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
