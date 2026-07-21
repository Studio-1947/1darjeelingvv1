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

  // Tracks object URLs we've created so they can be revoked once no longer
  // needed, instead of leaking blob memory for every document viewed.
  const pendingObjectUrls = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const params: Record<string, string | number> = { limit: PAGE_SIZE, offset };
      if (statusFilter !== 'all') params.status = statusFilter;
      const { data } = await api.get('/admin/kyc', { params });
      setDocs(data.documents || []);
      setTotal(typeof data.total === 'number' ? data.total : (data.documents || []).length);
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || 'Failed to load the KYC queue.');
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

  const review = async (doc: AdminKycDoc, decision: 'approve' | 'reject') => {
    setReviewError(null);

    // Anything other than reviewing a still-`pending` document is a corrective decision —
    // overturning a call that was already made. Those get an explicit confirmation, on top of
    // (for rejections) the existing reason prompt, since undoing them means the provider has
    // to re-upload or waits on a second re-review.
    const isCorrective = doc.status !== 'pending';
    const isRevoke = decision === 'reject' && doc.status === 'approved';

    let reason: string | undefined;
    if (decision === 'reject') {
      const promptLabel = isRevoke
        ? 'Reason for revoking this approval? The provider will see this.'
        : 'Reason for rejection? The provider will see this.';
      const input = window.prompt(promptLabel);
      if (input === null) return; // cancelled — abort silently
      reason = input.trim();
      if (!reason) {
        setReviewError('A rejection reason is required — the provider needs to know what to fix.');
        return;
      }
    }

    if (isCorrective) {
      const verb = isRevoke ? 'revoke the approval of' : decision === 'approve' ? 'approve' : 'reject';
      const extra = isRevoke ? ' This withdraws the provider\'s Verified status for this document.' : '';
      const confirmed = window.confirm(
        `This document is currently "${doc.status}". Are you sure you want to ${verb} it?${extra}`
      );
      if (!confirmed) return;
    }

    setBusy(doc.id);
    try {
      await api.post(`/admin/kyc/${doc.id}/review`, { decision, reason });
      setReviewError(null);
      await load();
    } catch (e: any) {
      setReviewError(e?.response?.data?.detail || `Could not ${decision} that document. Please try again.`);
    } finally {
      setBusy(null);
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
    </div>
  );
}
