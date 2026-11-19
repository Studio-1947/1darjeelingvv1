import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import api from '@/lib/api';
import { uploadImage, SUPPORTED_IMAGE_ACCEPT } from '@/lib/uploadImage';
import { HUBS } from '@/components/provider/onboard/wizard/useHostWizard';
import { Box, Button, ButtonLink, FieldError, IconButton, StepBar, TextArea, TextField } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import PlanCard from '@/components/feed/PlanCard';
import '@/styles/screens/plans.css';
import {
  apiError, createPlan, dayDate, fitDays, planCosts, stopsOf, type CostKey, type PlanDay, type PlanDraftCosts, MAX_NIGHTS, MAX_SEATS, MAX_STOPS, MAX_TITLE_LEN, rupees, type PlanListing, type TripPlan,
} from '@/lib/plans';

type Draft = PlanDraftCosts & { title: string; cover: string; date: string; days: PlanDay[]; notes: string };

const STEPS = 4;
const fresh = (): Draft => ({
  title: '', cover: '', date: '', nights: 2, days: [], seats: 4, stay: null, driver: null, adj: {}, extra: [], notes: '',
});

/**
 * A signed-out visitor fills the whole planner (the prototype opens it to anyone) and is asked to
 * log in only at Post. What they typed waits here for the trip to /login?next=/plan and back.
 */
const DRAFT_KEY = 'aangan-plan-draft';
function readDraft(): { d: Draft; i: number } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || !v.d || typeof v.d.title !== 'string') return null;
    return { d: { ...fresh(), ...v.d }, i: Math.min(STEPS - 1, Math.max(0, Number(v.i) || 0)) };
  } catch { return null; }
}
function keepDraft(d: Draft, i: number) {
  try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ d, i })); } catch { /* private mode: they type it again */ }
}

type Opt = { label: string; sub: string };

