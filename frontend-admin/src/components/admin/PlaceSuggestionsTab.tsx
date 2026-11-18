import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, RefreshCw, XCircle } from 'lucide-react';
import api from '@/lib/api';

type Status = 'pending' | 'approved' | 'rejected' | 'all';

interface Suggestion {
  id: string;
  name: string;
  place: string;
  details: string;
  entry_price: number | null;
  photos: string[];
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  listing_id: string | null;
  created_at: string;
  reviewed_at: string | null;
  user: { id: string; name: string; phone: string };
}

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Place suggestions: spots travellers and hosts sent from the app's "Suggest a place"
 * (POST /api/spots/suggestions). Approve creates the spot as an unpublished draft in Tourist Spots
 * (the team checks it and publishes it there); reject keeps an optional note the sender sees. The
 * sender is notified either way.
 */
export default function PlaceSuggestionsTab({ onApproved }: { onApproved: () => void }) {
  const [show, setShow] = useState<Status>('pending');
  const [items, setItems] = useState<Suggestion[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/admin/spots/suggestions', { params: { status: show } });
      setItems(data.items || []);
      setCounts(data.counts || {});
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load the suggestions');
    } finally {
      setLoading(false);
    }
  }, [show]);
  useEffect(() => { load(); }, [load]);

  const decide = async (s: Suggestion, action: 'approve' | 'reject') => {
    if (action === 'reject' && !window.confirm(`Turn down "${s.name}"? ${s.user.name || 'The sender'} is told, with your note if you wrote one.`)) return;
    setBusy(s.id);
    setMsg('');
    try {
      const note = (notes[s.id] || '').trim() || undefined;
      const title = (titles[s.id] || '').trim();
      const body = action === 'approve' ? { note, ...(title && title !== s.name ? { title } : {}) } : { note };
      await api.post(`/admin/spots/suggestions/${s.id}/${action}`, body);
      setMsg(action === 'approve'
        ? `"${title || s.name}" was added to Tourist Spots as a draft. Check it there and publish it.`
        : `"${s.name}" was turned down.`);
      if (action === 'approve') onApproved();
      await load();
    } catch (e: any) {
      window.alert(e?.response?.data?.detail || 'That did not go through');
    } finally {
      setBusy(null);
    }
  };

  const pill = (on: boolean) => `px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-ink'}`;
  const badge = (st: Suggestion['status']) =>
    st === 'pending' ? 'bg-gold/20 text-[#7a5d00]' : st === 'approved' ? 'bg-pine/10 text-pine' : 'bg-flag/10 text-flag';

  return (
    <div data-testid="place-suggestions-tab">
      <p className="text-sm text-ink-soft mb-4">
        Places travellers and hosts suggested from the app. Approving one adds it to Tourist Spots as an unpublished draft.
      </p>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['pending', 'approved', 'rejected', 'all'] as const).map((s) => (
          <button key={s} onClick={() => setShow(s)} aria-pressed={show === s} className={pill(show === s)} data-testid={`sugg-filter-${s}`}>
            {s === 'all' ? 'All' : `${s[0].toUpperCase()}${s.slice(1)} (${counts[s] ?? 0})`}
          </button>
        ))}
        <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--line)] text-ink-soft hover:text-ink">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      {msg && <div className="mb-4 rounded-xl bg-pine/10 text-pine text-sm font-semibold px-4 py-3" role="status">{msg}</div>}

      {loading ? (
        <div className="p-16 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={20} /></div>
      ) : error ? (
        <div className="p-10 text-center text-flag font-semibold">{error}</div>
      ) : items.length === 0 ? (
        <div className="mist-panel p-10 text-center text-ink-soft">Nothing here.</div>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <div key={s.id} data-testid={`sugg-${s.id}`} className="rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-ink text-sm">{s.name}</span>
                <span className="inline-flex items-center gap-1 text-ink-soft"><MapPin size={12} /> {s.place}</span>
                <span className="text-ink-soft">· {s.entry_price ? `₹${s.entry_price} ticket` : 'Free entry'}</span>
                <span className={`ml-auto px-2.5 py-0.5 rounded-full font-bold ${badge(s.status)}`}>{s.status}</span>
              </div>
              <p className="mt-1 text-xs text-ink-soft">From {s.user.name || 'someone'} · {s.user.phone} · {when(s.created_at)}</p>
              <p className="mt-2 text-sm text-ink whitespace-pre-line">{s.details}</p>
              {s.photos.length > 0 && (
                <div className="mt-3 flex gap-2 overflow-x-auto">
                  {s.photos.map((p) => (
                    <a key={p} href={p} target="_blank" rel="noreferrer">
                      <img src={p} alt="" className="h-20 w-28 flex-none rounded-lg object-cover border border-[var(--line)]" />
                    </a>
                  ))}
                </div>
              )}
              {s.review_note && <p className="mt-2 text-xs text-ink-soft">Note: {s.review_note}</p>}
              {s.status === 'pending' && (
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <label className="text-xs font-bold text-ink-soft">
                    Spot title (correct it if needed)
                    <input className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-normal text-ink"
                      value={titles[s.id] ?? s.name} maxLength={160} onChange={(e) => setTitles((x) => ({ ...x, [s.id]: e.target.value }))}
                      data-testid={`sugg-title-${s.id}`} />
                  </label>
                  <label className="text-xs font-bold text-ink-soft">
                    Note for the sender (optional)
                    <input className="mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-normal text-ink"
                      value={notes[s.id] ?? ''} maxLength={300} onChange={(e) => setNotes((x) => ({ ...x, [s.id]: e.target.value }))}
                      placeholder="e.g. This is private land" data-testid={`sugg-note-${s.id}`} />
                  </label>
                  <div className="md:col-span-2 flex flex-wrap gap-2">
                    <button onClick={() => decide(s, 'approve')} disabled={busy !== null} data-testid={`sugg-approve-${s.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-pine/40 text-pine hover:bg-pine/10 disabled:opacity-50">
                      {busy === s.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Approve as a draft spot
                    </button>
                    <button onClick={() => decide(s, 'reject')} disabled={busy !== null} data-testid={`sugg-reject-${s.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-flag/40 text-flag hover:bg-flag/10 disabled:opacity-50">
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
