import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, BarChart3, Copy, Loader2, Pause, Play, RefreshCw, Store, Ticket, UserPlus, Users, X } from 'lucide-react';
import api from '@/lib/api';
import StatCard from '@/components/admin/StatCard';

/** The public app, for the links a code is shared with (same address PushNotifications uses). */
const PUBLIC_SITE = 'https://aanganerp.in';

type Audience = 'any' | 'traveller' | 'host';
type State = 'active' | 'paused' | 'ended' | 'full';
type Show = 'active' | 'paused' | 'all';
const TYPES = ['homestay', 'driver', 'guide', 'cafe', 'shop'] as const;
const TYPE_LABEL: Record<string, string> = { homestay: 'Homestay', driver: 'Driver', guide: 'Guide', cafe: 'Cafe', shop: 'Shop' };
const AUDIENCE_LABEL: Record<Audience, string> = { any: 'Everyone', traveller: 'Travellers', host: 'Hosts' };

interface Counts {
  uses: number;
  travellers: number;
  hosts: number;
  hosts_live: number;
  by_type: Record<string, number>;
  last_used_at: string | null;
}
interface Campaign extends Counts {
  id: string;
  code: string;
  name: string;
  audience: Audience;
  reward_days: number;
  ends_at: string | null;
  max_uses: number | null;
  active: boolean;
  created_at: string;
  state: State;
}
interface Signup {
  user: { id: string; name: string; phone: string };
  joined_as: 'traveller' | 'host';
  type: 'traveller' | 'host';
  business_name: string | null;
  business_type: string | null;
  live: boolean;
  created_at: string;
}
interface Report {
  items: Campaign[];
  totals: Counts & { codes: number; active: number };
  friends: { total: number; top: { id: string; name: string; phone: string; code: string | null; count: number }[] };
}

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const blankForm = { code: '', name: '', audience: 'any' as Audience, reward_days: '0', ends_at: '', max_uses: '' };

/**
 * Referrals: codes the aangan team makes ("amitAangan26" for Amit, one per poster or partner) and
 * the full report of who signed up with each (GET/POST/PATCH /api/admin/referrals). Every account
 * counts once: as a traveller, or as a host with its business type and whether it is live. The
 * friend-referral summary below covers the codes members share themselves.
 */
