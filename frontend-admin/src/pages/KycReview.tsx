import { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, FileText, CheckCircle2, XCircle, RefreshCw, Loader2, Undo2, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';

interface AdminKycDoc {
  id: string;
  provider_id: string;
  doc_type: string;
  status: string;
  rejection_reason: string | null;
  uploaded_at: string;
  reviewed_at: string | null;
  business_name: string | null;
  business_type: string | null;
  owner_name: string | null;
  file_url: string;
}

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const PAGE_SIZE = 20;

// The API baseURL already ends in `/api`, but `file_url` from the backend is
// itself a relative path rooted at `/api` (e.g. `/api/providers/kyc/:id/file`).
// Strip the trailing `/api` from the configured base so we don't double it up.
const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api$/, '');

// How long an object URL is kept alive after being opened in a new tab, so the
// tab has time to load the blob before we release the memory it points to.
const OBJECT_URL_TTL_MS = 60_000;

function statusBadgeClass(status: string): string {
  if (status === 'approved') return 'bg-pine/10 text-pine';
  if (status === 'rejected') return 'bg-flag/10 text-flag';
  return 'bg-gold/20 text-[#8a6b04]'; // pending
}

type Decision = 'approve' | 'reject';
interface ReviewTarget {
  doc: AdminKycDoc;
  decision: Decision;
}

/**
 * In-app replacement for the browser's native prompt()/confirm() the reject flow used to use.
 * Collects the rejection reason (when rejecting) and, for a decision that overturns an existing
 * one, folds the "are you sure" confirmation into the same step instead of stacking two native
 * dialogs. Self-contained: owns the reason input, focus, Escape-to-cancel, and backdrop-dismiss.
 */
