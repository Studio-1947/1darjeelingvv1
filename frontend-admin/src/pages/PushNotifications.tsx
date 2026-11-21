import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle, Bell, CheckCircle2, ChevronRight, Loader2, Megaphone, RefreshCw, Send, ShieldCheck, Smartphone, Users,
} from 'lucide-react';
import api from '@/lib/api';

/**
 * PUSH NOTIFICATIONS — the team writes one message and sends it to everyone, travellers, hosts
 * (or one kind of business), or one person by phone (POST /admin/broadcasts).
 *
 * Every recipient gets it in their Activity list (app and website); those with the app and
 * notifications on also get it on their phone. The form shows how many people a choice reaches,
 * a preview of how it looks on a phone, and asks once more before sending to more than one person.
 */

type Audience = 'everyone' | 'travellers' | 'hosts' | 'person';

type Broadcast = {
  id: string;
  title: string;
  body: string;
  link: string | null;
  audience: Audience;
  business_type: string | null;
  phone: string | null;
  recipients: number;
  devices: number;
  pushed: number;
  push_failed: number;
  opened: number;
  status: 'sending' | 'sent';
  sent_by: string | null;
  created_at: string;
};

type Reach = { people: number; devices: number; with_app: number };

const TITLE_MAX = 65;
const BODY_MAX = 240;

const AUDIENCES: { id: Audience; label: string; hint: string }[] = [
  { id: 'everyone', label: 'Everyone', hint: 'All travellers and hosts' },
  { id: 'travellers', label: 'Travellers', hint: 'People who do not run a business' },
  { id: 'hosts', label: 'Hosts', hint: 'Everyone who runs a business' },
  { id: 'person', label: 'One person', hint: 'By phone number' },
];

const BUSINESS_TYPES: { id: string; label: string }[] = [
  { id: '', label: 'All hosts' },
  { id: 'homestay', label: 'Homestays' },
  { id: 'driver', label: 'Drivers' },
  { id: 'guide', label: 'Guides' },
  { id: 'cafe', label: 'Cafes' },
  { id: 'shop', label: 'Shops' },
];

/** The screens a message can open. The app (src/lib/notificationLink.ts) and website map each key. */
const LINKS: { id: string; label: string; who?: 'host' | 'traveller' }[] = [
  { id: '', label: 'Activity list only' },
  { id: 'home', label: 'Home' },
  { id: 'explore', label: 'Explore', who: 'traveller' },
  { id: 'feed', label: 'Host feed' },
  { id: 'trips', label: 'My trips', who: 'traveller' },
  { id: 'saved', label: 'Saved places', who: 'traveller' },
  { id: 'pass', label: 'Traveller pass', who: 'traveller' },
  { id: 'refer', label: 'Invite friends' },
  { id: 'profile', label: 'Profile' },
  { id: 'host_dashboard', label: 'Host dashboard', who: 'host' },
  { id: 'host_bookings', label: 'Host bookings', who: 'host' },
  { id: 'host_plan', label: 'Host plan and renewal', who: 'host' },
  { id: 'url', label: 'A web address…' },
];

/** Starting points, so every message has the same shape: what, why it matters, what to do. */
const TEMPLATES: { label: string; audience: Audience; title: string; body: string; link: string }[] = [
  {
    label: 'New on aangan', audience: 'everyone',
    title: '✨ New on aangan: ',
    body: 'You can now … Open the app to try it.',
    link: 'home',
  },
  {
    label: 'Event or festival', audience: 'travellers',
    title: '🎉 This weekend in Darjeeling',
    body: 'What is happening, where and when. Tap to see places to stay nearby.',
    link: 'explore',
  },
  {
    label: 'Host reminder', audience: 'hosts',
    title: 'Keep your listing up to date',
    body: 'Travellers book places with fresh photos and the right price. Take two minutes to check yours.',
    link: 'host_dashboard',
  },
  {
    label: 'Plan renewal', audience: 'hosts',
    title: 'Your aangan plan',
    body: 'Renew your plan to keep your listing visible to travellers.',
    link: 'host_plan',
  },
  {
    label: 'Service update', audience: 'everyone',
    title: 'A short note from aangan',
    body: 'What changed and what it means for you. Thank you for your patience.',
    link: '',
  },
];

const AUDIENCE_LABEL = (b: Pick<Broadcast, 'audience' | 'business_type' | 'phone'>) =>
  b.audience === 'person' ? `One person (${b.phone})`
    : b.audience === 'hosts' && b.business_type ? `${BUSINESS_TYPES.find((t) => t.id === b.business_type)?.label || b.business_type}`
      : AUDIENCES.find((a) => a.id === b.audience)?.label || b.audience;