export default function ReferralsTab() {
  const [show, setShow] = useState<Show>('active');
  const [data, setData] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState(blankForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<{ item: Campaign; signups: Signup[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: d } = await api.get('/admin/referrals');
      setData(d);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Could not load the referral codes');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (patch: Partial<typeof blankForm>) => setForm((f) => ({ ...f, ...patch }));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    setMsg('');
    try {
      const { data: d } = await api.post('/admin/referrals', {
        code: form.code.trim() || undefined,
        name: form.name,
        audience: form.audience,
        reward_days: Number(form.reward_days) || 0,
        ends_at: form.ends_at || null,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
      });
      setMsg(`${d.item.code} is ready. Share the code, or one of its links below.`);
      setForm(blankForm);
      await load();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || 'That code could not be made');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c: Campaign) => {
    if (c.active && !window.confirm(`Pause ${c.code}? People who sign up with it after this are not counted until you resume it.`)) return;
    setBusy(c.id);
    setMsg('');
    try {
      await api.patch(`/admin/referrals/${c.id}`, { active: !c.active });
      setMsg(c.active ? `${c.code} is paused.` : `${c.code} is counting sign-ups again.`);
      await load();
      if (open?.item.id === c.id) await report(c);
    } catch (e: any) {
      window.alert(e?.response?.data?.detail || 'That did not go through');
    } finally {
      setBusy(null);
    }
  };

  const report = async (c: Campaign) => {
    setBusy(c.id);
    try {
      const { data: d } = await api.get(`/admin/referrals/${c.id}`);
      setOpen({ item: d.item, signups: d.signups || [] });
    } catch (e: any) {
      window.alert(e?.response?.data?.detail || 'Could not load that report');
    } finally {
      setBusy(null);
    }
  };

  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); setMsg(`${what} copied.`); } catch { setMsg(`Copy this ${what.toLowerCase()}: ${text}`); }
  };
  const hostLink = (code: string) => `${PUBLIC_SITE}/provider/onboard?ref=${encodeURIComponent(code)}`;
  const joinLink = (code: string) => `${PUBLIC_SITE}/login?ref=${encodeURIComponent(code)}`;

  const pill = (on: boolean) => `px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-ink'}`;
  const action = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border disabled:opacity-50';
  const badge = (s: State) => (s === 'active' ? 'bg-pine/10 text-pine' : s === 'paused' ? 'bg-ink/10 text-ink-soft' : 'bg-flag/10 text-flag');
  const input = 'mt-1 w-full rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-normal text-ink';
  const shown = (data?.items || []).filter((c) => show === 'all' || (show === 'active' ? c.state === 'active' : c.state !== 'active'));
  const byType = (counts: Record<string, number>) => TYPES.filter((t) => counts[t]).map((t) => `${TYPE_LABEL[t]} ${counts[t]}`).join(' · ');

  return (
    <div data-testid="referrals-tab">
      <p className="text-sm text-ink-soft mb-4">
        Make a code for each person or poster that brings people in, like amitAangan26, and see who signed up with it: travellers, and hosts by type and whether they went live.
      </p>

      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6" data-testid="referrals-totals">
          <StatCard label="Codes" value={data.totals.codes} icon={Ticket} color="text-orange-500 bg-orange-50" />
          <StatCard label="Sign-ups" value={data.totals.uses} icon={UserPlus} color="text-pine bg-pine/10" />
          <StatCard label="Travellers" value={data.totals.travellers} icon={Users} color="text-blue-500 bg-blue-50" />
          <StatCard label="Hosts" value={data.totals.hosts} icon={Store} color="text-flag bg-flag/10" />
          <StatCard label="Hosts live" value={data.totals.hosts_live} icon={BadgeCheck} color="text-emerald-600 bg-emerald-50" />
        </div>
      )}

      <form onSubmit={create} className="rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5 mb-6" data-testid="referrals-form">
        <h3 className="font-display font-bold text-lg text-ink mb-4">Make a referral code</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="text-xs font-bold text-ink-soft">
            Code
            <input className={input} value={form.code} maxLength={20} onChange={(e) => set({ code: e.target.value })}
              placeholder="amitAangan26" autoCapitalize="none" autoComplete="off" data-testid="referrals-code" />
            <span className="mt-1 block text-[11px] font-normal">4 to 20 letters, numbers or dashes. Leave empty to get one made up.</span>
          </label>
          <label className="text-xs font-bold text-ink-soft">
            Who or what it is for
            <input className={input} value={form.name} maxLength={80} required onChange={(e) => set({ name: e.target.value })}
              placeholder="Amit, field team Mirik" data-testid="referrals-name" />
          </label>
          <label className="text-xs font-bold text-ink-soft">
            Counts sign-ups from
            <select className={input} value={form.audience} onChange={(e) => set({ audience: e.target.value as Audience })} data-testid="referrals-audience">
              <option value="any">Everyone</option>
              <option value="traveller">Travellers only</option>
              <option value="host">Hosts only</option>
            </select>
          </label>
          <label className="text-xs font-bold text-ink-soft">
            Extra pass days for a traveller
            <input className={input} type="number" min={0} max={365} value={form.reward_days} onChange={(e) => set({ reward_days: e.target.value })} data-testid="referrals-reward" />
            <span className="mt-1 block text-[11px] font-normal">0 only counts sign-ups.</span>
          </label>
          <label className="text-xs font-bold text-ink-soft">
            Stops counting after (optional)
            <input className={input} type="date" value={form.ends_at} onChange={(e) => set({ ends_at: e.target.value })} data-testid="referrals-ends" />
          </label>
          <label className="text-xs font-bold text-ink-soft">
            Most sign-ups (optional)
            <input className={input} type="number" min={1} value={form.max_uses} onChange={(e) => set({ max_uses: e.target.value })} placeholder="No limit" data-testid="referrals-max" />
          </label>
        </div>
        {formError && (
          <div className="mt-3 p-3 rounded-xl bg-flag/10 border border-flag/20 text-sm text-flag font-semibold" data-testid="referrals-form-error">{formError}</div>
        )}
        <button type="submit" disabled={saving || form.name.trim().length < 2} data-testid="referrals-create"
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-flag text-white text-xs font-bold btn-hover disabled:opacity-50">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Ticket size={12} />} Make the code
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(['active', 'paused', 'all'] as const).map((s) => (
          <button key={s} onClick={() => setShow(s)} aria-pressed={show === s} className={pill(show === s)} data-testid={`referrals-filter-${s}`}>
            {s === 'active' ? `Counting (${data?.totals.active ?? 0})` : s === 'paused' ? 'Paused or ended' : 'All'}
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
      ) : shown.length === 0 ? (
        <div className="mist-panel p-10 text-center text-ink-soft">No codes here yet.</div>
      ) : (
        <div className="mist-panel overflow-hidden border border-[var(--line)]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
                  <th className="p-4">Code</th>
                  <th className="p-4">Sign-ups</th>
                  <th className="p-4">Travellers</th>
                  <th className="p-4">Hosts</th>
                  <th className="p-4">Hosts live</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
                {shown.map((c) => (
                  <tr key={c.id} className="hover:bg-mist/40 transition-colors" data-testid={`referral-${c.code}`}>
                    <td className="p-4">
                      <div className="font-bold font-mono select-all">{c.code}</div>
                      <div className="text-xs text-ink-soft">{c.name}</div>
                      <div className="text-[11px] text-ink-soft">
                        {AUDIENCE_LABEL[c.audience]}{c.reward_days ? ` · +${c.reward_days} pass days` : ''}{c.max_uses ? ` · up to ${c.max_uses}` : ''}{c.ends_at ? ` · until ${day(c.ends_at)}` : ''}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="font-bold">{c.uses}</div>
                      {c.last_used_at && <div className="text-[11px] text-ink-soft">last {when(c.last_used_at)}</div>}
                    </td>
                    <td className="p-4 font-bold">{c.travellers}</td>
                    <td className="p-4">
                      <div className="font-bold">{c.hosts}</div>
                      {c.hosts > 0 && <div className="text-[11px] text-ink-soft">{byType(c.by_type)}</div>}
                    </td>
                    <td className="p-4 font-bold">{c.hosts_live}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${badge(c.state)}`}>{c.state}</span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => report(c)} disabled={busy !== null} data-testid={`referral-report-${c.code}`}
                          className={`${action} border-[var(--line)] text-ink hover:border-ink`}>
                          {busy === c.id ? <Loader2 size={12} className="animate-spin" /> : <BarChart3 size={12} />} Report
                        </button>
                        <button onClick={() => toggle(c)} disabled={busy !== null} data-testid={`referral-toggle-${c.code}`}
                          className={`${action} ${c.active ? 'border-flag/40 text-flag hover:bg-flag/10' : 'border-pine/40 text-pine hover:bg-pine/10'}`}>
                          {c.active ? <Pause size={12} /> : <Play size={12} />} {c.active ? 'Pause' : 'Resume'}
                        </button>
                        <button onClick={() => copy(c.audience === 'traveller' ? joinLink(c.code) : hostLink(c.code), 'Link')}
                          className={`${action} border-[var(--line)] text-ink-soft hover:text-ink`} title={c.audience === 'traveller' ? joinLink(c.code) : hostLink(c.code)}>
                          <Copy size={12} /> {c.audience === 'traveller' ? 'Sign-up link' : 'Host link'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {open && (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5" data-testid="referral-report">
          <div className="flex flex-wrap items-start gap-2 mb-4">
            <div>
              <h3 className="font-display font-bold text-lg text-ink">{open.item.code}</h3>
              <p className="text-xs text-ink-soft">{open.item.name} · made {day(open.item.created_at)}</p>
            </div>
            <button onClick={() => setOpen(null)} className={`${action} ml-auto border-[var(--line)] text-ink-soft hover:text-ink`} aria-label="Close the report">
              <X size={12} /> Close
            </button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            <span className="px-2.5 py-0.5 rounded-full font-bold bg-mist text-ink">{open.item.uses} sign-ups</span>
            <span className="px-2.5 py-0.5 rounded-full font-bold bg-ink/10 text-ink">{open.item.travellers} travellers</span>
            <span className="px-2.5 py-0.5 rounded-full font-bold bg-flag/10 text-flag">{open.item.hosts} hosts</span>
            <span className="px-2.5 py-0.5 rounded-full font-bold bg-pine/10 text-pine">{open.item.hosts_live} hosts live</span>
            {TYPES.map((t) => (
              <span key={t} className="px-2.5 py-0.5 rounded-full font-bold border border-[var(--line)] text-ink-soft">{TYPE_LABEL[t]} {open.item.by_type[t] || 0}</span>
            ))}
          </div>
          {open.signups.length === 0 ? (
            <div className="mist-panel p-10 text-center text-ink-soft">Nobody has signed up with this code yet.</div>
          ) : (
            <div className="mist-panel overflow-hidden border border-[var(--line)]">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
                      <th className="p-4">Person</th>
                      <th className="p-4">Signed up as</th>
                      <th className="p-4">Now</th>
                      <th className="p-4">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
                    {open.signups.map((s) => (
                      <tr key={s.user.id} className="hover:bg-mist/40 transition-colors">
                        <td className="p-4">
                          <div className="font-bold">{s.user.name}</div>
                          <div className="text-xs text-ink-soft font-mono">{s.user.phone}</div>
                        </td>
                        <td className="p-4 text-xs">{s.joined_as === 'host' ? 'Host' : 'Traveller'}</td>
                        <td className="p-4">
                          {s.type === 'host' ? (
                            <>
                              <div className="font-bold">{s.business_name}</div>
                              <div className="text-xs text-ink-soft">
                                {TYPE_LABEL[s.business_type || ''] || s.business_type}
                                {' · '}
                                <span className={s.live ? 'text-pine font-bold' : ''}>{s.live ? 'live' : 'not live yet'}</span>
                              </div>
                            </>
                          ) : <span className="text-xs text-ink-soft">Traveller</span>}
                        </td>
                        <td className="p-4 text-xs text-ink-soft">{when(s.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {data && (
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5" data-testid="referrals-friends">
          <h3 className="font-display font-bold text-lg text-ink">Friend referrals</h3>
          <p className="text-xs text-ink-soft mb-4">Members' own codes (ANG26-…): {data.friends.total} sign-up{data.friends.total === 1 ? '' : 's'} so far.</p>
          {data.friends.top.length === 0 ? (
            <div className="mist-panel p-10 text-center text-ink-soft">No friend referrals yet.</div>
          ) : (
            <div className="mist-panel overflow-hidden border border-[var(--line)]">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-mist text-ink-soft text-xs uppercase font-bold tracking-wider border-b border-[var(--line)]">
                      <th className="p-4">Member</th>
                      <th className="p-4">Code</th>
                      <th className="p-4">Brought in</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)] text-sm text-ink">
                    {data.friends.top.map((f) => (
                      <tr key={f.id} className="hover:bg-mist/40 transition-colors">
                        <td className="p-4">
                          <div className="font-bold">{f.name}</div>
                          <div className="text-xs text-ink-soft font-mono">{f.phone}</div>
                        </td>
                        <td className="p-4 font-mono text-xs">{f.code}</td>
                        <td className="p-4 font-bold">{f.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
