import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { rupees, useHostPlanPrice } from '@/lib/prices';
import { SUPPORTED_IMAGE_ACCEPT } from '@/lib/uploadImage';
import { distanceTo, inServiceRegion } from '@/lib/places';
import { nearestAreaLabel } from '@/lib/hostQuickFill';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { capPrice, isValidPhone, MAX_PRICE } from '@/lib/hostFormChecks';
import { Box, Button, ButtonLink, FieldError, IconButton, StepBar, TextField } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';
import { HelpWhatsApp, useHostSignupInfo } from '@/components/provider/onboard/QuickFill';
import { HOST_TYPES, HUBS, MAX_GOODS, MAX_PHOTOS, OFFERS, PRESETS, QUICK_DISHES, SHOP_UNITS, type HostType, type HostWizard, type Place } from './useHostWizard';
import { photoGoalFor } from '@/lib/photoGoal';
import Sheet, { SheetHead } from '@/components/listing-detail/Sheet';
import PaymentDoneCard from '@/components/PaymentDoneCard';
import GstDetails from '@/components/provider/GstDetails';
import { gstDraftError } from '@/lib/gstin';

/** "Add your own" on the What do you give? step; the server takes up to 30 amenities of 60 characters. */
const MAX_OWN_OFFERS = 8;
const MAX_OWN_OFFER_LEN = 40;

// Leaflet is heavy: load the pin map only once the host has picked a place.
const PinMap = lazy(() => import('./PinMap'));

/*
 * The host sign-up wizard, laid out as the Aangan 2.0 prototype's V.biz / V.bizsetup
 * (provider.js, menu.js): business-type tiles with the charges box, then one question per screen.
 * Colours come from the theme variables only (styles/screens/onboard.css).
 */

const TYPE_ICON: Record<HostType, IconName> = { homestay: 'home', driver: 'car', guide: 'trek', cafe: 'cup', shop: 'bag' };