const linkLabel = (link: string | null) => {
  if (!link) return 'Activity list';
  return LINKS.find((l) => l.id === link)?.label || link;
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const errorText = (e: any) => e?.response?.data?.detail || e?.message || 'Something went wrong';

const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : '–');

export default function PushNotifications() {
  const [audience, setAudience] = useState<Audience>('everyone');
  const [businessType, setBusinessType] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkChoice, setLinkChoice] = useState('');
  const [url, setUrl] = useState('https://aanganerp.in/');

  const [reach, setReach] = useState<Reach | null>(null);
  const [reachError, setReachError] = useState('');
  const [reachLoading, setReachLoading] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [done, setDone] = useState<Broadcast | null>(null);

  const [testPhone, setTestPhone] = useState('');
  const [testState, setTestState] = useState<{ busy?: boolean; ok?: string; error?: string }>({});

  const [history, setHistory] = useState<Broadcast[] | null>(null);
  const [historyError, setHistoryError] = useState('');

  const link = linkChoice === 'url' ? url.trim() : linkChoice;
  const who = useMemo(
    () => ({ audience, business_type: audience === 'hosts' ? businessType : '', phone: audience === 'person' ? phone.trim() : '' }),
    [audience, businessType, phone]
  );

  const loadHistory = useCallback(async () => {
    setHistoryError('');
    try {
      const { data } = await api.get('/admin/broadcasts');
      setHistory(data.items || []);
    } catch (e) {
      setHistoryError(errorText(e));
      setHistory([]);
    }
  }, []);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  // While a send is still pushing to phones, check back so its numbers fill in.
  useEffect(() => {
    if (!history?.some((b) => b.status === 'sending')) return;
    const t = setTimeout(loadHistory, 4000);
    return () => clearTimeout(t);
  }, [history, loadHistory]);

  // How many people this choice reaches, a moment after the admin stops typing.
  useEffect(() => {
    setConfirming(false);
    if (who.audience === 'person' && who.phone.replace(/\D/g, '').length < 8) {
      setReach(null); setReachError(''); return;
    }
    let live = true;
    setReachLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get('/admin/broadcasts/audience', { params: who });
        if (live) { setReach(data); setReachError(''); }
      } catch (e) {
        if (live) { setReach(null); setReachError(errorText(e)); }
      } finally {
        if (live) setReachLoading(false);
      }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [who]);

  const problems: string[] = [];
  if (!title.trim()) problems.push('Write a title');
  if (title.trim().length > TITLE_MAX) problems.push(`Title is over ${TITLE_MAX} characters`);
  if (!body.trim()) problems.push('Write the message');
  if (body.trim().length > BODY_MAX) problems.push(`Message is over ${BODY_MAX} characters`);
  if (linkChoice === 'url' && !/^https:\/\/[^\s]+\.[^\s]+/.test(url.trim())) problems.push('The web address must start with https://');
  if (audience === 'person' && !reach?.people) problems.push('Enter the phone number of someone with an account');
  if (audience !== 'person' && reach && !reach.people) problems.push('Nobody matches this choice');

  const linkMismatch = (() => {
    const l = LINKS.find((x) => x.id === linkChoice);
    if (!l?.who) return '';
    if (l.who === 'host' && audience === 'travellers') return 'This screen is for hosts; travellers will land on their home screen.';
    if (l.who === 'traveller' && audience === 'hosts') return 'This screen is for travellers; hosts in Business mode will see a notice there.';
    return '';
  })();

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setAudience(tpl.audience);
    setBusinessType('');
    setTitle(tpl.title);
    setBody(tpl.body);
    setLinkChoice(tpl.link);
    setDone(null);
  };

  const payload = () => ({ ...who, title: title.trim(), body: body.trim(), link: link || null });

  const send = async () => {
    setSending(true);
    setSendError('');
    try {
      const { data } = await api.post('/admin/broadcasts', payload());
      setDone(data.broadcast);
      setConfirming(false);
      setTitle(''); setBody(''); setLinkChoice('');
      loadHistory();
    } catch (e) {
      setSendError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  const sendTest = async () => {
    setTestState({ busy: true });
    try {
      await api.post('/admin/broadcasts', { ...payload(), audience: 'person', business_type: '', phone: testPhone.trim() });
      setTestState({ ok: `Test sent to ${testPhone.trim()}` });
      loadHistory();
    } catch (e) {
      setTestState({ error: errorText(e) });
    }
  };

  const contentOk = title.trim() && body.trim() && title.trim().length <= TITLE_MAX && body.trim().length <= BODY_MAX
    && !(linkChoice === 'url' && !/^https:\/\/[^\s]+\.[^\s]+/.test(url.trim()));

  const field = 'w-full rounded-xl border border-[var(--line)] bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-[#007C85] focus:ring-2 focus:ring-[#007C85]/15';
  const chip = (on: boolean) => `px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors cursor-pointer ${on ? 'bg-ink text-white border-ink' : 'bg-white text-ink border-[var(--line)] hover:border-ink'}`;

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8" data-testid="push-page">
      <div className="mb-6">
        <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
          <ShieldCheck size={14} /> System Administrator
        </div>
        <h1 className="mt-1 font-display font-extrabold text-4xl text-ink leading-none">Push notifications</h1>
        <p className="mt-2 text-sm text-ink-soft max-w-2xl">
          Send a message to travellers and hosts. Everyone you choose gets it in their Activity list on the app and the website;
          people who use the app with notifications on also get it on their phone.
        </p>
      </div>

      {done && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-pine/30 bg-pine/5 p-4" data-testid="push-sent">
          <CheckCircle2 size={20} className="text-pine flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-bold text-ink">Sent “{done.title}” to {done.recipients} {done.recipients === 1 ? 'person' : 'people'}.</div>
            <div className="text-ink-soft">Phone notifications are going out now. The numbers below fill in as they do.</div>
          </div>
          <button onClick={() => setDone(null)} className="ml-auto text-xs font-bold text-ink-soft hover:text-ink">Close</button>
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        {/* ---- The form ---- */}
        <div className="mist-panel p-5 md:p-6 space-y-7">
          <Section n={1} title="Start from a template" hint="Optional. Fills in the message for you to edit.">
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((tpl) => (
                <button key={tpl.label} type="button" onClick={() => applyTemplate(tpl)} className={chip(false)} data-testid={`push-template-${tpl.label}`}>
                  {tpl.label}
                </button>
              ))}
            </div>
          </Section>

          <Section n={2} title="Who gets it">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2" role="radiogroup" aria-label="Who gets it">
              {AUDIENCES.map((a) => (
                <button
                  key={a.id} type="button" role="radio" aria-checked={audience === a.id}
                  onClick={() => setAudience(a.id)} data-testid={`push-audience-${a.id}`}
                  className={`text-left rounded-xl border p-3 transition-colors cursor-pointer ${audience === a.id ? 'border-[#007C85] bg-[#007C85]/5 ring-2 ring-[#007C85]/15' : 'border-[var(--line)] bg-white hover:border-ink'}`}
                >
                  <div className="text-sm font-bold text-ink">{a.label}</div>
                  <div className="text-[11px] text-ink-soft leading-snug mt-0.5">{a.hint}</div>
                </button>
              ))}
            </div>
            {audience === 'hosts' && (
              <div className="mt-3 flex flex-wrap gap-2">
                {BUSINESS_TYPES.map((t) => (
                  <button key={t.id || 'all'} type="button" onClick={() => setBusinessType(t.id)} aria-pressed={businessType === t.id} className={chip(businessType === t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
            )}
            {audience === 'person' && (
              <input
                className={`${field} mt-3 max-w-xs`} inputMode="tel" placeholder="Phone number, e.g. +91 98765 43210"
                value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="push-phone"
              />
            )}
            <div className="mt-3 flex items-center gap-2 text-xs text-ink-soft min-h-[20px]" data-testid="push-reach">
              <Users size={14} className="text-[#007C85]" />
              {reachLoading ? <Loader2 size={13} className="animate-spin" />
                : reachError ? <span className="text-flag font-semibold">{reachError}</span>
                  : reach ? (
                    <span>
                      Reaches <b className="text-ink">{reach.people} {reach.people === 1 ? 'person' : 'people'}</b>
                      {' · '}{reach.with_app} with the app and notifications on ({reach.devices} {reach.devices === 1 ? 'phone' : 'phones'})
                    </span>
                  ) : audience === 'person' ? <span>Type a number to find the person</span> : null}
            </div>
          </Section>

          <Section n={3} title="The message" hint="Phones show about 40 characters of the title and two lines of the message before it is opened.">
            <label className="block">
              <span className="flex justify-between text-xs font-bold text-ink mb-1.5">
                Title <Counter n={title.trim().length} max={TITLE_MAX} />
              </span>
              <input className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={TITLE_MAX + 20}
                placeholder="e.g. 🎉 Tea festival this weekend" data-testid="push-title" />
            </label>
            <label className="block mt-4">
              <span className="flex justify-between text-xs font-bold text-ink mb-1.5">
                Message <Counter n={body.trim().length} max={BODY_MAX} />
              </span>
              <textarea className={`${field} min-h-[110px] resize-y`} value={body} onChange={(e) => setBody(e.target.value)} maxLength={BODY_MAX + 40}
                placeholder="What is it, why it matters, and what to do next." data-testid="push-body" />
            </label>
          </Section>

          <Section n={4} title="When they tap it, open">
            <select className={`${field} max-w-xs cursor-pointer`} value={linkChoice} onChange={(e) => setLinkChoice(e.target.value)} data-testid="push-link">
              {LINKS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            {linkChoice === 'url' && (
              <input className={`${field} mt-2`} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://aanganerp.in/events" data-testid="push-url" />
            )}
            {linkMismatch && <p className="mt-2 text-xs text-[#7a5d00] flex items-center gap-1.5"><AlertTriangle size={13} /> {linkMismatch}</p>}
          </Section>

          {/* ---- Test, then send ---- */}
          <div className="border-t border-[var(--line)] pt-5 space-y-4">
            <div>
              <div className="text-xs font-bold text-ink mb-1.5">Send a test to your own phone first</div>
              <div className="flex flex-wrap gap-2">
                <input className={`${field} max-w-[240px]`} inputMode="tel" placeholder="Your phone number" value={testPhone}
                  onChange={(e) => { setTestPhone(e.target.value); setTestState({}); }} data-testid="push-test-phone" />
                <button type="button" onClick={sendTest} disabled={!contentOk || testPhone.replace(/\D/g, '').length < 8 || testState.busy}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 rounded-xl border border-[var(--line)] bg-white text-xs font-bold text-ink hover:border-ink disabled:opacity-40 cursor-pointer"
                  data-testid="push-test-send">
                  {testState.busy ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />} Send test
                </button>
              </div>
              {testState.ok && <p className="mt-1.5 text-xs text-pine font-semibold">{testState.ok}</p>}
              {testState.error && <p className="mt-1.5 text-xs text-flag font-semibold">{testState.error}</p>}
            </div>

            {!confirming ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button" disabled={problems.length > 0 || reachLoading}
                  // One person or a crowd, a sent message cannot be taken back: always review first.
                  onClick={() => setConfirming(true)}
                  className="inline-flex items-center gap-2 min-h-[48px] px-6 rounded-xl bg-[#1F6656] text-white text-sm font-bold btn-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  data-testid="push-review"
                >
                  <>Review and send <ChevronRight size={16} /></>
                </button>
                {problems.length > 0 && <span className="text-xs text-ink-soft">{problems[0]}</span>}
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-[#1F6656] bg-[#1F6656]/5 p-4" data-testid="push-confirm">
                <div className="text-sm font-bold text-ink">
                  Send “{title.trim()}” to {reach?.people} {reach?.people === 1 ? 'person' : 'people'} ({AUDIENCE_LABEL({ ...who, business_type: who.business_type || null, phone: who.phone || null })})?
                </div>
                <p className="text-xs text-ink-soft mt-1">
                  {reach?.devices || 0} {reach?.devices === 1 ? 'phone' : 'phones'} will buzz. Tapping it opens: {linkChoice === 'url' ? link : linkLabel(linkChoice || null)}. A sent message cannot be taken back.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={send} disabled={sending}
                    className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#1F6656] text-white text-sm font-bold btn-hover disabled:opacity-50 cursor-pointer"
                    data-testid="push-send">
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send now
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={sending}
                    className="min-h-[44px] px-5 rounded-xl border border-[var(--line)] bg-white text-sm font-bold text-ink hover:border-ink cursor-pointer">
                    Go back
                  </button>
                </div>
              </div>
            )}
            {sendError && <p className="text-sm text-flag font-semibold" data-testid="push-error">{sendError}</p>}
          </div>
        </div>

        {/* ---- Preview ---- */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <Preview title={title.trim()} body={body.trim()} />
        </div>
      </div>

      {/* ---- History ---- */}
      <div className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="font-display font-extrabold text-2xl text-ink">Sent</h2>
          <button onClick={loadHistory} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--line)] text-ink-soft hover:text-ink">
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        {history === null ? (
          <div className="p-10 text-center text-ink-soft"><Loader2 className="inline animate-spin" size={20} /></div>
        ) : historyError ? (
          <div className="p-6 text-center text-flag font-semibold">{historyError}</div>
        ) : history.length === 0 ? (
          <div className="mist-panel p-10 text-center text-ink-soft">Nothing sent yet.</div>
        ) : (
          <div className="space-y-3" data-testid="push-history">
            {history.map((b) => (
              <div key={b.id} className="rounded-2xl border border-[var(--line)] bg-white p-4 md:p-5" data-testid={`push-item-${b.id}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Megaphone size={15} className="text-[#007C85]" />
                  <span className="font-bold text-ink text-sm">{b.title}</span>
                  <span className={`ml-auto px-2.5 py-0.5 rounded-full font-bold ${b.status === 'sending' ? 'bg-gold/20 text-[#7a5d00]' : 'bg-pine/10 text-pine'}`}>
                    {b.status === 'sending' ? 'Sending to phones…' : 'Sent'}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink-soft whitespace-pre-line">{b.body}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
                  <span><b className="text-ink">To:</b> {AUDIENCE_LABEL(b)}</span>
                  <span><b className="text-ink">Opens:</b> {linkLabel(b.link)}</span>
                  <span>{when(b.created_at)}{b.sent_by ? ` · ${b.sent_by}` : ''}</span>
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <Stat label="People" value={b.recipients} />
                  <Stat label="Phones reached" value={b.status === 'sending' ? '…' : `${b.pushed}${b.devices ? ` of ${b.devices}` : ''}`} warn={b.push_failed > 0 ? `${b.push_failed} failed` : ''} />
                  <Stat label="Opened" value={b.opened} />
                  <Stat label="Open rate" value={pct(b.opened, b.recipients)} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="w-6 h-6 rounded-full bg-[#007C85]/10 text-[#007C85] text-xs font-extrabold grid place-items-center flex-shrink-0">{n}</span>
        <div>
          <h3 className="text-sm font-extrabold text-ink">{title}</h3>
          {hint && <p className="text-[11px] text-ink-soft mt-0.5">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span className={`font-semibold tabular-nums ${n > max ? 'text-flag' : n > max * 0.85 ? 'text-[#7a5d00]' : 'text-ink-soft'}`}>{n}/{max}</span>;
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: string }) {
  return (
    <div className="rounded-xl bg-mist/60 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-soft">{label}</div>
      <div className="font-extrabold text-ink text-base tabular-nums">{value}</div>
      {warn && <div className="text-[10px] font-bold text-flag">{warn}</div>}
    </div>
  );
}

/** Roughly how Android shows it in the shade, and how the Activity list shows it. */
function Preview({ title, body }: { title: string; body: string }) {
  const t = title || 'Your title';
  const b = body || 'Your message shows here.';
  return (
    <>
      <div className="text-[11px] font-bold uppercase tracking-widest text-ink-soft">Preview</div>
      <div className="rounded-[28px] bg-gradient-to-b from-[#1d3b35] to-[#0f2420] p-4 pb-6 shadow-sm">
        <div className="flex justify-between text-[11px] text-white/80 px-1 mb-3 font-semibold"><span>9:41</span><span>Lock screen</span></div>
        <div className="rounded-2xl bg-white/95 p-3 shadow" data-testid="push-preview">
          <div className="flex items-center gap-1.5 text-[11px] text-ink-soft">
            <span className="w-4 h-4 rounded-[5px] bg-[#1F6656] grid place-items-center"><Bell size={9} className="text-white" /></span>
            <span className="font-semibold">aangan</span><span>· now</span>
          </div>
          <div className={`mt-1 text-[13px] font-bold leading-snug line-clamp-1 ${title ? 'text-ink' : 'text-ink-soft/60'}`}>{t}</div>
          <div className={`text-[12.5px] leading-snug line-clamp-2 ${body ? 'text-ink-soft' : 'text-ink-soft/60'}`}>{b}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-[var(--line)] bg-white p-3">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-soft mb-2">In their Activity list</div>
        <div className="flex gap-3 rounded-xl border border-l-4 border-[#1F6656]/40 border-l-[#1F6656] p-3">
          <span className="w-9 h-9 flex-shrink-0 rounded-full bg-mist grid place-items-center text-base">📣</span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink break-words">{t}</span>
            <span className="block text-[13px] text-ink-soft mt-0.5 whitespace-pre-line break-words">{b}</span>
            <span className="block text-[11px] text-ink-soft mt-1">just now</span>
          </span>
        </div>
      </div>
    </>
  );
}
