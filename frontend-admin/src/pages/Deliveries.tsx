import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, Package, Phone, RefreshCw, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';

/**
 * Home delivery requests (board: Restaurant / Cafe -> "Asking for home delivery"), for the team:
 * who asked, which place, the host's number, and where each one stands (GET /deliveries/admin).
 * Read only: the host answers each request from their dashboard.
 */
type Item = {
  id: string;
  listing_title: string;
  listing_type: string;
  items: { name: string; qty: number; price?: number }[];
  address: string;
  phone: string;
  note: string;
  status: string;
  host_note?: string | null;
  created_at: string;
  updated_at?: string | null;
  customer: { name: string; phone: string };
  business: { name: string; phone: string } | null;
};

const STATUSES = ['open', 'accepted', 'delivered', 'declined', 'cancelled'] as const;
const LABEL: Record<string, string> = {
  open: 'Waiting for the place', accepted: 'Accepted', delivered: 'Delivered', declined: 'Declined', cancelled: 'Cancelled by guest',
};
const TONE: Record<string, string> = {
  open: 'bg-gold/20 text-[#7a5d00]', accepted: 'bg-[#DDF0F1] text-[#0E4A4F]', delivered: 'bg-pine/10 text-pine',
  declined: 'bg-flag/10 text-flag', cancelled: 'bg-mist text-ink-soft',
};
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const wa = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '').replace(/^(\d{10})$/, '91$1')}`;

export default function Deliveries() {
  const [show, setShow] = useState<string>('open');
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/deliveries/admin', { params: show === 'all' ? {} : { status: show } });
      setItems(data.items || []);
      setCounts(data.counts || {});
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Could not load delivery requests');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { load(); }, [load]);

  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  const pill = (on: boolean) => `px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-ink'}`;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8" data-testid="deliveries-page">
      <div className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
          <ShieldCheck size={14} /> System Administrator
        </div>
        <h1 className="mt-1 font-display font-extrabold text-4xl text-ink leading-none">Home deliveries</h1>
        <p className="mt-2 text-sm text-ink-soft">Requests travellers send to cafes, shops and homestays that deliver. The host answers each one from their dashboard.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {[...STATUSES, 'all'].map((s) => (
          <button key={s} onClick={() => setShow(s)} aria-pressed={show === s} className={pill(show === s)} data-testid={`deliveries-filter-${s}`}>
            {s === 'all' ? `All (${total})` : `${LABEL[s]} (${counts[s] || 0})`}
          </button>
        ))}
        <button onClick={load} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--line)] text-ink-soft hover:text-ink">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="p-16 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={20} /></div>
      ) : error ? (
        <div className="p-10 text-center text-flag font-semibold">{error}</div>
      ) : items.length === 0 ? (
        <div className="mist-panel p-10 text-center text-ink-soft">Nothing here.</div>
      ) : (
        <div className="space-y-3">
          {items.map((d) => (
            <div key={d.id} data-testid={`delivery-${d.id}`} className="rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Package size={15} className="text-[#007C85]" />
                <span className="font-bold text-ink text-sm">{d.listing_title}</span>
                <span className="text-ink-soft capitalize">{d.listing_type}{d.business ? ` · ${d.business.name}` : ''} · {when(d.created_at)}</span>
                <span className={`ml-auto px-2.5 py-0.5 rounded-full font-bold ${TONE[d.status] || 'bg-mist'}`}>{LABEL[d.status] || d.status}</span>
              </div>
              <p className="mt-2 text-sm text-ink">{d.items.map((i) => `${i.qty} × ${i.name}`).join(', ')}</p>
              <p className="text-xs text-ink-soft">To: {d.address}</p>
              {d.note && <p className="text-xs text-ink-soft">Note: {d.note}</p>}
              {d.host_note && <p className="mt-1 text-xs text-ink">From the place: “{d.host_note}”</p>}
              <div className="mt-3 grid sm:grid-cols-2 gap-2 text-xs">
                <Party label="Guest" name={d.customer.name} phone={d.phone || d.customer.phone} />
                {d.business ? <Party label="Host" name={d.business.name} phone={d.business.phone} /> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Party({ label, name, phone }: { label: string; name: string; phone: string }) {
  return (
    <div className="rounded-xl bg-mist/60 px-3 py-2 flex flex-wrap items-center gap-2 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{label}</span>
      <span className="font-bold text-ink truncate min-w-0">{name}</span>
      {phone ? (
        <span className="ml-auto flex items-center gap-1.5">
          <a href={`tel:${phone}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-[var(--line)] font-bold text-ink hover:border-ink"><Phone size={11} /> {phone}</a>
          <a href={wa(phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${name}`} className="inline-flex items-center px-2 py-1 rounded-full bg-[#25D366] text-white"><MessageCircle size={11} /></a>
        </span>
      ) : null}
    </div>
  );
}
