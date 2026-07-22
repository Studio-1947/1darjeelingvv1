import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Star, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fetchReviews, postReview, deleteReview, Review, ReviewSummary } from '@/lib/reviews';

/** Read-only row of five stars for a given rating (supports halves via rounding). */
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star key={s} size={size} className={s <= Math.round(value) ? 'fill-gold text-gold' : 'text-ink-soft/40'} />
      ))}
    </span>
  );
}

/** Clickable 1–5 star picker for composing a review. */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={`${s} star${s > 1 ? 's' : ''}`}
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
  const { user } = useAuth();
  const loc = useLocation();
  const [summary, setSummary] = useState<ReviewSummary>({ count: 0, average: 0 });
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
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

  // Prefill the form from the user's existing review once loaded (so submitting edits it). Keyed on
  // myReview's identity, which only changes when the reviews list reloads — never mid-typing.
  useEffect(() => {
    if (myReview) {
      setRating(myReview.rating);
      setComment(myReview.comment);
    }
  }, [myReview]);

  const submit = async () => {
    if (rating < 1) { setError('Please pick a star rating.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await postReview(item.id, rating, comment.trim());
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not save your review. Please try again.');
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
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section id="reviews" data-testid="detail-reviews" className="bg-white scroll-mt-20">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8 py-16 md:py-24">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-soft">Reviews</div>
          <h2 className="mt-5 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">
            What guests say
          </h2>
          <div className="mt-4 flex items-center justify-center gap-3">
            <Stars value={summary.average} size={20} />
            <span className="text-ink font-bold text-lg">
              {summary.count > 0 ? summary.average.toFixed(1) : '—'}
            </span>
            <span className="text-ink-soft text-sm">
              {summary.count} review{summary.count === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Compose / edit (signed-in) or a sign-in prompt */}
        <div className="mt-10 mist-panel p-6 md:p-8">
          {user ? (
            <div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-display font-bold text-lg text-ink">
                  {myReview ? 'Update your review' : 'Write a review'}
                </h3>
                {myReview && (
                  <button onClick={removeMine} disabled={submitting} data-testid="review-delete"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-flag hover:text-[#8a1e1e] disabled:opacity-50">
                    <Trash2 size={13} /> Remove
                  </button>
                )}
              </div>
              <div className="mt-3"><StarPicker value={rating} onChange={setRating} /></div>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                data-testid="review-comment"
                placeholder="Share a little about your experience (optional)"
                className="mt-3 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-ink text-sm resize-none focus:ring-2 focus:ring-pine/20 transition-all"
              />
              {error && <p className="mt-2 text-sm text-flag font-semibold">{error}</p>}
              <button onClick={submit} disabled={submitting} data-testid="review-submit"
                className="mt-3 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-60">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                {myReview ? 'Update review' : 'Post review'}
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className="text-ink-soft">Been here? Sign in to share your rating and review.</p>
              <Link to={`/login?next=${encodeURIComponent(loc.pathname + '#reviews')}`}
                className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-flag text-white font-bold btn-hover">
                Sign in to review
              </Link>
            </div>
          )}
        </div>

        {/* Existing reviews */}
        <div className="mt-8 space-y-4">
          {loading ? (
            <p className="text-ink-soft text-center">Loading reviews…</p>
          ) : reviews.length === 0 ? (
            <p className="text-ink-soft text-center">No reviews yet — be the first to leave one.</p>
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
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
