import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Mic, MousePointerClick, RefreshCw, Search, Users } from 'lucide-react';
import api from '@/lib/api';
import StatCard from '@/components/admin/StatCard';

const TYPES = ['', 'homestay', 'driver', 'guide', 'cafe', 'shop', 'food', 'spot', 'biodiversity', 'event'] as const;
const TYPE_LABEL: Record<string, string> = {
  '': 'Everything', homestay: 'Homestays', driver: 'Drivers', guide: 'Guides', cafe: 'Cafes', shop: 'Shops', food: 'Food', spot: 'Places', biodiversity: 'Nature', event: 'Festivals',
};
const DAYS = [7, 30, 90, 180] as const;

interface Report {
  days: number;
  keep_days: number;
  /** missing: found nothing or only similar listings, each search once. */
  totals: { searches: number; sessions: number; zero: number; fallback: number; missing: number; opened: number; voice: number };
  top: { q: string; n: number; avg_results: number; opened: number }[];
  missing: { q: string; n: number; type: string; fallback: boolean; last_at: string }[];
  by_type: { type: string; n: number; missing: number }[];
}

const pct = (part: number, all: number) => (all ? `${Math.round((part / all) * 100)}%` : '–');
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Search insights: what travellers search for on the website, what found nothing (the places and
 * services to list next), how often a search leads to opening a result, and how much is spoken
 * (GET /api/admin/search-insights). Anonymous: counts of searches and visits, never people.
 */
export default function SearchInsightsTab() {
  const [days, setDays] = useState<number>(30);
  const [type, setType] = useState<string>('');
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // The latest request only: a slow answer for an older filter never replaces a newer one.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const at = ++latest.current;
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/admin/search-insights', { params: { days, type: type || undefined } });
      if (at === latest.current) setData(d);
    } catch (e: any) {
      if (at === latest.current) setError(e?.response?.data?.detail || 'Could not load the search insights');
    } finally {
      if (at === latest.current) setLoading(false);
    }
  }, [days, type]);
  useEffect(() => { load(); }, [load]);

  // Same filter pills as the Referrals tab.
  const pill = (on: boolean) => `px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-ink'}`;
  const t = data?.totals;

  return (
    <div data-testid="search-insights-tab">
      <p className="text-sm text-ink-soft mb-4">
        What travellers search for on the website, and what they could not find. Searches are anonymous and kept {data?.keep_days ?? 180} days, then deleted.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {DAYS.map((d) => (
          <button key={d} onClick={() => setDays(d)} aria-pressed={days === d} className={pill(days === d)} data-testid={`search-days-${d}`}>
            Last {d} days
          </button>
        ))}
        <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--line)] text-ink-soft hover:text-ink">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {TYPES.map((k) => (
          <button key={k || 'all'} onClick={() => setType(k)} aria-pressed={type === k} className={pill(type === k)} data-testid={`search-type-${k || 'all'}`}>
            {TYPE_LABEL[k]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-16 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={20} /></div>
      ) : error ? (
        <div className="p-10 text-center text-flag font-semibold">{error}</div>
      ) : !data || !t || t.searches === 0 ? (
        <div className="mist-panel p-10 text-center text-ink-soft">No searches in this period yet.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6" data-testid="search-totals">
            <StatCard label="Searches" value={t.searches} icon={Search} color="text-orange-500 bg-orange-50" />
            <StatCard label="Visits searching" value={t.sessions} icon={Users} color="text-blue-500 bg-blue-50" />
            <StatCard label="Found nothing" value={pct(t.missing, t.searches)} icon={AlertCircle} color="text-flag bg-flag/10" />
            <StatCard label="Opened a result" value={pct(t.opened, t.searches)} icon={MousePointerClick} color="text-pine bg-pine/10" />
            <StatCard label="Spoken" value={pct(t.voice, t.searches)} icon={Mic} color="text-emerald-600 bg-emerald-50" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="mist-panel overflow-hidden border border-[var(--line)]" data-testid="search-missing">
              <h3 className="font-display font-bold text-lg text-ink p-4 pb-1">Searched for, not found</h3>
              <p className="text-xs text-ink-soft px-4 pb-3">No listing matched. "Similar shown" means the kind was listed instead. These are the places and services to list next.</p>
              <Table
                empty="Every search found something."
                head={['Search', 'Times', 'Category', 'Last']}
                rows={data.missing.map((m) => [
                  <span className="font-bold">{m.q}{m.fallback && <span className="ml-2 text-[11px] font-normal text-ink-soft">similar shown</span>}</span>,
                  m.n, TYPE_LABEL[m.type] || m.type || 'Everything', <span className="text-xs text-ink-soft">{when(m.last_at)}</span>,
                ])}
              />
            </section>
            <section className="mist-panel overflow-hidden border border-[var(--line)]" data-testid="search-top">
              <h3 className="font-display font-bold text-lg text-ink p-4 pb-1">Top searches</h3>
              <p className="text-xs text-ink-soft px-4 pb-3">Local spellings count as one (Ghoom and Ghum).</p>
              <Table
                empty="No searches yet."
                head={['Search', 'Times', 'Results', 'Opened']}
                rows={data.top.map((s) => [<span className="font-bold">{s.q}</span>, s.n, s.avg_results, pct(s.opened, s.n)])}
              />
            </section>
          </div>

          {data.by_type.length > 1 && (
            <section className="mist-panel overflow-hidden border border-[var(--line)] mt-6" data-testid="search-by-type">
              <h3 className="font-display font-bold text-lg text-ink p-4 pb-3">By category</h3>
              <Table
                empty=""
                head={['Where', 'Searches', 'Found nothing']}
                rows={data.by_type.map((b) => [TYPE_LABEL[b.type] || b.type, b.n, `${b.missing} (${pct(b.missing, b.n)})`])}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <div className="p-6 text-center text-sm text-ink-soft">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
            {head.map((h) => <th key={h} className="p-4">{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-mist/40 transition-colors">
              {r.map((c, j) => <td key={j} className="p-4">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
