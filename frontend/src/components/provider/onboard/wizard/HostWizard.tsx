import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { SUPPORTED_IMAGE_ACCEPT } from '@/lib/uploadImage';
import { distanceTo, inListingRegion } from '@/lib/places';
import AreasPicker from '@/components/provider/AreasPicker';
import { nearestAreaLabel } from '@/lib/hostQuickFill';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { capPrice, isValidPhone, MAX_PRICE } from '@/lib/hostFormChecks';
import { Box, Button, ButtonLink, FieldError, IconButton, StepBar, TextField } from '@/components/ag';
import { Icon, type IconName } from '@/components/ag/Icon';
import { HelpWhatsApp, useHostSignupInfo } from '@/components/provider/onboard/QuickFill';
import { HOST_TYPES, HUBS, MAX_GOODS, MAX_PHOTOS, OFFERS, PRESETS, QUICK_DISHES, SHOP_UNITS, type HostType, type HostWizard, type Place } from './useHostWizard';
import { photoGoalFor } from '@/lib/photoGoal';
import PaymentDoneCard from '@/components/PaymentDoneCard';
import ConsentCheck from '@/components/ConsentCheck';
import AddListingInfo from './AddListingInfo';

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

/* ---------- 1. What do you want to list? ---------- */
function TypeStep({ w }: { w: HostWizard }) {
  const { t, d, set, setErr, pickType } = w;
  const { grace_bookings } = useHostSignupInfo();
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
      {/* Nothing is paid while listing: the yearly pass is offered on the dashboard after the free start. */}
      <Box tone="blush" flat data-testid="wz-free-band">
        <b className="text-[var(--ink-strong)]">
          {d.type === 'shop'
            ? t('ob.wz.free_shop', 'List for free. Local shops never pay a yearly charge.')
            : t('ob.wz.free_band', { count: grace_bookings, defaultValue: 'List for free. Pay after your first {{count}} bookings.' })}
        </b>
      </Box>
      {/* The same I Agree as the sign-in screen, asked of every host before their details are taken.
          A signed-out host finds it already ticked on the sign-in screen. */}
      <ConsentCheck checked={d.agreed} onChange={(on) => { set({ agreed: on }); if (on) setErr(''); }}
        testId="wz-consent" inputTestId="wz-agree" />
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

  // A pasted Google Maps link puts the pin exactly there (read by the backend; nothing is verified
  // until the listing is put up, with the link and My location together when both are given).
  const [linkState, setLinkState] = useState<'' | 'reading' | 'ok' | 'bad'>('');
  // Homestays, cafes and shops have a place to confirm; drivers and guides go out to travellers.
  const hasPlace = d.type === 'homestay' || d.type === 'cafe' || d.type === 'shop';
  useEffect(() => {
    const link = (d.mapsUrl || '').trim();
    if (link.length < 8) { setLinkState(''); return undefined; }
    setLinkState('reading');
    const id = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/geocode/maps-link', { params: { url: link } });
        const n = ++seq.current;
        set({ place: { name: nearbyName(data.latitude, data.longitude), lat: data.latitude, lng: data.longitude } });
        setFocus((f) => f + 1);
        void nameFromPin(data.latitude, data.longitude, n);
        setLinkState('ok');
      } catch { setLinkState('bad'); }
    }, 600);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.mapsUrl]);

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
    // Hosts list from anywhere in India: a hub's name only when it is close by; elsewhere a plain
    // label until the street name comes back from the geocoder.
    const hub = [...HUBS].sort((a, b) => km(a) - km(b))[0];
    return nearestAreaLabel(lat, lng) || (hub && km(hub) <= 30 ? hub.name : t('ob.wz.loc_pinned', 'Pinned location'));
  };
  const pick = (p: Place) => { seq.current += 1; setNaming(false); setErr(''); set({ place: p }); setFocus((f) => f + 1); };
  const movePin = (lat: number, lng: number) => {
    const n = ++seq.current;
    setErr(inListingRegion(lat, lng) ? '' : t('ob.wz.loc_outside'));
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
      if (!inListingRegion(lat, lng)) { setErr(t(accuracy > ROUGH_FIX_M ? 'ob.wz.loc_rough' : 'ob.wz.loc_outside')); return; }
      const n = ++seq.current;
      set({ place: { name: nearbyName(lat, lng), lat, lng, accuracy: Math.round(accuracy) }, gps: { lat, lng, accuracy: Math.round(accuracy) } });
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
      {hasPlace && <TextField label={t('lv.wz_link', 'Google Maps link (optional)')} value={d.mapsUrl || ''} onChange={(e) => set({ mapsUrl: e.target.value })}
        placeholder="https://maps.app.goo.gl/..." inputMode="url" data-testid="wz-maps-link"
        hint={linkState === 'bad' ? undefined : linkState === 'ok' ? t('lv.wz_link_ok', 'Pin moved to your Google Maps link.') : t('lv.wz_link_hint', 'Paste it to put the pin exactly on your place. With My location too, the link sets the spot.')}
        error={linkState === 'bad' ? t('lv.wz_link_bad', 'Could not read that link. Copy it again from Google Maps.') : undefined} />}
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
        hint={t('ob.wz.phone_hint')} error={phoneBad ? t('ob.wz.badphone') : undefined} errorId="onboard-phone-error" />
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
    // The question follows the toggle: one price is per person, a room's price is for the whole room.
    <Frame w={w} title={rooms ? t('ob.wz.prRoom', 'Price for the room, per night') : stay ? t('ob.wz.prStay') : t('ob.wz.prDay')}>
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

/* ---------- 4, drivers. Where you pick travellers up ---------- */
/**
 * Optional: the base counts on its own. Each place added here means a ride search from it finds the
 * driver first (backend lib/driverMatch.ts), not only one from where they live.
 */
function AreasStep({ w }: { w: HostWizard }) {
  const { t, d, set } = w;
  return (
    <Frame w={w} title={t('areas.title', 'Where do you pick travellers up?')}
      sub={t('areas.sub', { place: d.place?.name || '', defaultValue: 'Add the towns, stations and airports you go to. Travellers searching a ride from them find you first. {{place}} counts already.' })}>
      <AreasPicker areas={d.areas} onChange={(areas) => set({ areas })} base={d.place} testid="wz-areas" wizard />
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

/* ---------- 6. Travellers will see this ---------- */
/** "Put my listing up" puts it up straight away: nothing is paid here (the dashboard offers the yearly pass). */
function ReviewStep({ w }: { w: HostWizard }) {
  const { t, d, busy, submit, startingPrice, offerLabels } = w;
  const from = startingPrice();
  // A homestay priced room by room shows its cheapest room, for the room.
  const unit = d.type === 'homestay' ? (d.roomsMode ? t('ob.wz.room_night', 'room / night') : t('ob.wz.night')) : (d.type === 'driver' || d.type === 'guide') ? t('ob.wz.day') : '';
  const icon = d.type ? TYPE_ICON[d.type] : 'home';
  return (
    <Frame w={w} title={t('ob.wz.review')}
      cta={(
        <NextButton onClick={() => { void submit(); }} disabled={busy} data-testid="onboard-submit">
          {busy ? t('common.loading') : t('ob.wz.put')}
        </NextButton>
      )}>
      {/* One card: the listing as it shows in search, then what it offers, each part labelled. */}
      <article className="ag-onboard-review" data-testid="wz-review-card">
        <div className="ag-onboard-card">
          <span className="pic" style={d.photos[0] ? { backgroundImage: `url(${d.photos[0]})` } : undefined}>
            {d.photos[0] ? <span className="tag"><Icon name={icon} /></span> : <Icon name={icon} />}
          </span>
          <span className="body">
            <span className="name">{d.name}</span>
            <span className="ag-small">{d.place?.name}</span>
            {from > 0 && <span><b className="price">₹{from.toLocaleString('en-IN')}</b> {unit && <span className="ag-small">{unit}</span>}</span>}
          </span>
        </div>
        {offerLabels().length > 0 && (
          <section className="part">
            <h2 className="ag-eyebrow">{t('ob.wz.rv_offers', 'What you give')}</h2>
            <ul className="ag-onboard-facts">
              {offerLabels().map((l) => <li key={l}><Icon name="check" />{l}</li>)}
            </ul>
          </section>
        )}
        {d.type === 'driver' && d.areas.length > 0 && (
          <section className="part">
            <h2 className="ag-eyebrow">{t('ob.wz.rv_areas', 'Picks up from')}</h2>
            <ul className="ag-onboard-facts" data-testid="wz-review-areas">
              {d.areas.map((a) => <li key={a.name}><Icon name="pin" />{a.name}</li>)}
            </ul>
          </section>
        )}
        <section className="part">
          <h2 className="ag-eyebrow">{t('ob.wz.rv_phone', 'WhatsApp number')}</h2>
          <p className="ag-onboard-muted">+91 {d.phone}</p>
        </section>
      </article>
    </Frame>
  );
}

/* ---------- done ---------- */
function DoneStep({ w }: { w: HostWizard }) {
  const { t, d, locationNote } = w;
  return (
    <section className="ag-main ag-onboard" data-testid="wz-done">
      {/* The place could not be confirmed at sign-up: it can be, on the listing's page. */}
      {locationNote && (
        <Box tone="blush" flat data-testid="wz-location-note">
          <p className="text-sm text-[var(--ink-strong)]">{locationNote}</p>
          <p className="ag-small">{t('lv.intro', 'Paste this place’s Google Maps link, use your location while you are there, or both. With both, the link sets the exact spot.')}</p>
        </Box>
      )}
      <PaymentDoneCard icon="party" title={t('ob.wz.in_title')} body={t('ob.wz.in_body')} testId="wz-done-card">
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
  // A host adding another listing hears first that each listing pays its own yearly pass.
  const [info, setInfo] = useState(() => w.adding && w.step !== 'done');
  return (
    <div className="ag-wrap" ref={top}>
      {info && <AddListingInfo onContinue={() => setInfo(false)} onLeave={() => w.nav('/provider/dashboard')} />}
      {screen === 'type' && <TypeStep w={w} />}
      {screen === 'place' && <PlaceStep w={w} />}
      {screen === 'name' && <NameStep w={w} />}
      {screen === 'price' && <PriceStep w={w} />}
      {screen === 'areas' && <AreasStep w={w} />}
      {screen === 'menu' && <MenuStep w={w} />}
      {screen === 'extras' && <ExtrasStep w={w} />}
      {screen === 'review' && <ReviewStep w={w} />}
      {screen === 'done' && <DoneStep w={w} />}
    </div>
  );
}