/** Prototype "Next": an auto-width red pill with the circled arrow. */
function NextButton({ onClick, children, ...rest }: { onClick: () => void; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button variant="primary" go className="ag-onboard-next" onClick={onClick} {...rest}>{children}</Button>;
}

/** Step bar, "Step n / total" and the question over every step except done. */
function Frame({ w, title, sub, children, cta }: { w: HostWizard; title: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode; cta?: React.ReactNode }) {
  const { t, i, steps, err, next, fixAt, goTo } = w;
  const label = t('ob.wz.step', { n: i + 1, total: steps.length });
  const fixStep = fixAt ? steps.indexOf(fixAt) : -1;
  return (
    <section className="ag-main ag-onboard" aria-labelledby="wz-q" data-testid={`wz-step-${steps[i]}`}>
      <StepBar total={steps.length} at={i} label={label} />
      <p className="ag-small">{label}</p>
      <h1 id="wz-q" className="ag-onboard-h1" tabIndex={-1}>{title}</h1>
      {sub != null && <p className="ag-small ag-onboard-sub">{sub}</p>}
      {children}
      <FieldError id="wz-err">{err}</FieldError>
      {err && fixStep >= 0 && (
        <Button variant="text" className="self-start" icon={<Icon name="back" />} onClick={() => goTo(fixStep)} data-testid="wz-fix">
          {fixAt === 'place' ? t('ob.wz.fix_place', 'Change the place') : t('ob.wz.fix_name', 'Change the name')}
        </Button>
      )}
      {cta ?? <NextButton onClick={next} data-testid="wz-next">{t('ob.wz.next')}</NextButton>}
    </section>
  );
}

/**
 * The fee lines, with real prices from the server. `plain` = dotted list inside the charges box.
 * With a `type` it shows only that business's charge; without one, every type's.
 */
function FeeList({ plain, type }: { plain?: boolean; type?: HostType | '' }) {
  const { t } = useTranslation();
  const full = useHostPlanPrice('homestay');
  const small = useHostPlanPrice('cafe');
  const mine = useHostPlanPrice(type || 'homestay');
  const { grace_bookings } = useHostSignupInfo();
  const grace = t('ob.wz.fp_4', { count: grace_bookings, defaultValue: 'Pay now, or after your first {{count}} bookings' });
  const free = type === 'shop';
  const lines = type
    ? [
      free
        ? t('ob.wz.fee_shop', 'Local shops: free')
        : t('ob.wz.fee_one', { what: t(`ob.wz.t_${type}`), price: rupees(mine.base), defaultValue: '{{what}}: {{price}} a year' }),
      // Inside the charges box the When to pay choice says this already.
      ...(free || plain ? [] : [grace]),
    ]
    : [
      t('ob.wz.fee_big', { price: rupees(full.base), defaultValue: 'Homestays, drivers and guides: {{price}} a year' }),
      t('ob.wz.fee_cafe', { price: rupees(small.base), defaultValue: 'Cafes and restaurants: {{price}} a year' }),
      t('ob.wz.fee_shop', 'Local shops: free'),
      grace,
    ];
  const tick = plain ? null : <Icon name="check" />;
  return (
    <ul className={`ag-onboard-fees${plain ? ' plain' : ''}`} data-testid={plain ? 'wz-fees-box' : 'wz-fees'}>
      {lines.map((l) => <li key={l}>{tick}<span>{l}</span></li>)}
      {!free && <li className="hl">{tick}<span>{t('ob.wz.fp_5')}</span></li>}
    </ul>
  );
}

/* ---------- 1. What do you want to list? ---------- */
function TypeStep({ w }: { w: HostWizard }) {
  const { t, d, pickType } = w;
  return (
    <Frame w={w} title={t('ob.wz.what')} sub={t('ob.wz.onelist')}
      cta={(
        <div className="ag-onboard-ctarow">
          <NextButton onClick={w.next} data-testid="wz-next">{t('ob.wz.next')}</NextButton>
          <HelpWhatsApp type={d.type || undefined} />
        </div>
      )}>
      <div className="ag-onboard-tiles" role="radiogroup" aria-label={t('ob.wz.what')}>
        {HOST_TYPES.map((ty) => (
          <button key={ty} type="button" role="radio" aria-checked={d.type === ty} className="ag-onboard-tile"
            onClick={() => pickType(ty)} data-testid={`wz-type-${ty}`}>
            <span className="ic"><Icon name={TYPE_ICON[ty]} /></span>
            <span className="radio" aria-hidden="true" />
            <b>{t(`ob.wz.t_${ty}`)}</b>
            <span className="ag-small">{t(`ob.wz.t_${ty}_s`)}</span>
          </button>
        ))}
      </div>

    </Frame>
  );
}

/* ---------- 2. Where is it? ---------- */
type Found = { display_name: string; lat: number | string; lon: number | string };
function PlaceStep({ w }: { w: HostWizard }) {
  const { t, d, set, setErr } = w;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Place[]>([]);
  const [looking, setLooking] = useState(false);
  const [locating, setLocating] = useState(false);
  const perm = useGeoPermission();
  // GPS can take up to 12 s; a host who goes Back meanwhile must not get this step's error on another.
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);

  // Typed names: the hubs first, then the geocoder (proxied by the backend) for villages and roads.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setFound([]); return undefined; }
    setLooking(true);
    const id = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/geocode/search', { params: { q: s } });
        setFound((data.results || []).slice(0, 6).map((r: Found) => ({
          name: String(r.display_name).split(',').slice(0, 2).join(',').trim(), lat: Number(r.lat), lng: Number(r.lon),
        })));
      } catch { setFound([]); } finally { setLooking(false); }
    }, 400);
    return () => window.clearTimeout(id);
  }, [q]);

  // No preset places before typing: the search and "my location" cover it. Typed text matches the
  // hubs straight away while the geocoder answers.
  const hubs = q.trim() ? HUBS.filter((h) => h.name.toLowerCase().includes(q.trim().toLowerCase())) : [];
  const chips = [...hubs, ...found.filter((f) => !hubs.some((h) => h.name === f.name))];

  // Every pick (GPS, chip, search, pin drag) bumps `seq`; a street name that comes back for an
  // older pick is dropped. `focus` moves the map view only for picks made outside the map.
  const seq = useRef(0);
  const [focus, setFocus] = useState(0);
  const [naming, setNaming] = useState(false);
  const nameFromPin = async (lat: number, lng: number, n: number) => {
    setNaming(true);
    try {
      const { data } = await api.get('/geocode/reverse', { params: { lat: lat.toFixed(6), lon: lng.toFixed(6) } });
      if (n === seq.current && data?.name) w.set((prev) => (prev.place ? { place: { ...prev.place, name: String(data.name).slice(0, 200) } } : {}));
    } catch { /* keep the nearby-area name */ } finally { if (n === seq.current) setNaming(false); }
  };
  const nearbyName = (lat: number, lng: number) => {
    const km = (h: Place) => distanceTo({ lat, lng }, { latitude: h.lat, longitude: h.lng })?.km ?? 1e9;
    return nearestAreaLabel(lat, lng) || [...HUBS].sort((a, b) => km(a) - km(b))[0]?.name || 'Darjeeling';
  };
  const pick = (p: Place) => { seq.current += 1; setNaming(false); setErr(''); set({ place: p }); setFocus((f) => f + 1); };
  const movePin = (lat: number, lng: number) => {
    const n = ++seq.current;
    setErr(inServiceRegion(lat, lng) ? '' : t('ob.wz.loc_outside'));
    set({ place: { name: nearbyName(lat, lng), lat, lng } });
    void nameFromPin(lat, lng, n);
  };

  const myLocation = async () => {
    setErr('');
    if (!navigator.geolocation) { setErr(t('ob.wz.noloc')); return; }
    setLocating(true);
    try {
      const p = await exactPosition();
      if (!live.current) return;
      const { latitude: lat, longitude: lng, accuracy } = p.coords;
      // A fix this rough comes from Wi-Fi or the mobile network, which usually means the phone's
      // Location (GPS) is off; say so rather than telling a host in the hills they are outside them.
      if (!inServiceRegion(lat, lng)) { setErr(t(accuracy > ROUGH_FIX_M ? 'ob.wz.loc_rough' : 'ob.wz.loc_outside')); return; }
      const n = ++seq.current;
      set({ place: { name: nearbyName(lat, lng), lat, lng, accuracy: Math.round(accuracy) } });
      setFocus((f) => f + 1);
      void nameFromPin(lat, lng, n);
    } catch (e) {
      if (live.current) setErr(e === 'denied' ? t('ob.wz.loc_denied') : t('ob.wz.noloc'));
    } finally {
      if (live.current) setLocating(false);
    }
  };

  const pl = d.place;
  const weak = (pl?.accuracy ?? 0) > 100;
  return (
    <Frame w={w} title={t('ob.wz.where')}>
      <div className="ag-onboard-loc">
        <label className="ag-onboard-search">
          <Icon name="search" />
          <input type="search" placeholder={t('ob.wz.wz_find')} value={q} onChange={(e) => setQ(e.target.value)}
            autoComplete="off" aria-label={t('ob.wz.wz_find')} data-testid="wz-place-search" />
        </label>
        <Button onClick={myLocation} disabled={locating} className="ag-onboard-myloc" data-testid="wz-myloc"
          icon={locating ? <Loader2 className="animate-spin" /> : <Icon name="locate" />}>
          {locating ? t('ob.wz.locating') : t('ob.wz.myloc')}
        </Button>
        {!pl && perm !== 'granted' && (
          <p className="ag-small ag-onboard-lochint" data-testid="wz-loc-hint">
            <Icon name="locate" />
            <span>{perm === 'denied' ? t('ob.wz.loc_hint_blocked') : t('ob.wz.loc_hint')}</span>
          </p>
        )}
      </div>
      <div className="ag-onboard-pchips" role="list">
        {chips.map((p) => (
          <button key={`${p.name}${p.lat}`} type="button" className="ag-onboard-pchip" aria-pressed={pl?.name === p.name && pl.lat === p.lat}
            onClick={() => pick(p)} data-testid={`wz-place-${p.name}`}>
            <Icon name="pin" />{p.name}
          </button>
        ))}
      </div>
      {looking && <p className="ag-small">{t('common.loading')}</p>}
      {!looking && q.trim().length >= 3 && chips.length === 0 && <p className="ag-small">{t('ob.wz.tp_none')}</p>}
      {pl && (
        <div className="ag-onboard-pin" data-testid="wz-place-picked">
          <p className="where" aria-live="polite">
            <Icon name="pin" />
            <span>{naming ? t('ob.wz.loc_naming') : pl.name}</span>
          </p>
          <Suspense fallback={<div className="h-56 w-full rounded-[var(--r-card)] bg-[var(--soft)] sm:h-64" />}>
            <PinMap lat={pl.lat} lng={pl.lng} accuracy={pl.accuracy} focus={focus} onMove={movePin} />
          </Suspense>
          <p className="ag-small meta">
            <span className={weak ? 'weak' : undefined}>
              {pl.accuracy != null
                ? (weak ? t('ob.wz.loc_weak', { m: pl.accuracy }) : t('ob.wz.loc_acc', { m: pl.accuracy }))
                : t('ob.wz.loc_drag')}
            </span>
            <span className="ll" data-testid="wz-place-ll">{pl.lat.toFixed(5)}, {pl.lng.toFixed(5)}</span>
          </p>
        </div>
      )}
    </Frame>
  );
}

