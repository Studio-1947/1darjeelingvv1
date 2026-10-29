import { useCallback, useEffect, useState } from 'react';
import { Loader2, Megaphone, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import api from '@/lib/api';

/**
 * PROMOTIONS — the "Trending" cards on the home screen of the website and the app.
 *
 * Only active cards are shown to travellers; with none active the strip disappears. Every claim on
 * a card (a discount, "best seller") is shown as written, so it should be something true today.
 */

type Promotion = {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  image: string;
  link: string;
  sort_order: number;
  active: boolean;
};

type Draft = Omit<Promotion, 'id'> & { id?: string };

const EMPTY: Draft = { tag: '', title: '', subtitle: '', image: '', link: '/category/homestay', sort_order: 0, active: false };

const LINKS = [
  { value: '/category/homestay', label: 'Homestays' },
  { value: '/category/driver', label: 'Drivers' },
  { value: '/category/spot', label: 'Spots' },
  { value: '/category/cafe', label: 'Cafés' },
  { value: '/category/shop', label: 'Shops' },
  { value: '/category/event', label: 'Events' },
  { value: '/feed', label: 'Host feed' },
];

const errorText = (e: any) => e?.response?.data?.detail || e?.message || 'Something went wrong';

export default function Promotions() {
  const [items, setItems] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/promotions/all');
      setItems(data.items || []);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (p: Promotion) => {
    setBusy(p.id);
    try {
      await api.patch(`/promotions/${p.id}`, { active: !p.active });
      await load();
    } catch (e) {
      window.alert(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: Promotion) => {
    if (!window.confirm(`Delete "${p.title}"? Switching it off keeps it for later instead.`)) return;
    setBusy(p.id);
    try {
      await api.delete(`/promotions/${p.id}`);
      await load();
    } catch (e) {
      window.alert(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setFormError('');
    setBusy('form');
    const body = {
      tag: draft.tag.trim(),
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      image: draft.image.trim(),
      link: draft.link,
      sort_order: Number(draft.sort_order) || 0,
      active: draft.active,
    };
    try {
      if (draft.id) await api.patch(`/promotions/${draft.id}`, body);
      else await api.post('/promotions', body);
      setDraft(null);
      await load();
    } catch (e) {
      setFormError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const field = 'mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-white outline-none text-ink text-sm focus:ring-2 focus:ring-pine/20';
  const btn = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors disabled:opacity-50';

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8" data-testid="promotions-page">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
            <ShieldCheck size={14} /> System Administrator
          </div>
          <h1 className="mt-1 font-display font-extrabold text-4xl text-ink leading-none">Promotions</h1>
          <p className="mt-2 text-sm text-ink-soft max-w-2xl">
            The "Trending" cards on the home screen of the website and the app. Only cards switched on are shown, and
            with none on the strip is hidden. Keep every claim true: a "25% OFF" tag must be a real offer.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className={`${btn} border-[var(--line)] text-ink-soft hover:text-ink`}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={() => { setDraft({ ...EMPTY }); setFormError(''); }} className={`${btn} border-pine bg-pine text-white`}>
            <Plus size={12} /> New card
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={20} /></div>
      ) : error ? (
        <div className="p-10 text-center text-flag font-semibold">{error}</div>
      ) : items.length === 0 ? (
        <div className="mist-panel p-10 text-center text-ink-soft">No promotion cards. The Trending strip is hidden.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <div key={p.id} data-testid={`promo-${p.id}`}
              className={`rounded-2xl border bg-white overflow-hidden ${p.active ? 'border-pine/40' : 'border-[var(--line)] opacity-80'}`}>
              <div className="relative h-28 bg-mist">
                {p.image && <img src={p.image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
                <span className="absolute top-3 left-3 px-2 py-0.5 rounded-full bg-white/25 backdrop-blur text-[10px] font-extrabold tracking-wider text-white">{p.tag}</span>
                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <div className="font-display font-extrabold text-lg leading-tight">{p.title}</div>
                  <div className="text-xs text-white/90">{p.subtitle}</div>
                </div>
              </div>
              <div className="p-3 flex flex-wrap items-center gap-2">
                <button onClick={() => toggle(p)} disabled={busy !== null} role="switch" aria-checked={p.active}
                  className={`${btn} ${p.active ? 'border-pine bg-pine/10 text-pine' : 'border-[var(--line)] text-ink-soft'}`}>
                  {busy === p.id ? <Loader2 size={12} className="animate-spin" /> : null}
                  {p.active ? 'Shown' : 'Hidden'}
                </button>
                <span className="text-[11px] text-ink-soft">Order {p.sort_order} · {p.link}</span>
                <div className="ml-auto flex gap-1">
                  <button onClick={() => { setDraft({ ...p }); setFormError(''); }} aria-label={`Edit ${p.title}`}
                    className="w-8 h-8 rounded-full grid place-items-center text-ink-soft hover:bg-mist"><Pencil size={14} /></button>
                  <button onClick={() => remove(p)} disabled={busy !== null} aria-label={`Delete ${p.title}`}
                    className="w-8 h-8 rounded-full grid place-items-center text-flag hover:bg-flag/10"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="mist-panel w-full max-w-lg p-6 shadow-2xl bg-white">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-extrabold text-2xl text-ink flex items-center gap-2">
                <Megaphone size={18} /> {draft.id ? 'Edit card' : 'New card'}
              </h2>
              <button onClick={() => setDraft(null)} aria-label="Close" className="w-9 h-9 rounded-full grid place-items-center hover:bg-mist"><X size={16} /></button>
            </div>
            <div className="mt-4 grid gap-3">
              <label className="text-xs font-semibold text-ink-soft">Tag (short, e.g. NEW)
                <input className={field} value={draft.tag} maxLength={120} onChange={(e) => setDraft({ ...draft, tag: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-ink-soft">Title
                <input className={field} value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-ink-soft">Subtitle
                <input className={field} value={draft.subtitle} maxLength={120} onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })} />
              </label>
              <label className="text-xs font-semibold text-ink-soft">Image URL (https)
                <input className={field} value={draft.image} placeholder="https://…" onChange={(e) => setDraft({ ...draft, image: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-semibold text-ink-soft">Opens
                  <select className={field} value={draft.link} onChange={(e) => setDraft({ ...draft, link: e.target.value })}>
                    {LINKS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                    {!LINKS.some((l) => l.value === draft.link) && <option value={draft.link}>{draft.link}</option>}
                  </select>
                </label>
                <label className="text-xs font-semibold text-ink-soft">Order (lower first)
                  <input type="number" className={field} value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Show on the home screen
              </label>
            </div>
            {formError && <p className="mt-3 text-sm text-flag font-semibold">{formError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setDraft(null)} className="px-5 py-2.5 rounded-full border border-[var(--line)] text-ink font-bold">Cancel</button>
              <button onClick={save} disabled={busy === 'form'}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-pine text-white font-bold disabled:opacity-50">
                {busy === 'form' && <Loader2 size={14} className="animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
