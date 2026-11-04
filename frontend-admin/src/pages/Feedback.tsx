import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareText, RefreshCw, RotateCcw, ShieldCheck, Star, Store } from 'lucide-react';
import api from '@/lib/api';

/**
 * Feedback: what travellers say about aangan (traveller dashboard, GET /feedback/aangan/all) and
 * what hosts say (host dashboard, GET /admin/host-feedback). Each note can be marked resolved.
 */
type Item = {
  id: string;
  message: string;
  status: 'open' | 'resolved';
  created_at: string;
  rating?: number | null;
  user: { name: string; phone: string };
  business?: { name: string; type: string };
  booking?: { id: string; place: string | null } | null;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function Feedback() {
  const [tab, setTab] = useState<'travellers' | 'hosts'>('travellers');
  const [show, setShow] = useState<'open' | 'resolved' | 'all'>('open');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(tab === 'travellers' ? '/feedback/aangan/all' : '/admin/host-feedback');
      setItems(data.items || []);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Could not load feedback');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (item: Item, status: 'open' | 'resolved') => {
    setBusy(item.id);
    try {
      await api.patch(tab === 'travellers' ? `/feedback/aangan/${item.id}` : `/admin/host-feedback/${item.id}`, { status });
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, status } : x)));
    } catch (e: any) {
      window.alert(e?.response?.data?.detail || 'Could not update');
    } finally {
      setBusy(null);
    }
  };

  const shown = items.filter((i) => show === 'all' || i.status === show);
  const openCount = items.filter((i) => i.status === 'open').length;
  const rated = items.filter((i) => i.rating);
  const avg = rated.length ? (rated.reduce((a, i) => a + (i.rating || 0), 0) / rated.length).toFixed(1) : null;
  const pill = (on: boolean) => `px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-ink'}`;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8" data-testid="feedback-page">
      <div className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
          <ShieldCheck size={14} /> System Administrator
        </div>
        <h1 className="mt-1 font-display font-extrabold text-4xl text-ink leading-none">Feedback</h1>
        <p className="mt-2 text-sm text-ink-soft">What travellers and hosts tell aangan from their dashboards.</p>
      </div>

      <div className="flex gap-2 border-b border-[var(--line)] mb-5" role="tablist">
        {[
          { id: 'travellers' as const, label: 'From travellers', Icon: MessageSquareText },
          { id: 'hosts' as const, label: 'From hosts', Icon: Store },
        ].map(({ id, label, Icon }) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={`feedback-tab-${id}`}
            className={`inline-flex items-center gap-1.5 px-5 py-3 font-bold text-sm border-b-2 transition-all ${tab === id ? 'border-flag text-flag' : 'border-transparent text-ink-soft hover:text-ink'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['open', 'resolved', 'all'] as const).map((s) => (
          <button key={s} onClick={() => setShow(s)} aria-pressed={show === s} className={pill(show === s)}>
            {s === 'open' ? `Open (${openCount})` : s === 'resolved' ? 'Resolved' : 'All'}
          </button>
        ))}
        {tab === 'travellers' && avg && (
          <span className="ml-2 inline-flex items-center gap-1 text-sm font-bold text-ink"><Star size={14} className="fill-gold text-gold" /> {avg} average from {rated.length}</span>
        )}
        <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--line)] text-ink-soft hover:text-ink">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-16 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={20} /></div>
      ) : error ? (
        <div className="p-10 text-center text-flag font-semibold">{error}</div>
      ) : shown.length === 0 ? (
        <div className="mist-panel p-10 text-center text-ink-soft">Nothing here.</div>
      ) : (
        <div className="space-y-3">
          {shown.map((f) => (
            <div key={f.id} data-testid={`feedback-${f.id}`} className={`rounded-2xl border bg-white p-4 md:p-5 ${f.status === 'open' ? 'border-[var(--line)]' : 'border-[var(--line)] opacity-70'}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-bold text-ink text-sm">{f.business ? f.business.name : f.user.name}</span>
                <span className="text-ink-soft">
                  {f.business ? `${f.business.type} · ${f.user.name} · ` : ''}{f.user.phone} · {when(f.created_at)}
                </span>
                {f.rating ? (
                  <span className="inline-flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => <Star key={n} size={12} className={n <= (f.rating || 0) ? 'fill-gold text-gold' : 'text-ink-soft'} />)}
                  </span>
                ) : null}
                <span className={`ml-auto px-2.5 py-0.5 rounded-full font-bold ${f.status === 'open' ? 'bg-gold/20 text-[#7a5d00]' : 'bg-pine/10 text-pine'}`}>{f.status}</span>
              </div>
              {f.booking ? <p className="mt-1 text-xs font-semibold text-[#007C85]" data-testid={`feedback-trip-${f.id}`}>After a trip{f.booking.place ? ` to ${f.booking.place}` : ''}</p> : null}
              <p className="mt-2 text-sm text-ink whitespace-pre-line">{f.message}</p>
              <div className="mt-3">
                {f.status === 'open' ? (
                  <button onClick={() => setStatus(f, 'resolved')} disabled={busy !== null} data-testid={`feedback-resolve-${f.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-pine/40 text-pine hover:bg-pine/10 disabled:opacity-50">
                    {busy === f.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Mark resolved
                  </button>
                ) : (
                  <button onClick={() => setStatus(f, 'open')} disabled={busy !== null}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--line)] text-ink hover:border-ink disabled:opacity-50">
                    <RotateCcw size={12} /> Reopen
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