/** Where are you this day: the hill towns, then spots on aangan, then the map search for villages. */
function PlacePicker({ onPick }: { onPick: (place: string) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [spots, setSpots] = useState<Opt[]>([]);
  const [found, setFound] = useState<Opt[]>([]);
  const [looking, setLooking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  useEffect(() => {
    const s = q.trim();
    setLooking(true);
    const id = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/listings', { params: { type: 'spot', q: s || undefined, limit: 30 } });
        setSpots((data.items || []).map((x: { title: string; location: string }) => ({ label: x.title, sub: x.location })));
      } catch { setSpots([]); }
      if (s.length >= 3) {
        try {
          const { data } = await api.get('/geocode/search', { params: { q: s } });
          setFound((data.results || []).slice(0, 6).map((r: { display_name: string }) => {
            const parts = String(r.display_name).split(',').map((x) => x.trim());
            return { label: parts[0], sub: parts.slice(1, 3).join(', ') };
          }));
        } catch { setFound([]); }
      } else setFound([]);
      setLooking(false);
    }, 300);
    return () => window.clearTimeout(id);
  }, [q]);

  const needle = q.trim().toLowerCase();
  const towns: Opt[] = HUBS.map((h) => ({ label: h.name, sub: t('plans.town', 'Town') }))
    .filter((o) => !needle || o.label.toLowerCase().includes(needle));
  const seen = new Set<string>();
  const all = [...towns, ...spots, ...found].filter((o) => {
    const k = o.label.toLowerCase();
    if (!o.label || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const typed = q.trim();

  return (
    <div className="ag-plan-pick">
      <label className="ag-plan-search">
        <Icon name="search" />
        <input ref={input} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
          placeholder={t('plans.search_loc', 'Search a town, village or spot…')} aria-label={t('plans.search_loc', 'Search a town, village or spot…')}
          data-testid="plan-place-q" />
        {looking && <Loader2 className="animate-spin" size={16} />}
      </label>
      <p className="ag-small m-0">{all.length} {t('plans.places_n', 'places')}</p>
      <div className="ag-plan-list" data-testid="plan-place-list">
        {typed && !all.some((o) => o.label.toLowerCase() === typed.toLowerCase()) && (
          <button type="button" className="ag-plan-opt" onClick={() => onPick(typed)} data-testid="plan-place-typed">
            <Icon name="plus" /><span className="grow"><b>{typed}</b><br /><span className="ag-small">{t('plans.use_typed', 'Use this name')}</span></span>
          </button>
        )}
        {all.map((o) => (
          <button key={o.label + o.sub} type="button" className="ag-plan-opt" onClick={() => onPick(o.label)}>
            <Icon name="pin" /><span className="grow"><b>{o.label}</b><br /><span className="ag-small">{o.sub}</span></span><Icon name="arrowne" />
          </button>
        ))}
        {!all.length && !typed && <p className="ag-small m-0">{t('plans.no_match', 'No match. Try another name or place.')}</p>}
      </div>
    </div>
  );
}

/** A homestay or driver on aangan, places on the route first. */
function ListingPicker({ type, near, onPick }: { type: 'homestay' | 'driver'; near: string[]; onPick: (l: PlanListing) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<PlanListing[] | null>(null);
  useEffect(() => {
    const id = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/listings', { params: { type, q: q.trim() || undefined, limit: 60 } });
        setItems(data.items || []);
      } catch { setItems([]); }
    }, 300);
    return () => window.clearTimeout(id);
  }, [q, type]);
  const onRoute = (l: PlanListing) => near.some((p) => (l.location || '').toLowerCase().includes(p.toLowerCase()));
  const sorted = (items || []).slice().sort((a, b) => Number(onRoute(b)) - Number(onRoute(a)) || a.title.localeCompare(b.title));
  const label = type === 'homestay' ? t('plans.add_stay', 'Stay') : t('plans.add_drive', 'Drive');
  return (
    <div className="ag-plan-pick">
      <label className="ag-plan-search">
        <Icon name="search" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" autoFocus
          placeholder={`${t('plans.search', 'Search')} ${label.toLowerCase()}…`} aria-label={`${t('plans.search', 'Search')} ${label.toLowerCase()}`}
          data-testid={`plan-${type}-q`} />
      </label>
      {items === null ? <Loader2 className="animate-spin" /> : (
        <>
          <p className="ag-small m-0">{sorted.length ? `${sorted.length} ${t('plans.found', 'found, on your route first')}` : t('plans.no_match', 'No match. Try another name or place.')}</p>
          <div className="ag-plan-list" data-testid={`plan-${type}-list`}>
            {sorted.map((l) => (
              <button key={l.id} type="button" className="ag-plan-opt" onClick={() => onPick(l)}>
                <Icon name={type === 'homestay' ? 'home' : 'car'} />
                <span className="grow"><b>{l.title}</b><br /><span className="ag-small">{l.location}{l.price ? ` · ${rupees(l.price)}` : ''}</span></span>
                <Icon name="arrowne" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The planner (prototype plans.js V.plantrip): name and dates → the day-wise route with where you
 * stay and who drives → how many people and the cost per person → check and post. The plan goes
 * to the Feed, where others ask to join.
 */
export default function PlanTrip() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navTo = useNavigate();
  useSeo({ title: t('plans.plan_trip', 'Plan a trip') });
  // A draft kept on the way to log in comes back where they left it (read here, cleared after mount).
  const [i, setI] = useState(() => readDraft()?.i ?? 0);
  const [d, setD] = useState<Draft>(() => readDraft()?.d ?? fresh());
  useEffect(() => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* nothing kept */ } }, []);
  const [err, setErr] = useState('');
  const [pick, setPick] = useState<{ day: number } | 'homestay' | 'driver' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState<TripPlan | null>(null);
  const top = useRef<HTMLHeadingElement>(null);

  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const days = useMemo(() => fitDays(d.days, d.nights), [d.days, d.nights]);
  const stops = stopsOf(days);
  const c = planCosts(d);
  const lang = i18n.language === 'en' ? 'en-IN' : i18n.language;

  useEffect(() => { top.current?.focus(); window.scrollTo({ top: 0 }); }, [i, posted]);

  // Signed out, the plan is kept and they log in; back on /plan it opens at this step to post.
  const toLogin = () => { keepDraft({ ...d, days }, i); navTo(`/login?next=${encodeURIComponent('/plan')}`); };
  // Shown as the organiser in the preview until they log in.
  const me = user
    ? { id: user.id, name: user.name || t('plans.traveller', 'Traveller'), avatar: user.avatar ?? null }
    : { id: 'you', name: t('plans.traveller', 'Traveller'), avatar: null };

  const setDay = (j: number, p: Partial<PlanDay>) => set({ days: days.map((x, k) => (k === j ? { ...x, ...p } : x)) });
  const go = (n: number) => { setErr(''); setPick(null); setI(n); };

  const next = () => {
    if (i === 0) {
      if (!d.title.trim()) return setErr(t('plans.short', 'Give the trip a name and pick at least 2 places.'));
      set({ days });
    }
    if (i === 1) {
      if (stops.length < 2) return setErr(t('plans.short', 'Give the trip a name and pick at least 2 places.'));
      if (stops.length > MAX_STOPS) return setErr(t('plans.too_many', 'A route can have at most 12 places.'));
    }
    go(i + 1);
  };

  const addCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUploading(true);
    setErr('');
    try { set({ cover: await uploadImage(f) }); } catch (x: any) {
      setErr(typeof x === 'string' ? x : x?.message || t('plans.upload_failed', 'Could not upload the photo.'));
    } finally { setUploading(false); }
  };

  const post = async () => {
    if (!user) { toLogin(); return; }
    setPosting(true);
    setErr('');
    try {
      const extras = d.extra.filter((x) => x.name.trim() && Number(x.amt) > 0).map((x) => `${x.name.trim()}: ${rupees(Number(x.amt))}`);
      const notes = [d.notes.trim(), extras.length ? `${t('plans.extra_costs', 'Other costs')}: ${extras.join(', ')}` : ''].filter(Boolean).join('\n');
      const plan = await createPlan({
        title: d.title.trim(),
        cover: d.cover || null,
        start_date: d.date || null,
        nights: d.nights,
        seats: d.seats,
        stops: stops.map((place) => ({ place })),
        days: days.map((x, k) => ({ day: k + 1, text: x.text.trim() })).filter((x) => x.text),
        stay_listing_id: d.stay?.id ?? null,
        driver_listing_id: d.driver?.id ?? null,
        cost_per_person: c.total,
        notes,
      });
      setPosted(plan);
    } catch (e) {
      setErr(apiError(e, t('plans.post_failed', 'Could not post the plan. Try again.')));
    } finally {
      setPosting(false);
    }
  };

  if (posted) {
    return (
      <div className="ag-wrap">
        <section className="ag-main" data-testid="plan-done">
          <div className="ag-done">
            <span className="big"><Icon name="check" /></span>
            <div className="ag-q"><h1 ref={top} tabIndex={-1}>{t('plans.done', 'Your plan is in the Feed')}</h1></div>
            <p className="ag-small m-0">{t('plans.done_s', 'Travellers can see it and join. You will see who joins.')}</p>
            <div className="ag-flowbar">
              <ButtonLink to="/feed" variant="primary" go data-testid="plan-done-feed">{t('plans.see_feed', 'See it in the Feed')}</ButtonLink>
              <ButtonLink to={`/plan/${posted.id}`} data-testid="plan-done-open">{t('plans.open_plan', 'Open the plan')}</ButtonLink>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const label = t('plans.step_of', 'Step {{n}} / {{total}}', { n: i + 1, total: STEPS });
  const nav = (
    <div className="ag-flowbar">
      {i > 0 && <Button onClick={() => go(i - 1)} icon={<Icon name="back" />} data-testid="plan-back">{t('plans.back', 'Back')}</Button>}
      {i < 3 ? (
        <Button variant="primary" go onClick={next} data-testid="plan-next">{t('plans.next', 'Next')}</Button>
      ) : (
        <Button variant="primary" onClick={post} disabled={posting} data-testid="plan-post"
          icon={posting ? <Loader2 className="animate-spin" /> : <Icon name="t_trip" />}>
          {user ? t('plans.post', 'Post the plan') : t('plans.login_post', 'Log in and post')}
        </Button>
      )}
    </div>
  );

  const titles = [t('plans.name_trip', 'Name your trip'), t('plans.route', 'Your route'), t('plans.people', 'How many people?'), t('plans.check', 'Check your plan')];

  const costRow = (k: CostKey, lab: string) => {
    const changed = d.adj[k] != null && d.adj[k] !== '';
    return (
      <label className="ag-plan-crow" key={k}>
        <span className="grow">{lab}{changed && (
          <Button variant="text" size="sm" className="!h-auto !min-h-0 !px-2" onClick={(e) => { e.preventDefault(); const a = { ...d.adj }; delete a[k]; set({ adj: a }); }}>
            {t('plans.reset', 'Reset')}
          </Button>
        )}</span>
        <span className="ag-plan-cin">₹<input type="number" inputMode="numeric" min={0} value={changed ? d.adj[k] : c.val[k]}
          onChange={(e) => set({ adj: { ...d.adj, [k]: e.target.value } })} aria-label={lab} data-testid={`plan-cost-${k}`} /></span>
      </label>
    );
  };

  const chosen = (l: PlanListing, type: 'homestay' | 'driver') => (
    <span className="ag-plan-chosen" data-testid={`plan-chosen-${type}`}>
      <Icon name={type === 'homestay' ? 'home' : 'car'} />
      <span className="grow"><b>{l.title}</b><br /><span className="ag-small">{l.location}{l.price ? ` · ${rupees(l.price)}` : ''}</span></span>
      <IconButton small label={t('plans.remove', 'Remove')} onClick={() => set(type === 'homestay' ? { stay: null } : { driver: null })}><Icon name="close" /></IconButton>
    </span>
  );

  return (
    <div className="ag-wrap">
      <section className="ag-main" aria-labelledby="plan-q" data-testid={`plan-step-${i}`}>
        <StepBar total={STEPS} at={i} label={label} />
        <p className="ag-small m-0">{label}</p>
        <div className="ag-q"><h1 id="plan-q" ref={top} tabIndex={-1}>{titles[i]}</h1></div>

        {i === 0 && (
          <>
            <TextField label={t('plans.name_trip', 'Name your trip')} value={d.title} maxLength={MAX_TITLE_LEN}
              placeholder={t('plans.name_ph', 'e.g. Kalimpong and Lava in 3 days')} onChange={(e) => set({ title: e.target.value })} data-testid="plan-title" />
            <p className="ag-eyebrow m-0">{t('plans.cover', 'Cover photo (optional)')}</p>
            {d.cover ? (
              <div className="ag-plan-coverwrap">
                <img src={d.cover} alt="" className="ag-plan-cover" />
                <Button variant="text" size="sm" className="self-start" icon={<Icon name="close" />} onClick={() => set({ cover: '' })}>{t('plans.remove', 'Remove')}</Button>
              </div>
            ) : !user ? (
              // Photos upload to their account, so signed out this keeps the plan and asks them to log in.
              <button type="button" className="ag-btn ag-plan-coverbtn cursor-pointer" onClick={toLogin} data-testid="plan-cover-login">
                <Icon name="download" />
                <span className="min-w-0 truncate">{t('plans.cover_login', 'Log in to add a cover photo.')}</span>
              </button>
            ) : (
              <label className="ag-btn ag-plan-coverbtn cursor-pointer" data-testid="plan-cover">
                {uploading ? <Loader2 className="animate-spin" /> : <Icon name="download" />}
                <span className="min-w-0 truncate">{t('plans.cover_s', 'A photo that shows the feel of the trip.')}</span>
                <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="sr-only" onChange={addCover} disabled={uploading} />
              </label>
            )}
            <div className="ag-plan-two">
              <TextField label={t('plans.start', 'Start date')} type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} data-testid="plan-date" />
              <TextField label={t('plans.nights', 'Nights')} type="number" inputMode="numeric" min={1} max={MAX_NIGHTS} value={String(d.nights)}
                onChange={(e) => set({ nights: Math.min(MAX_NIGHTS, Math.max(1, Math.round(Number(e.target.value) || 1))) })} data-testid="plan-nights" />
            </div>
          </>
        )}

        {i === 1 && (
          <>
            <p className="ag-small m-0">{t('plans.days_s', 'Plan each day: where you are and what you will do. Then pick where you stay and who drives.')}</p>
            <ol className="ag-plan-days">
              {days.map((day, j) => (
                <li key={j} className="ag-plan-day" data-testid={`plan-day-${j + 1}`}>
                  <span className="ag-plan-daydot" aria-hidden="true">{j + 1}</span>
                  <div className="ag-plan-daybody">
                    <div className="ag-plan-dayh"><b className="font-medium">{t('plans.day', 'Day')} {j + 1}</b><span className="ag-small">{dayDate(d.date || null, j, lang)}</span></div>
                    <button type="button" className={`ag-plan-loc${day.place ? ' set' : ''}`} aria-expanded={typeof pick === 'object' && pick?.day === j}
                      onClick={() => setPick(typeof pick === 'object' && pick?.day === j ? null : { day: j })} data-testid={`plan-day-place-${j + 1}`}>
                      <Icon name="pin" /><span className="grow">{day.place || t('plans.where', 'Where are you this day?')}</span><Icon name="search" />
                    </button>
                    {typeof pick === 'object' && pick?.day === j && (
                      <PlacePicker onPick={(place) => { setDay(j, { place }); setPick(null); }} />
                    )}
                    <TextArea className="ag-plan-note" rows={2} maxLength={500} value={day.text} onChange={(e) => setDay(j, { text: e.target.value })}
                      placeholder={t('plans.day_ph', 'What you will do: a drive, places to see, a guide…')} aria-label={`${t('plans.day', 'Day')} ${j + 1}`}
                      data-testid={`plan-day-text-${j + 1}`} />
                  </div>
                </li>
              ))}
            </ol>

            <Box>
              <h2>{t('plans.stay_q', 'Where will you stay?')}</h2>
              <p className="ag-small m-0">{t('plans.stay_s', 'Homestays on your route. You can skip.')}</p>
              {d.stay ? chosen(d.stay, 'homestay') : pick === 'homestay'
                ? <ListingPicker type="homestay" near={stops} onPick={(l) => { set({ stay: l }); setPick(null); }} />
                : <Button size="sm" className="self-start" icon={<Icon name="home" />} onClick={() => setPick('homestay')} data-testid="plan-pick-stay">{t('plans.add_stay', 'Stay')}</Button>}
            </Box>
            <Box>
              <h2>{t('plans.drv_q', 'Who will drive?')}</h2>
              <p className="ag-small m-0">{t('plans.drv_s', 'Drivers from your route. You can skip.')}</p>
              {d.driver ? chosen(d.driver, 'driver') : pick === 'driver'
                ? <ListingPicker type="driver" near={stops} onPick={(l) => { set({ driver: l }); setPick(null); }} />
                : <Button size="sm" className="self-start" icon={<Icon name="car" />} onClick={() => setPick('driver')} data-testid="plan-pick-driver">{t('plans.add_drive', 'Drive')}</Button>}
            </Box>
          </>
        )}

        {i === 2 && (
          <>
            <p className="ag-small m-0">{t('plans.people_s', 'Including you. Others can join until the seats are full.')}</p>
            <Box>
              <div className="ag-plan-stepper">
                <button type="button" className="ag-plan-round" onClick={() => set({ seats: Math.max(1, d.seats - 1) })} disabled={d.seats <= 1}
                  aria-label={t('plans.fewer', 'Fewer')} data-testid="plan-seats-minus">−</button>
                <span className="ag-plan-n" data-testid="plan-seats">{d.seats}</span>
                <button type="button" className="ag-plan-round" onClick={() => set({ seats: Math.min(MAX_SEATS, d.seats + 1) })} disabled={d.seats >= MAX_SEATS}
                  aria-label={t('plans.more', 'More')} data-testid="plan-seats-plus">+</button>
              </div>
            </Box>
            <Box>
              <div className="flex items-center justify-between gap-2">
                <p className="ag-eyebrow m-0">{t('plans.cost', 'Cost per person')}</p>
                <span className="ag-small">{t('plans.edit_hint', 'Tap a number to change it')}</span>
              </div>
              {costRow('stay', t('plans.cost_stay', 'Stay'))}
              {costRow('car', t('plans.cost_car', 'Car, shared'))}
              {costRow('guide', t('plans.cost_guide', 'Guide, shared'))}
              {costRow('spots', t('plans.cost_spots', 'Entry tickets'))}
              {d.extra.map((x, k) => (
                <div className="ag-plan-crow" key={k}>
                  <span className="grow"><input className="ag-plan-cname" value={x.name} maxLength={60} placeholder={t('plans.extra_ph', 'e.g. Permits, bonfire, food')}
                    aria-label={t('plans.extra_ph', 'e.g. Permits, bonfire, food')}
                    onChange={(e) => set({ extra: d.extra.map((y, n) => (n === k ? { ...y, name: e.target.value } : y)) })} /></span>
                  <span className="ag-plan-cin">₹<input type="number" inputMode="numeric" min={0} value={x.amt} aria-label={x.name || t('plans.add_cost', 'Add a cost')}
                    onChange={(e) => set({ extra: d.extra.map((y, n) => (n === k ? { ...y, amt: e.target.value } : y)) })} /></span>
                  <IconButton small label={t('plans.remove', 'Remove')} onClick={() => set({ extra: d.extra.filter((_, n) => n !== k) })}><Icon name="close" /></IconButton>
                </div>
              ))}
              <Button size="sm" className="self-start" icon={<Icon name="plus" />} onClick={() => set({ extra: [...d.extra, { name: '', amt: '' }] })} data-testid="plan-add-cost">
                {t('plans.add_cost', 'Add a cost')}
              </Button>
              <div className="ag-plan-total"><b>{t('plans.cost', 'Cost per person')}</b><b data-testid="plan-total">{rupees(c.total)}</b></div>
              <p className="ag-small m-0">{t('plans.estimate', 'Estimate from listed prices. Hosts confirm the final price.')}</p>
            </Box>
            <TextArea label={t('plans.notes', 'Anything else travellers should know (optional)')} rows={3} maxLength={900} value={d.notes}
              onChange={(e) => set({ notes: e.target.value })} data-testid="plan-notes" />
          </>
        )}

        {i === 3 && (
          <PlanCard preview plan={{
            id: 'preview', title: d.title.trim(), cover: d.cover || null, stops: stops.map((place) => ({ place })), days: [],
            start_date: d.date || null, nights: d.nights, seats: d.seats, cost_per_person: c.total, notes: d.notes,
            visibility: 'public', created_at: '', updated_at: null,
            organiser: me,
            stay: d.stay, driver: d.driver, joined_count: 1, seats_left: d.seats - 1, full: d.seats <= 1,
            members: [{ id: me.id, name: user?.name || '', avatar: me.avatar }],
            viewer: { is_organiser: true, saved: false, join_status: null },
          }} />
        )}
        {i === 3 && !user && (
          <p className="ag-small m-0" data-testid="plan-login-note">{t('plans.login_note', 'You will log in before the plan is posted. What you typed is kept.')}</p>
        )}

        <FieldError id="plan-err">{err}</FieldError>
        {nav}
      </section>
    </div>
  );
}