function ReviewDialog({ target, busy, error, onCancel, onConfirm }: {
  target: ReviewTarget;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}) {
  const { doc, decision } = target;
  const needsReason = decision === 'reject';
  const isRevoke = decision === 'reject' && doc.status === 'approved';
  const isCorrective = doc.status !== 'pending';

  const [reason, setReason] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus the primary control on open — the reason box when there is one, otherwise the confirm
  // button so Enter/Escape work immediately for a pure confirmation.
  useEffect(() => {
    (needsReason ? textareaRef.current : confirmRef.current)?.focus();
  }, [needsReason]);

  // Escape cancels, but never mid-request (that would strand the admin unsure whether it landed).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const reasonMissing = needsReason && !reason.trim();
  const isReject = decision === 'reject';

  const title = isRevoke ? 'Revoke approval' : isReject ? 'Reject document' : 'Approve document';
  const confirmLabel = isRevoke ? 'Revoke approval' : isReject ? 'Reject' : 'Approve';

  const submit = () => {
    if (busy || reasonMissing) return;
    onConfirm(needsReason ? reason.trim() : undefined);
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-dialog-title"
      data-testid="kyc-review-dialog"
      // Dismiss when the click starts on the backdrop itself (not on the panel), and never mid-request.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className={`modal-panel mist-panel w-full max-w-md p-6 shadow-2xl border-t-4 ${isReject ? 'border-flag' : 'border-pine'}`}>
        <h2 id="review-dialog-title" className="font-display font-extrabold text-2xl text-ink">
          {title}
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          {doc.business_name || 'Unnamed business'} — {doc.doc_type}
        </p>

        {isCorrective && (
          <div className="mt-4 p-3 rounded-xl bg-gold/15 border border-gold/40 text-sm text-[#8a6b04]">
            This document is currently <span className="font-bold">{doc.status}</span>.{' '}
            {isRevoke
              ? "Revoking withdraws the provider's Verified status for it until they re-upload and it's approved again."
              : 'This overrides the existing decision.'}
          </div>
        )}

        {needsReason && (
          <label className="block mt-4">
            <span className="text-xs font-semibold text-ink-soft">Reason — the provider will see this</span>
            <textarea
              ref={textareaRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              data-testid="kyc-review-reason"
              placeholder="e.g. The document is blurry — please re-upload a clearer scan."
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-ink text-sm resize-none focus:ring-2 focus:ring-flag/20 transition-all"
              // Ctrl/Cmd+Enter submits, matching the muscle memory of most comment boxes.
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
              }}
            />
            <span className="mt-1 block text-[11px] text-ink-soft">
              Required — the provider needs to know what to fix.
            </span>
          </label>
        )}

        {error && (
          <div
            className="mt-4 p-3 rounded-xl bg-flag/10 border border-flag/20 text-sm text-flag font-semibold"
            data-testid="kyc-review-dialog-error"
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            data-testid="kyc-review-cancel"
            className="px-4 py-2 rounded-full text-sm font-bold text-ink-soft hover:bg-mist disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={submit}
            disabled={busy || reasonMissing}
            data-testid="kyc-review-confirm"
            className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-white text-sm font-bold btn-hover disabled:opacity-50 disabled:cursor-not-allowed ${
              isReject ? 'bg-flag' : 'bg-pine'
            }`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KycReview() {
  const [docs, setDocs] = useState<AdminKycDoc[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');
  const [reviewError, setReviewError] = useState<string | null>(null);
  // The document + decision currently being confirmed in the in-app dialog (null = dialog closed),
  // and any error from the dialog's own submit so it can be shown in-context and the dialog kept open.
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Tracks object URLs we've created so they can be revoked once no longer
  // needed, instead of leaking blob memory for every document viewed.
  const pendingObjectUrls = useRef<Set<string>>(new Set());

  // Returns the fetched page (or null on failure) so callers that need to react to what came
  // back — e.g. `review()` deciding whether the current page just became empty — don't have to
  // read `docs`/`total` state right after calling this, which wouldn't yet reflect the update.
  const load = useCallback(async (): Promise<{ documents: AdminKycDoc[]; total: number } | null> => {
    setLoading(true);
    setLoadError('');
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/admin/kyc', { params });
      const documents: AdminKycDoc[] = data.documents || [];
      const total = typeof data.total === 'number' ? data.total : documents.length;
      setDocs(documents);
      setTotal(total);
      return { documents, total };
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || 'Failed to load the KYC queue.');
      return null;
    } finally {
      setLoading(false);
    }
  }, [statusFilter, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // Revoke any object URLs still outstanding when the page unmounts.
  useEffect(() => {
    return () => {
      pendingObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      pendingObjectUrls.current.clear();
    };
  }, []);

  const changeStatusFilter = (next: StatusFilter) => {
    if (next === statusFilter) return;
    setStatusFilter(next);
    setOffset(0); // a new filter starts back at page 1
  };

  // Posts the decision to the API and refreshes the page. Returns an error message on failure
  // (rather than setting state itself) so each caller can decide where to surface it — the page
  // banner for the frictionless immediate-approve path, or inside the dialog for everything else.
  const submitReview = async (
    doc: AdminKycDoc,
    decision: Decision,
    reason: string | undefined
  ): Promise<string | null> => {
    setBusy(doc.id);
    try {
      await api.post(`/admin/kyc/${doc.id}/review`, { decision, reason });
      const result = await load();
      // Reviewing the only remaining item on a non-first page (e.g. approving the last pending
      // doc while filtered to "Pending") moves it out of the current filter, leaving `offset`
      // past the new `total` and the page empty. Step back a page rather than stranding the
      // admin looking at nothing.
      if (result && result.documents.length === 0 && offset > 0 && offset >= result.total) {
        setOffset((o) => Math.max(0, o - PAGE_SIZE));
      }
      return null;
    } catch (e: any) {
      return e?.response?.data?.detail || `Could not ${decision} that document. Please try again.`;
    } finally {
      setBusy(null);
    }
  };

  const review = async (doc: AdminKycDoc, decision: Decision) => {
    setReviewError(null);

    // Approving a still-`pending` document is the one no-friction path: nothing to collect, nothing
    // being overturned — so it submits straight away, as it always did. Everything else (any
    // rejection, or any decision that overturns an existing one) opens the in-app dialog to gather
    // a reason and/or confirm the override, replacing the old native prompt()/confirm() pair.
    const isCorrective = doc.status !== 'pending';
    if (decision === 'approve' && !isCorrective) {
      const err = await submitReview(doc, decision, undefined);
      if (err) setReviewError(err);
      return;
    }

    setDialogError(null);
    setReviewTarget({ doc, decision });
  };

  // Confirm handler for the dialog: run the decision, close on success, or keep the dialog open
  // with the error shown in-context so the admin can retry without losing their typed reason.
  const confirmReview = async (reason?: string) => {
    if (!reviewTarget) return;
    const err = await submitReview(reviewTarget.doc, reviewTarget.decision, reason);
    if (err) {
      setDialogError(err);
    } else {
      setReviewTarget(null);
      setDialogError(null);
    }
  };

  // The proxied file endpoint requires the admin token, so a plain <img src>
  // or window.open(url) can't be used (no Authorization header -> 403).
  // Fetch it with the token and open the resulting blob via an object URL,
  // then release that URL after it's had time to load in the new tab.
  const openFile = async (fileUrl: string) => {
    setFileError('');
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch(`${API_ORIGIN}${fileUrl}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Document fetch failed (${res.status})`);
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      pendingObjectUrls.current.add(objectUrl);
      window.open(objectUrl, '_blank');

      // Release the blob once the new tab has had a chance to load it.
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
        pendingObjectUrls.current.delete(objectUrl);
      }, OBJECT_URL_TTL_MS);
    } catch (e) {
      setFileError('Could not open the document. It may have been removed or you may need to sign in again.');
    }
  };

  if (loading && docs.length === 0) {
    return <div className="p-16 text-center text-ink-soft">Loading KYC queue...</div>;
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="font-display font-extrabold text-3xl text-flag">Couldn't load KYC queue</h1>
        <p className="text-ink-soft mt-2">{loadError}</p>
        <button
          onClick={load}
          className="mt-6 inline-flex items-center gap-1.5 px-6 py-2.5 rounded-full bg-flag text-white font-bold btn-hover"
        >
          <RefreshCw size={14} /> Try Again
        </button>
      </div>
    );
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + docs.length, total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8" data-testid="kyc-review-page">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
            <ShieldCheck size={14} /> System Administrator
          </div>
          <h1 className="mt-1 font-display font-extrabold text-4xl text-ink leading-none">KYC Review</h1>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold border border-[var(--line)] rounded-full text-ink hover:bg-mist transition-all"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6" role="tablist" aria-label="Filter by status">
        {STATUS_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            role="tab"
            aria-selected={statusFilter === key}
            data-testid={`kyc-filter-${key}`}
            onClick={() => changeStatusFilter(key)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              statusFilter === key
                ? 'bg-pine text-white border-pine'
                : 'text-ink-soft border-[var(--line)] hover:bg-mist'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {fileError && (
        <div className="mb-6 p-4 rounded-xl bg-flag/10 border border-flag/20 text-sm text-flag font-semibold text-center">
          {fileError}
        </div>
      )}

      {reviewError && (
        <div className="mb-6 p-4 rounded-xl bg-flag/10 border border-flag/20 text-sm text-flag font-semibold flex items-center justify-between gap-4">
          <span>{reviewError}</span>
          <button
            onClick={() => setReviewError(null)}
            className="shrink-0 text-flag/70 hover:text-flag font-bold"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      <div className="mist-panel p-4 md:p-6">
        <h2 className="text-sm font-bold text-ink-soft mb-4">
          {total} document{total === 1 ? '' : 's'} {statusFilter === 'all' ? 'total' : statusFilter}
        </h2>

        {docs.length === 0 ? (
          <p className="text-ink-soft text-sm py-8 text-center">
            {statusFilter === 'pending' ? 'No pending documents. The queue is clear.' : 'No documents match this filter.'}
          </p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] rounded-xl p-4"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-ink">
                      {d.business_name || 'Unnamed business'} {d.business_type ? `· ${d.business_type}` : ''}
                    </span>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusBadgeClass(d.status)}`}>
                      {d.status}
                    </span>
                  </div>
                  <div className="text-sm text-ink-soft">
                    {d.owner_name || 'Unknown owner'} — {d.doc_type}
                  </div>
                  {d.status === 'rejected' && d.rejection_reason && (
                    <div className="text-xs text-flag mt-0.5">Reason: {d.rejection_reason}</div>
                  )}
                  <button
                    onClick={() => openFile(d.file_url)}
                    className="mt-1 inline-flex items-center gap-1 text-pine text-sm font-semibold hover:underline"
                  >
                    <FileText size={13} /> View document
                  </button>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex gap-2">
                    {d.status !== 'approved' && (
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-bold btn-hover disabled:opacity-50"
                        disabled={busy === d.id}
                        onClick={() => review(d, 'approve')}
                      >
                        {busy === d.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                        {d.status === 'rejected' ? 'Approve (override)' : 'Approve'}
                      </button>
                    )}
                    {d.status !== 'rejected' && (
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-flag text-white text-xs font-bold btn-hover disabled:opacity-50"
                        disabled={busy === d.id}
                        onClick={() => review(d, 'reject')}
                      >
                        {busy === d.id ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : d.status === 'approved' ? (
                          <Undo2 size={13} />
                        ) : (
                          <XCircle size={13} />
                        )}
                        {d.status === 'approved' ? 'Revoke approval' : 'Reject'}
                      </button>
                    )}
                  </div>
                  {d.status !== 'pending' && (
                    <span className="text-[10px] text-ink-soft">Changes the existing decision</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-[var(--line)]">
            <span className="text-xs text-ink-soft">
              Showing {pageStart}–{pageEnd} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
                disabled={!canPrev || loading}
                data-testid="kyc-page-prev"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--line)] text-xs font-bold text-ink disabled:opacity-40 hover:bg-mist transition-colors"
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <button
                onClick={() => setOffset((o) => o + PAGE_SIZE)}
                disabled={!canNext || loading}
                data-testid="kyc-page-next"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--line)] text-xs font-bold text-ink disabled:opacity-40 hover:bg-mist transition-colors"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>

      {reviewTarget && (
        <ReviewDialog
          target={reviewTarget}
          busy={busy === reviewTarget.doc.id}
          error={dialogError}
          onCancel={() => {
            setReviewTarget(null);
            setDialogError(null);
          }}
          onConfirm={confirmReview}
        />
      )}
    </div>
  );
}
