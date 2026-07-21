import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, FileText, CheckCircle2, XCircle, RefreshCw, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

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

// The API baseURL already ends in `/api`, but `file_url` from the backend is
// itself a relative path rooted at `/api` (e.g. `/api/providers/kyc/:id/file`).
// Strip the trailing `/api` from the configured base so we don't double it up.
const API_ORIGIN = (import.meta.env.VITE_API_URL || 'http://localhost:8000/api').replace(/\/api$/, '');

// How long an object URL is kept alive after being opened in a new tab, so the
// tab has time to load the blob before we release the memory it points to.
const OBJECT_URL_TTL_MS = 60_000;

export default function KycReview() {
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [docs, setDocs] = useState<AdminKycDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [fileError, setFileError] = useState('');

  // Tracks object URLs we've created so they can be revoked once no longer
  // needed, instead of leaking blob memory for every document viewed.
  const pendingObjectUrls = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/admin/kyc', { params: { status: 'pending' } });
      setDocs(data.documents || []);
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || 'Failed to load the KYC queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      nav('/login');
      return;
    }
    load();
  }, [authLoading, user, nav, load]);

  // Revoke any object URLs still outstanding when the page unmounts.
  useEffect(() => {
    return () => {
      pendingObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      pendingObjectUrls.current.clear();
    };
  }, []);

  const review = async (id: string, decision: 'approve' | 'reject') => {
    let reason: string | undefined;
    if (decision === 'reject') {
      reason = window.prompt('Reason for rejection?') || '';
      if (!reason) return;
    }
    setBusy(id);
    try {
      await api.post(`/admin/kyc/${id}/review`, { decision, reason });
      await load();
    } catch (e: any) {
      setLoadError(e?.response?.data?.detail || 'Failed to submit the review decision.');
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

  if (authLoading || loading) {
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

      {fileError && (
        <div className="mb-6 p-4 rounded-xl bg-flag/10 border border-flag/20 text-sm text-flag font-semibold text-center">
          {fileError}
        </div>
      )}

      <div className="mist-panel p-4 md:p-6">
        <h2 className="text-sm font-bold text-ink-soft mb-4">{docs.length} document{docs.length === 1 ? '' : 's'} pending</h2>

        {docs.length === 0 ? (
          <p className="text-ink-soft text-sm py-8 text-center">No pending documents. The queue is clear.</p>
        ) : (
          <div className="space-y-2">
            {docs.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] rounded-xl p-4"
              >
                <div>
                  <div className="font-semibold text-ink">
                    {d.business_name || 'Unnamed business'} {d.business_type ? `· ${d.business_type}` : ''}
                  </div>
                  <div className="text-sm text-ink-soft">
                    {d.owner_name || 'Unknown owner'} — {d.doc_type}
                  </div>
                  <button
                    onClick={() => openFile(d.file_url)}
                    className="mt-1 inline-flex items-center gap-1 text-pine text-sm font-semibold hover:underline"
                  >
                    <FileText size={13} /> View document
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pine text-white text-xs font-bold btn-hover disabled:opacity-50"
                    disabled={busy === d.id}
                    onClick={() => review(d.id, 'approve')}
                  >
                    {busy === d.id ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-flag text-white text-xs font-bold btn-hover disabled:opacity-50"
                    disabled={busy === d.id}
                    onClick={() => review(d.id, 'reject')}
                  >
                    {busy === d.id ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />} Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