/** Beyond this many metres a fix is a network guess, not GPS. */
const ROUGH_FIX_M = 1000;

/**
 * Whether this site may read the phone's position: 'granted', 'prompt', 'denied', or 'unknown'
 * where the browser cannot say (older Safari). Follows changes made in the browser's settings.
 */
function useGeoPermission() {
  const [state, setState] = useState<PermissionState | 'unknown'>('unknown');
  useEffect(() => {
    let status: PermissionStatus | null = null;
    let live = true;
    const onChange = () => { if (status) setState(status.state); };
    navigator.permissions?.query({ name: 'geolocation' }).then((s) => {
      if (!live) return;
      status = s;
      setState(s.state);
      s.addEventListener('change', onChange);
    }).catch(() => { /* keep 'unknown' */ });
    return () => { live = false; status?.removeEventListener('change', onChange); };
  }, []);
  return state;
}

/**
 * The phone's own position, as exact as it will get in a few seconds. The first GPS fix is often
 * a coarse cell/Wi-Fi guess (hundreds of metres), so keep listening and take the best one, stopping
 * early once it is within 25 m. Never reuses a cached position. Rejects 'denied' when blocked.
 */
function exactPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null;
    let done = false;
    const finish = (why?: 'denied') => {
      if (done) return;
      done = true;
      navigator.geolocation.clearWatch(id);
      window.clearTimeout(timer);
      if (why) reject(why);
      else if (best) resolve(best);
      else reject('none');
    };
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
        if (p.coords.accuracy <= 25) finish();
      },
      (e) => finish(e.code === e.PERMISSION_DENIED ? 'denied' : undefined),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    const timer = window.setTimeout(() => finish(), 12000);
  });
}

/* ---------- 3. Your name and number ---------- */
function NameStep({ w }: { w: HostWizard }) {
  const { t, d, set } = w;
  const label = d.type === 'homestay' ? t('ob.wz.nmStay') : (d.type === 'cafe' || d.type === 'shop') ? t('ob.wz.nmShop') : t('ob.wz.name');
  // A full 10 digits that is not an Indian mobile shows at once; anything shorter waits for Next.
  const phoneBad = d.phone.length === 10 && !isValidPhone(d.phone);
  return (
    <Frame w={w} title={t('ob.wz.who')}>
      <TextField label={label} value={d.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" maxLength={120} data-testid="wz-name" />
      <TextField label={t('ob.wz.phone')} value={d.phone} onChange={(e) => set({ phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
        type="tel" inputMode="numeric" maxLength={10} autoComplete="tel-national" data-testid="onboard-phone"
        error={phoneBad ? t('ob.wz.badphone') : undefined} errorId="onboard-phone-error" />
    </Frame>
  );
}

/* ---------- 4a. Price (homestay, driver, guide) ---------- */
function PriceStep({ w }: { w: HostWizard }) {
  const { t, d, set } = w;
  const presets = (d.type && PRESETS[d.type]) || [];
  const n = Number(d.price) || 0;
  const bump = (by: number) => set({ price: String(Math.min(MAX_PRICE, Math.max(0, n + by))) });
  const stay = d.type === 'homestay';
  const rooms = stay && d.roomsMode;
  const setRoom = (k: number, patch: Partial<{ name: string; price: string; occ: string }>) => set({ rooms: d.rooms.map((r, j) => (j === k ? { ...r, ...patch } : r)) });
  return (
    <Frame w={w} title={stay ? t('ob.wz.prStay') : t('ob.wz.prDay')}>
      {stay && (
        <div className="ag-onboard-chips">
          <button type="button" className="ag-onboard-chip" aria-pressed={!rooms} onClick={() => set({ roomsMode: false })} data-testid="wz-price-one">{t('ob.wz.prOne')}</button>
          <button type="button" className="ag-onboard-chip" aria-pressed={rooms}
            onClick={() => set({ roomsMode: true, rooms: d.rooms.length ? d.rooms : [{ name: t('ob.wz.rStd'), price: String(n || 1000), occ: '2' }] })} data-testid="wz-price-rooms">
            {t('ob.wz.prRooms')}
          </button>
        </div>
      )}
      {!rooms ? (
        <>
          <Box>
            <div className="ag-onboard-stepper">
              <button type="button" className="round" aria-label={t('ob.wz.minus')} onClick={() => bump(-100)}>−</button>
              <label className="ag-onboard-priceedit">
                <span aria-hidden="true">₹</span>
                <input type="number" inputMode="numeric" min={0} max={MAX_PRICE} step={50} value={d.price} aria-label={t('ob.wz.price')}
                  onChange={(e) => set({ price: capPrice(e.target.value) })} data-testid="onboard-price" />
              </label>
              <button type="button" className="round" aria-label={t('ob.wz.plus')} onClick={() => bump(100)}>+</button>
            </div>
            <p className="ag-small text-center">{t('ob.wz.prEditS')}</p>
          </Box>
          <div className="ag-onboard-chips">
            {presets.map((v) => (
              <button key={v} type="button" className="ag-onboard-chip" aria-pressed={n === v} onClick={() => set({ price: String(v) })}>₹{v.toLocaleString('en-IN')}</button>
            ))}
          </div>
        </>
      ) : (
        <Box>
          <p className="ag-small">{t('ob.wz.roomsS2')}</p>
          {d.rooms.map((r, k) => (
            <div key={k} className="ag-onboard-roomrow">
              <input className="ag-in" value={r.name} placeholder={t('ob.wz.rnShort')} aria-label={t('ob.wz.rnShort')}
                onChange={(e) => setRoom(k, { name: e.target.value })} data-testid={`wz-room-name-${k}`} />
              <label className="ag-onboard-roomin">₹
                <input type="number" inputMode="numeric" min={0} max={MAX_PRICE} value={r.price} placeholder="0" aria-label={t('ob.wz.price')}
                  onChange={(e) => setRoom(k, { price: capPrice(e.target.value) })} data-testid={`wz-room-price-${k}`} />
              </label>
              <label className="ag-onboard-roomin"><Icon name="person" />
                <input type="number" inputMode="numeric" min={1} max={20} value={r.occ ?? '2'} aria-label={t('ob.wz.guests', 'Guests')}
                  onChange={(e) => setRoom(k, { occ: e.target.value.replace(/[^\d]/g, '').slice(0, 2) })} data-testid={`wz-room-occ-${k}`} />
              </label>
              <IconButton label={t('ob.wz.remove')} className="ag-onboard-x" onClick={() => set({ rooms: d.rooms.filter((_, j) => j !== k) })}><Icon name="close" /></IconButton>
            </div>
          ))}
          <Button className="self-start" icon={<Icon name="plus" />} onClick={() => set({ rooms: [...d.rooms, { name: '', price: '', occ: '2' }] })} data-testid="wz-add-room">{t('ob.wz.addroom')}</Button>
        </Box>
      )}
    </Frame>
  );
}

/* ---------- 4b. Your menu (cafe) / What you sell (shop) ---------- */
/**
 * A café lists dishes (quick-add momos, thukpa...). A shop can be anything (groceries, a pharmacy,
 * crafts), so it gets no food suggestions: the host writes their own items, each with a unit
 * (per kg, per pack...), up to the ten a shop can list.
 */
function MenuStep({ w }: { w: HostWizard }) {
  const { t, d, set, setErr, photoUrl } = w;
  const [upAt, setUpAt] = useState<number | null>(null);
  const shop = d.type === 'shop';
  const full = shop && d.menu.length >= MAX_GOODS;
  const quick = shop ? [] : QUICK_DISHES.filter((q) => !d.menu.some((m) => m.name === q));
  const setDish = (k: number, patch: Partial<{ name: string; price: string; photo: string; unit: string }>) => set({ menu: d.menu.map((m, j) => (j === k ? { ...m, ...patch } : m)) });
  const photo = async (k: number, f?: File) => {
    if (!f) return;
    setUpAt(k);
    try { setDish(k, { photo: await photoUrl(f) }); } catch (e) { setErr(typeof e === 'string' ? e : t('kyc.uploadFailed')); } finally { setUpAt(null); }
  };
  return (
    <Frame w={w} title={shop ? t('ob.wz.sh_h') : t('ob.wz.mn_h')} sub={shop ? t('ob.wz.sh_s') : t('ob.wz.mn_s')}>
      {quick.length > 0 && (
        <>
          <span className="ag-eyebrow">{t('ob.wz.mn_quick')}</span>
          <div className="ag-onboard-pchips">
            {quick.map((q) => (
              <button key={q} type="button" className="ag-onboard-pchip" onClick={() => set({ menu: [...d.menu, { name: q, price: '' }] })}>
                <Icon name="plus" />{q}
              </button>
            ))}
          </div>
        </>
      )}
      <Box>
        {d.menu.length === 0 && <p className="ag-small">{shop ? t('ob.wz.sh_need') : t('ob.wz.mn_need')}</p>}
        {d.menu.map((m, k) => (
          <div key={k} className="ag-onboard-mnrow">
            <label className={`ag-onboard-mnph${m.photo ? ' has' : ''}`} style={m.photo ? { backgroundImage: `url(${m.photo})` } : undefined} title={t('ob.wz.photo')}>
              {upAt === k ? <span className="ag-small">…</span> : !m.photo && <Icon name="plus" />}
              <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="sr-only" onChange={(e) => photo(k, e.target.files?.[0])} aria-label={t('ob.wz.photo')} />
            </label>
            <div className={`fields${shop ? ' unit' : ''}`}>
              <input className="ag-in" value={m.name} maxLength={40} placeholder={shop ? t('ob.wz.sh_item') : t('ob.wz.mn_dish')} aria-label={shop ? t('ob.wz.sh_item') : t('ob.wz.mn_dish')}
                onChange={(e) => setDish(k, { name: e.target.value })} data-testid={`wz-dish-name-${k}`} />
              <input className="ag-in" type="number" inputMode="numeric" min={0} max={MAX_PRICE} value={m.price} placeholder={t('ob.wz.mn_price')} aria-label={t('ob.wz.mn_price')}
                onChange={(e) => setDish(k, { price: capPrice(e.target.value) })} data-testid={`wz-dish-price-${k}`} />
              {shop && (
                <select className="ag-in" value={m.unit || 'item'} aria-label={t('ob.wz.sh_unit')} onChange={(e) => setDish(k, { unit: e.target.value })} data-testid={`wz-dish-unit-${k}`}>
                  {SHOP_UNITS.map((u) => <option key={u} value={u}>{t(`profile.unit_${u}`)}</option>)}
                </select>
              )}
            </div>
            <IconButton label={t('ob.wz.remove')} className="ag-onboard-x" onClick={() => set({ menu: d.menu.filter((_, j) => j !== k) })}><Icon name="close" /></IconButton>
          </div>
        ))}
        {full ? (
          <p className="ag-small m-0" data-testid="wz-goods-full">{t('ob.wz.sh_max', { n: MAX_GOODS })}</p>
        ) : (
          <Button className="self-start" onClick={() => set({ menu: [...d.menu, shop ? { name: '', price: '', unit: 'item' } : { name: '', price: '' }] })} data-testid="wz-add-dish">
            {shop ? t('ob.wz.sh_add') : t('ob.wz.mn_add')}
          </Button>
        )}
      </Box>
    </Frame>
  );
}

/* ---------- 5. What do you give? + photos ---------- */
function ExtrasStep({ w }: { w: HostWizard }) {
  const { t, d, set, addPhotos, uploading } = w;
  const keys = d.type ? OFFERS[d.type] : [];
  const toggle = (k: string) => set({ offers: d.offers.includes(k) ? d.offers.filter((x) => x !== k) : [...d.offers, k] });
  // Anything not on the ready-made list, typed by the host. Tapping one removes it.
  const own = d.offers.filter((o) => !keys.includes(o));
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const addOwn = () => {
    const v = text.trim().replace(/\s+/g, ' ').slice(0, MAX_OWN_OFFER_LEN);
    const known = keys.some((k) => t(`ob.wz.fo.${k}`).toLowerCase() === v.toLowerCase());
    if (v && !known && !d.offers.some((o) => o.toLowerCase() === v.toLowerCase())) set({ offers: [...d.offers, v] });
    setText('');
    setAdding(false);
  };
  const count = d.photos.length;
  return (
    <Frame w={w} title={t('ob.wz.offers')}>
      <div className="ag-onboard-pchips">
        {keys.map((k) => (
          <button key={k} type="button" className="ag-onboard-pchip" aria-pressed={d.offers.includes(k)} onClick={() => toggle(k)} data-testid={`wz-offer-${k}`}>
            <Icon name={d.offers.includes(k) ? 'check' : 'plus'} />{t(`ob.wz.fo.${k}`)}
          </button>
        ))}
        {own.map((o) => (
          <button key={o} type="button" className="ag-onboard-pchip" aria-pressed onClick={() => toggle(o)}
            aria-label={t('ob.wz.offer_remove', { name: o, defaultValue: 'Remove {{name}}' })} data-testid="wz-offer-own">
            <Icon name="check" />{o}<Icon name="close" />
          </button>
        ))}
        {!adding && own.length < MAX_OWN_OFFERS && (
          <button type="button" className="ag-onboard-pchip addown" onClick={() => setAdding(true)} data-testid="wz-offer-add">
            <Icon name="plus" />{t('ob.wz.offer_add', 'Add your own')}
          </button>
        )}
      </div>
      {adding && (
        <form className="ag-onboard-loc" onSubmit={(e) => { e.preventDefault(); addOwn(); }}>
          <label className="ag-onboard-search">
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={MAX_OWN_OFFER_LEN}
              placeholder={t('ob.wz.offer_ph', 'For example: Mountain view')} aria-label={t('ob.wz.offer_add', 'Add your own')}
              onKeyDown={(e) => { if (e.key === 'Escape') { setText(''); setAdding(false); } }} data-testid="wz-offer-input" />
          </label>
          <Button type="submit" variant="primary" disabled={!text.trim()} data-testid="wz-offer-save">
            {t('ob.wz.offer_save', 'Add')}
          </Button>
        </form>
      )}
      <Box className="ag-onboard-photos">
        <div className="head">
          <b>{t('ob.wz.wzph')}</b>
          <span className={`stat${count ? ' ok' : ''}`}>
            {count ? <><Icon name="check" />{t('ob.wz.photos_added', { count })}</> : t('ob.wz.wzph0')}
          </span>
        </div>
        <div className="grid3">
          {d.photos.map((src, k) => (
            <span key={src} className="cell" style={{ backgroundImage: `url(${src})` }}>
              {k === 0 && <span className="cover">{t('ob.wz.cover')}</span>}
              <button type="button" className="x" aria-label={t('ob.wz.remove')} onClick={() => set({ photos: d.photos.filter((_, j) => j !== k) })}><Icon name="close" /></button>
            </span>
          ))}
          {count < MAX_PHOTOS && (
            <label className="add">
              <Icon name="plus" />
              <span>{uploading ? t('common.loading') : count ? t('ob.wz.addmore') : t('ob.wz.addphotos')}</span>
              <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} multiple className="sr-only" disabled={uploading}
                onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} data-testid="wz-photos" />
            </label>
          )}
        </div>
        <p className="ag-small">{photoGoalFor(d.type) ? t('ob.wz.wzphS2', 'The first one is the cover. Photos help travellers choose you. You need at least {{count}} before you can send your documents for the Documents verified badge. You can add them later.', { count: photoGoalFor(d.type) }) : t('ob.wz.wzphS')}</p>
      </Box>
    </Frame>
  );
}

/** Whether "Put it live" first asks when to pay: a new host listing a paid type (shops are free). */
const asksToPay = (w: HostWizard) => !w.adding && !!w.d.type && w.d.type !== 'shop';

/**
 * Opened by the last step's pay button: the picked type's charge and When to pay, Pay when listing
 * already chosen (useHostWizard). Its button follows the choice and puts the listing up.
 */
function ChargesSheet({ w, onConfirm, onClose }: { w: HostWizard; onConfirm: () => void; onClose: () => void }) {
  const { t, d, set } = w;
  const { grace_bookings } = useHostSignupInfo();
  const plan = useHostPlanPrice(d.type || 'homestay');
  const gst = d.gst || { on: false, gstin: '', legalName: '' };
  const [gstTried, setGstTried] = useState(false);
  // Paying now: a GSTIN that is switched on has to be complete before the listing goes up.
  const confirm = () => {
    if (d.payWhen === 'now' && gstDraftError(gst)) { setGstTried(true); return; }
    onConfirm();
  };
  const pay: Array<{ k: 'now' | 'later'; icon: IconName; title: string; sub: string }> = [
    { k: 'now', icon: 'bag', title: t('ob.wz.ch_now', 'Pay when listing'), sub: t('ob.wz.ch_nowS', 'Pay the yearly charge now and go live today.') },
    {
      k: 'later', icon: 't_trip',
      title: t('ob.wz.ch_later', { count: grace_bookings, defaultValue: 'Pay after {{count}} bookings' }),
      sub: t('ob.wz.ch_laterS', { count: grace_bookings, defaultValue: 'List free now, pay after your first {{count}} bookings.' }),
    },
  ];
  return (
    <Sheet onClose={onClose} labelledBy="wz-charges-title" testid="wz-charges" closeTestid="wz-charges-close">
      <div className="flex flex-col gap-4">
        <SheetHead id="wz-charges-title" eyebrow={<span data-testid="onboard-free-chip">{t('ob.wz.ch_eye')}</span>} title={t('ob.wz.ch_when')} />
        <FeeList plain type={d.type} />
        <div className="ag-onboard-chopts" role="radiogroup" aria-labelledby="wz-charges-title">
          {pay.map((o) => (
            <button key={o.k} type="button" role="radio" aria-checked={d.payWhen === o.k} className="ag-onboard-chopt"
              onClick={() => set({ payWhen: o.k, payPicked: true })} data-testid={`plan-${o.k}`}>
              <span className="top"><Icon name={o.icon} /><span className="rdot" aria-hidden="true" /></span>
              <b>{o.title}</b>
              <span className="ag-small">{o.sub}</span>
            </button>
          ))}
        </div>
        <p className="ag-small m-0">{t('ob.wz.gst_note')}</p>
        {d.payWhen === 'now' && <GstDetails value={gst} onChange={(next) => set({ gst: next })} showErrors={gstTried} />}
        <NextButton onClick={confirm} data-autofocus data-testid="wz-charges-confirm">
          {d.payWhen === 'now' ? t('ob.wz.put_pay', { price: rupees(plan.base) }) : t('ob.wz.put')}
        </NextButton>
      </div>
    </Sheet>
  );
}

/* ---------- 6. Travellers will see this ---------- */
function ReviewStep({ w }: { w: HostWizard }) {
  const { t, d, busy, submit, startingPrice, offerLabels } = w;
  const from = startingPrice();
  const unit = d.type === 'homestay' ? t('ob.wz.night') : (d.type === 'driver' || d.type === 'guide') ? t('ob.wz.day') : '';
  const plan = useHostPlanPrice(d.type || 'homestay');
  const icon = d.type ? TYPE_ICON[d.type] : 'home';
  const [asking, setAsking] = useState(false);
  // Paid types see only the pay button here; when to pay is chosen in the sheet it opens.
  const put = () => (asksToPay(w) ? setAsking(true) : submit());
  return (
    <Frame w={w} title={t('ob.wz.review')}
      cta={(
        <>
          <NextButton onClick={put} disabled={busy} data-testid="onboard-submit">
            {busy ? t('common.loading') : asksToPay(w) ? t('ob.wz.put_pay', { price: rupees(plan.base) }) : t('ob.wz.put')}
          </NextButton>
          {!w.adding && d.type === 'shop' && <FeeList type="shop" />}
        </>
      )}>
      <article className="ag-onboard-card">
        <span className="pic" style={d.photos[0] ? { backgroundImage: `url(${d.photos[0]})` } : undefined}>
          {d.photos[0] ? <span className="tag"><Icon name={icon} /></span> : <Icon name={icon} />}
        </span>
        <span className="body">
          <span className="name">{d.name}</span>
          <span className="ag-small">{d.place?.name}</span>
          {from > 0 && <span><b className="price">₹{from.toLocaleString('en-IN')}</b> {unit && <span className="ag-small">{unit}</span>}</span>}
        </span>
      </article>
      {offerLabels().length > 0 && (
        <ul className="ag-onboard-facts">
          {offerLabels().map((l) => <li key={l}><Icon name="check" />{l}</li>)}
        </ul>
      )}
      <p className="ag-onboard-muted">+91 {d.phone}</p>
      {asking && <ChargesSheet w={w} onClose={() => setAsking(false)} onConfirm={() => { setAsking(false); void submit(); }} />}
    </Frame>
  );
}

/* ---------- done ---------- */
function DoneStep({ w }: { w: HostWizard }) {
  const { t, d, paidPlan } = w;
  return (
    <section className="ag-main ag-onboard" data-testid="wz-done">
      <PaymentDoneCard icon="party" title={t('ob.wz.in_title')} body={t('ob.wz.in_body')} testId="wz-done-card"
        note={paidPlan ? t('ob.wz.in_paid', 'Host plan payment done. Your first year is active.') : undefined}>
        <ButtonLink go to="/provider/dashboard" data-testid="wz-dashboard">{t('ob.wz.biz')}</ButtonLink>
        <Button go onClick={() => window.location.assign("/provider/onboard?add=1")} icon={<Icon name="plus" />} data-testid="wz-another">{d.type === 'driver' ? t('ob.wz.addveh') : t('ob.wz.addprop')}</Button>
      </PaymentDoneCard>
    </section>
  );
}

/** The wizard body for the current step, inside the 720px column. */
export default function HostWizardScreens({ w }: { w: HostWizard }) {
  const screen = useMemo(() => w.step, [w.step]);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { top.current?.querySelector<HTMLElement>('h1')?.focus?.({ preventScroll: true }); }, [screen]);
  return (
    <div className="ag-wrap" ref={top}>
      {screen === 'type' && <TypeStep w={w} />}
      {screen === 'place' && <PlaceStep w={w} />}
      {screen === 'name' && <NameStep w={w} />}
      {screen === 'price' && <PriceStep w={w} />}
      {screen === 'menu' && <MenuStep w={w} />}
      {screen === 'extras' && <ExtrasStep w={w} />}
      {screen === 'review' && <ReviewStep w={w} />}
      {screen === 'done' && <DoneStep w={w} />}
    </div>
  );
}
