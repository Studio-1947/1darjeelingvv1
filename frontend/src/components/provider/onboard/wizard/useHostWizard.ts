import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { imageProblem, uploadImage } from '@/lib/uploadImage';
import { readHostLink } from '@/lib/hostQuickFill';
import { isValidPhone, MAX_PRICE, MIN_PRICE } from '@/lib/hostFormChecks';
import { nameProblem } from '@/lib/contentRules';
import { inListingRegion } from '@/lib/places';
import { roomsCapacity } from '@/lib/roomFit';
import type { Area } from '@/components/provider/AreasPicker';
import { setLoginPrefill } from '@/components/ConsentCheck';
import { useCrumbBack } from '@/components/PageBack';

/*
 * Host onboarding, one question per screen (Aangan 2.0 wizard, provider.js):
 *   type -> place -> name and number -> price (homestay, driver, guide) | menu (cafe, shop)
 *   -> what you give + photos -> review -> done.
 * The step lives in the URL (?step=n) so the header Back steps back one question. Answers are
 * kept in sessionStorage so a refresh does not lose them. Submitting is POST /providers/onboard,
 * then /providers/me/start-free: nothing is paid here; the yearly pass is offered on the dashboard.
 *
 * As in the prototype, the wizard opens without signing in. Sign-in is asked once, at "Put it live"
 * (Log in, then straight back to the review step). Photos picked before that stay in the page as
 * blob: URLs and are uploaded when the listing goes up.
 */

export const HOST_TYPES = ['homestay', 'driver', 'guide', 'cafe', 'shop'] as const;
export type HostType = (typeof HOST_TYPES)[number];
export type StepKey = 'type' | 'place' | 'name' | 'price' | 'areas' | 'menu' | 'extras' | 'review';
/** `accuracy` (metres) is set when the place came from the phone's GPS. */
export type Place = { name: string; lat: number; lng: number; accuracy?: number };
/**
 * A homestay room as the wizard holds it: one price a night for the whole room, the guests it sleeps,
 * up to two more on an extra mattress (each paying `extraPrice` a night, empty = free), and what it
 * has, each optional (lib/roomFit.ts ROOM_BEDS / ROOM_BATHS / ROOM_FOODS).
 */
export type Room = { name: string; price: string; occ?: string; extra?: number; extraPrice?: string; bed?: string; bath?: string; food?: string };
/** The room a homestay starts with, priced from an older draft's one price when there is one. */
export const firstRoom = (name: string, price?: string): Room => ({ name, price: price || '1500', occ: '2' });
/** A café dish or a shop item. `unit` is a shop's (per kg, per pack...); a café's is always per plate. */
export type Dish = { name: string; price: string; photo?: string; unit?: string };

/** Default place chips, in the prototype's order; coordinates inside the backend service box. */
export const HUBS: Place[] = [
  { name: 'Darjeeling', lat: 27.041, lng: 88.2663 },
  { name: 'Ghum', lat: 27.0087, lng: 88.253 },
  { name: 'Kurseong', lat: 26.88, lng: 88.279 },
  { name: 'Kalimpong', lat: 27.0594, lng: 88.4695 },
  { name: 'Mirik', lat: 26.887, lng: 88.187 },
  { name: 'Sukhia Pokhri', lat: 26.994, lng: 88.177 },
  { name: 'Simana', lat: 26.996, lng: 88.196 },
  { name: 'Lepchajagat', lat: 27.029, lng: 88.201 },
  { name: 'Sikkim', lat: 27.3389, lng: 88.6065 },
  { name: 'Siliguri', lat: 26.7271, lng: 88.3953 },
  { name: 'Bagdogra', lat: 26.6812, lng: 88.3286 },
  { name: 'Sittong', lat: 26.946, lng: 88.364 },
  { name: 'Lamahatta', lat: 27.078, lng: 88.365 },
  { name: 'Takdah', lat: 27.033, lng: 88.36 },
];

/** Price chips per type (data.js PRESET); the default is the middle one. */
export const PRESETS: Partial<Record<HostType, number[]>> = {
  homestay: [500, 800, 1000, 1500, 2000],
  driver: [2000, 2500, 3000, 3500, 4000],
  guide: [800, 1000, 1200, 1500, 2000],
};

/** "What do you give?" chips per type (data.js FO); keys under ob.wz.fo.* */
export const OFFERS: Record<HostType, string[]> = {
  homestay: ['stays_0', 'stays_1', 'stays_2', 'stays_3', 'stays_4'],
  driver: ['cars_0', 'cars_1', 'cars_2', 'cars_3'],
  guide: ['guides_0', 'guides_1', 'guides_2', 'guides_3'],
  cafe: ['food_0', 'food_1', 'food_2'],
  shop: ['food_0', 'food_1', 'food_2'],
};

/** What a shop prices its goods by (backend lib/hostProfile.ts GOODS_UNITS); labels under profile.unit_*. */
export const SHOP_UNITS = ['item', 'piece', 'kg', 'gram', 'litre', 'pack', 'dozen'] as const;
/** Most items a shop can list (backend MAX_GOODS: the board caps a shop's goods at ten). */
export const MAX_GOODS = 10;

/** Quick-add dishes on a café's menu step (the prototype's FOODIMG names). Shops get none: they sell anything. */
export const QUICK_DISHES = ['Veg momos', 'Chicken momos', 'Thukpa', 'Dal bhat thali', 'Darjeeling tea', 'Chicken curry with rice', 'Egg chowmein', 'Churpee soup', 'Sel roti and aloo dum', 'Butter tea'];

export const MAX_PHOTOS = 8;

const isFood = (ty: HostType | '') => ty === 'cafe' || ty === 'shop';
/** Drivers also say where they pick travellers up (optional: their base counts on its own). */
export const stepsFor = (ty: HostType | ''): StepKey[] => [
  'type', 'place', 'name', isFood(ty) ? 'menu' : 'price', ...(ty === 'driver' ? ['areas' as const] : []), 'extras', 'review',
];

type Draft = {
  type: HostType | '';
  place: Place | null;
  /** Optional: the place's Google Maps link, which also confirms it (backend lib/locationCheck.ts). */
  mapsUrl?: string;
  /** The phone's own reading, kept as read even if the pin is moved after (it confirms the spot). */
  gps?: { lat: number; lng: number; accuracy: number } | null;
  name: string;
  phone: string;
  /** Drivers' and guides' day price. A homestay is priced by its rooms only (user decision 2026-11-27). */
  price: string;
  rooms: Room[];
  menu: Dish[];
  offers: string[];
  /** Drivers: the places they pick travellers up from (lib/driverMatch.ts on the server). */
  areas: Area[];
  photos: string[];
  /** I Agree (Terms, Privacy Policy, 18+) ticked on the first step; required of every host. */
  agreed: boolean;
};

const DRAFT_KEY = 'ag-host-draft';
/**
 * Set when "Put my listing up" sent a signed-out host to log in: back on the review step, signed
 * in, the wizard puts the listing up by itself instead of asking for the same tap again. Holds the
 * draft it belongs to and when it was set; older than PUT_UP_TTL it is ignored.
 */
const PUT_UP_KEY = 'ag-host-put-up';
const PUT_UP_TTL = 30 * 60 * 1000;

function takePutUpMark(draftKey: string): boolean {
  try {
    const raw = sessionStorage.getItem(PUT_UP_KEY);
    if (!raw) return false;
    sessionStorage.removeItem(PUT_UP_KEY);
    const mark = JSON.parse(raw);
    return mark?.draft === draftKey && Date.now() - Number(mark?.at) < PUT_UP_TTL;
  } catch { return false; }
}
const last10 = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);

/** Photos picked while signed out, by their blob: URL. Module level, so they outlive the trip to /login. */
const pendingPhotos = new Map<string, File>();
const isLocal = (u?: string) => !!u && u.startsWith('blob:');
/** A photo that can still be shown: hosted, or picked in this page and not yet uploaded. */
const usable = (u?: string) => !!u && (!isLocal(u) || pendingPhotos.has(u));
async function hosted(u: string): Promise<string> {
  if (!isLocal(u)) return u;
  const f = pendingPhotos.get(u);
  if (!f) return '';
  const url = await uploadImage(f);
  pendingPhotos.delete(u);
  URL.revokeObjectURL(u);
  return url;
}

function loadDraft(key: string): Partial<Draft> {
  try {
    const saved: Partial<Draft> = JSON.parse(sessionStorage.getItem(key) || '{}');
    // After a reload the in-page photos are gone; drop their dead links.
    if (saved.photos) saved.photos = saved.photos.filter(usable);
    if (saved.menu) saved.menu = saved.menu.map((m) => (m.photo && !usable(m.photo) ? { ...m, photo: '' } : m));
    return saved;
  } catch { return {}; }
}

export function useHostWizard() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const link = readHostLink(Object.fromEntries(params));
  // Adding another listing to a business that is already live (dashboard "Add more listings").
  const adding = params.get('add') === '1';
  const draftKey = adding ? DRAFT_KEY + ':add' : DRAFT_KEY;

  const [d, setD] = useState<Draft>(() => {
    const saved = loadDraft(draftKey);
    const ty = (HOST_TYPES as readonly string[]).includes(link.type || '') ? (link.type as HostType) : (saved.type || '');
    return {
      type: ty,
      place: saved.place || null,
      mapsUrl: saved.mapsUrl || '',
      gps: saved.gps || null,
      name: saved.name || '',
      phone: saved.phone || '',
      price: saved.price || '',
      // A homestay always has at least one room to fill in; an older draft's one price becomes its price.
      // An older draft's room that never said what it sleeps starts at 2, as a new one does.
      rooms: saved.rooms?.length ? saved.rooms.map((r: Room) => ({ ...r, occ: r.occ || '2' })) : ty === 'homestay' ? [firstRoom(t('ob.wz.rStd'), saved.price)] : [],
      menu: saved.menu || [],
      areas: Array.isArray(saved.areas) ? saved.areas : [],
      offers: saved.offers || [],
      photos: saved.photos || [],
      agreed: !!saved.agreed,
    };
  });
  // A patch, or a function of the latest draft (for answers that arrive after the host moved on, like a street name).
  const set = useCallback((patch: Partial<Draft> | ((prev: Draft) => Partial<Draft>)) =>
    setD((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) })), []);

  useEffect(() => { try { sessionStorage.setItem(draftKey, JSON.stringify(d)); } catch { /* private mode */ } }, [d, draftKey]);

  // Signed out: the questions are open to anyone (prototype). Putting the listing live asks to log in
  // once, then comes straight back to this step (with any invite ref).
  const askToSignIn = useCallback((step: number, fromSubmit = false) => {
    if (fromSubmit) {
      try { sessionStorage.setItem(PUT_UP_KEY, JSON.stringify({ draft: draftKey, at: Date.now() })); } catch { /* private mode */ }
    }
    // The sign-in screen fills in the WhatsApp number given on the name step (still editable there)
    // and keeps I Agree ticked if it was ticked here.
    setLoginPrefill({ phone: isValidPhone(d.phone) ? d.phone : undefined, agreed: d.agreed });
    const back = new URLSearchParams(location.search);
    back.set('step', String(step));
    const next = encodeURIComponent(`${location.pathname}?${back}`);
    nav(`/login?next=${next}${link.ref ? `&ref=${encodeURIComponent(link.ref)}` : ''}&role=provider`);
  }, [nav, location.pathname, location.search, link.ref, draftKey, d.phone, d.agreed]);

  // Prefill from the account once it has loaded.
  useEffect(() => {
    if (!user) return;
    setD((prev) => ({
      ...prev,
      phone: prev.phone || last10(user.phone),
      name: prev.name || ((prev.type === 'driver' || prev.type === 'guide') ? (user.name || '') : ''),
    }));
  }, [user]);

  const steps = useMemo(() => stepsFor(d.type), [d.type]);
  const done = params.get('step') === 'done';
  // A step past what has been answered (a refresh, a pasted link) falls back to the first open one.
  const asked = Math.max(0, Math.min(Number(params.get('step')) || 0, steps.length - 1));
  const firstOpen = !d.type ? 0 : !d.place ? 1 : !d.name.trim() ? 2 : asked;
  const i = done ? steps.length : Math.min(asked, firstOpen);
  const step: StepKey | 'done' = done ? 'done' : steps[i];

  const [err, setErr] = useState('');
  // The step that can fix what the server refused at "Put it live" (a business name, the place),
  // so the error can offer to go straight there instead of Back, Back, Back.
  const [fixAt, setFixAt] = useState<StepKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  // The breadcrumb's back arrow goes one question back, as the header Back does; only the first
  // question (and the done screen) leaves it on Account.
  const prevStep = useMemo(() => {
    if (done || i <= 0) return null;
    const prev = new URLSearchParams(params);
    prev.set('step', String(i - 1));
    return `${location.pathname}?${prev}`;
  }, [done, i, params, location.pathname]);
  // Read out as "Back: Step 4 / 6".
  useCrumbBack(prevStep, t('ob.wz.step', { n: i, total: steps.length }));

  const goTo = useCallback((n: number | 'done') => {
    setErr('');
    setFixAt(null);
    const next = new URLSearchParams(params);
    next.set('step', String(n));
    setParams(next);
    window.scrollTo({ top: 0 });
  }, [params, setParams]);

  // Default price and name when the type changes.
  const pickType = (ty: HostType) => {
    setErr('');
    setD((prev) => ({
      ...prev,
      type: ty,
      price: prev.type === ty && prev.price ? prev.price : String(PRESETS[ty]?.[2] ?? ''),
      rooms: ty === 'homestay' && !prev.rooms.length ? [firstRoom(t('ob.wz.rStd'))] : prev.rooms,
      offers: prev.type === ty ? prev.offers : [],
      name: prev.type === ty ? prev.name : ((ty === 'driver' || ty === 'guide') ? (user?.name || '') : ''),
    }));
  };

  /** The rule each step checks before moving on (copy from the prototype). */
  const check = (): string => {
    switch (step) {
      case 'type':
        if (!d.type) return t('ob.wz.pickone');
        return d.agreed ? '' : t('ui.login.agree_needed', 'Please tick I Agree to continue.');
      case 'place':
        if (!d.place) return t('ob.wz.wz_noplace');
        return inListingRegion(d.place.lat, d.place.lng) ? '' : t('ob.wz.loc_outside');
      case 'name': {
        // The server's own name rule (lib/contentRules.ts), checked here so "op" is caught on this
        // step and not only when the listing is put up.
        const problem = nameProblem(d.name, 120);
        if (problem === 'empty') return t('ob.wz.badname');
        if (problem === 'short') return t('ob.wz.name_short', 'This name is too short. Write it in full, as travellers will see it.');
        if (problem === 'mash') return t('ob.wz.name_mash', 'This does not look like a real name. Write it as travellers will see it.');
        if (problem === 'long') return t('ob.wz.name_long', { max: 120, defaultValue: 'Keep the name to {{max}} letters or fewer.' });
        if (!isValidPhone(d.phone)) return t('ob.wz.badphone');
        return '';
      }
      case 'price': {
        if (d.type === 'homestay') {
          // A priced room left unnamed is still a room: it is put up as "Room 2" (see the payload).
          const ok = d.rooms.filter((r) => Number(r.price) > 0);
          if (!ok.length) return t('ob.wz.needroom');
          if (ok.some((r) => Number(r.price) < MIN_PRICE || Number(r.price) > MAX_PRICE)) return t('ob.wz.price_range');
          if (ok.some((r) => !(Number(r.occ) >= 1))) return t('ob.wz.needsleeps', 'Say how many guests each room sleeps.');
          if (ok.some((r) => Number(r.extraPrice) > MAX_PRICE)) return t('ob.wz.price_range');
          return '';
        }
        const n = Number(d.price);
        if (!n) return t('ob.wz.n_price');
        if (!/^\d+$/.test(d.price) || n < MIN_PRICE || n > MAX_PRICE) return t('ob.wz.price_range');
        return '';
      }
      case 'menu': return d.menu.some((m) => m.name.trim() && Number(m.price) > 0) ? '' : (d.type === 'shop' ? t('ob.wz.sh_need') : t('ob.wz.mn_need'));
      default: return '';
    }
  };

  const next = () => {
    const problem = check();
    if (problem) { setErr(problem); return; }
    goTo(i + 1);
  };
  const back = () => (i > 0 ? goTo(i - 1) : nav(-1));

  /** A picked photo's URL: uploaded when signed in, kept in the page until "Put it live" when not. */
  const photoUrl = useCallback(async (f: File): Promise<string> => {
    if (user) return uploadImage(f);
    const problem = imageProblem(f);
    if (problem) throw problem;
    const u = URL.createObjectURL(f);
    pendingPhotos.set(u, f);
    return u;
  }, [user]);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - d.photos.length;
    if (room <= 0) return;
    setUploading(true);
    setErr('');
    try {
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, room)) urls.push(await photoUrl(f));
      setD((prev) => ({ ...prev, photos: [...prev.photos, ...urls].slice(0, MAX_PHOTOS) }));
    } catch (e) {
      setErr(typeof e === 'string' ? e : t('kyc.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  /**
   * A homestay's rooms as they will be put up: priced rooms only, an unnamed one called "Room 2".
   * Each keeps what it sleeps, its extra mattress and what it has, so a booking for it is capped and
   * priced there (lib/roomFit.ts, backend lib/hostProfile.ts). The review step shows these too.
   */
  const listedRooms = () => d.rooms
    .map((r, k) => ({ ...r, name: r.name.trim() || t('ob.wz.roomN', { n: k + 1, defaultValue: 'Room {{n}}' }) }))
    .filter((r) => Number(r.price) > 0)
    .map((r) => {
      const occ = Math.min(20, Math.floor(Number(r.occ)) || 0);
      const extra = occ > 0 ? Math.min(2, Math.max(0, Number(r.extra) || 0)) : 0;
      const extraPrice = Math.floor(Number(r.extraPrice)) || 0;
      return {
        name: r.name, price: Math.floor(Number(r.price)), unit: 'night',
        ...(occ > 0 ? { occ } : {}),
        ...(extra > 0 ? { extra_beds: extra, ...(extraPrice > 0 ? { extra_bed_price: extraPrice } : {}) } : {}),
        ...(r.bed ? { bed: r.bed } : {}), ...(r.bath ? { bath: r.bath } : {}), ...(r.food ? { food: r.food } : {}),
      };
    });

  /** Cheapest price the listing shows ("from"). */
  const startingPrice = (): number => {
    if (isFood(d.type)) {
      const p = d.menu.map((m) => Number(m.price)).filter((n) => n > 0);
      return p.length ? Math.min(...p) : 0;
    }
    if (d.type === 'homestay') {
      const p = d.rooms.map((r) => Number(r.price)).filter((n) => n > 0);
      return p.length ? Math.min(...p) : 0;
    }
    return Number(d.price) || 0;
  };

  // The ticked ready-made chips first, then anything the host typed in themselves (stored as plain text).
  const offerLabels = () => {
    const keys = d.type ? OFFERS[d.type] : [];
    return [
      ...keys.filter((k) => d.offers.includes(k)).map((k) => t(`ob.wz.fo.${k}`)),
      ...d.offers.filter((o) => !keys.includes(o)),
    ];
  };

  /** What the host's choices say about the place; the backend needs a description, the prototype asks none. */
  const describe = () => {
    const what = d.type ? t(`ob.wz.t_${d.type}`) : '';
    const offers = offerLabels();
    const base = t('ob.wz.describe', { what, place: d.place?.name || '', name: d.name.trim(), defaultValue: '{{what}} in {{place}}, run by {{name}} and listed on aangan.' });
    return `${base}${offers.length ? ` ${offers.join(', ')}.` : ''}`;
  };

  const extrasFor = (d: Draft): Record<string, unknown> => {
    const phone = d.phone;
    const images = d.photos;
    const host = user?.name || d.name;
    const offers = offerLabels();
    switch (d.type) {
      case 'homestay':
        return {
          host_name: host,
          images,
          amenities: offers,
          contact_phone: phone,
          ...(() => {
            const rooms = listedRooms();
            // How many guests the home sleeps: the rooms added up, extra mattresses too (the board's "guest occupancy").
            const guests = roomsCapacity(rooms);
            return { rooms, ...(guests > 0 ? { capacity: guests } : {}) };
          })(),
        };
      case 'driver':
        return { images, tags: offers, contact_phone: phone, routes: [{ route: t('ob.wz.day_route'), price: Number(d.price) || 0, unit: 'day' }], ...(d.areas.length ? { areas: d.areas } : {}) };
      case 'guide':
        return { host_name: d.name, images, tags: offers, contact_phone: phone, services: [{ name: t('ob.wz.day_service'), price: Number(d.price) || 0, unit: 'day' }] };
      case 'cafe':
      case 'shop': {
        const items = d.menu.filter((m) => m.name.trim() && Number(m.price) > 0)
          .map((m) => ({ name: m.name.trim(), price: Number(m.price), unit: m.unit || 'item', ...(m.photo ? { photo: m.photo } : {}) }));
        return { host_name: host, images, amenities: offers, contact_phone: phone, ...(d.type === 'cafe' ? { menu: items.map((m) => ({ ...m, unit: 'plate' })) } : { goods: items.slice(0, MAX_GOODS) }) };
      }
      default:
        return {};
    }
  };

  const finish = async () => {
    try { sessionStorage.removeItem(draftKey); } catch { /* private mode */ }
    await refresh();
    goTo('done');
  };

  /** "Put my listing up": onboard, then go live free (pay later) or pay the first year now. */
  // One put-up at a time: a second tap, or the automatic one after signing in, while one is on its way.
  const putting = useRef(false);
  /** The place's confirmation: the Google Maps link and/or the phone's reading, when the host gave them. */
  const locationCheck = () => {
    const link = (d.mapsUrl || '').trim();
    const gps = d.gps;
    if (!link && !gps) return null;
    // Drivers and guides go out to travellers: there is no place of theirs to confirm.
    if (d.type !== 'homestay' && d.type !== 'cafe' && d.type !== 'shop') return null;
    return { ...(link ? { maps_url: link } : {}), ...(gps ? { latitude: gps.lat, longitude: gps.lng, accuracy: gps.accuracy } : {}) };
  };
  /** Why the place could not be confirmed (it can be verified on the listing later); shown on the last screen. */
  const [locationNote, setLocationNote] = useState('');
  const submit = async () => {
    if (!d.type || !d.place) return;
    if (!user) { askToSignIn(i, true); return; }
    if (putting.current) return;
    putting.current = true;
    setBusy(true);
    setErr('');
    try {
      // Photos picked before signing in go up now.
      const photos = (await Promise.all(d.photos.map(hosted))).filter(Boolean);
      const menu = await Promise.all(d.menu.map(async (m) => (m.photo && isLocal(m.photo) ? { ...m, photo: await hosted(m.photo) } : m)));
      const sent: Draft = { ...d, photos, menu };
      setD(sent);
      if (adding) {
        const { data: added } = await api.post('/listings', {
          title: d.name.trim(),
          type: d.type,
          description: describe(),
          location: d.place.name,
          latitude: d.place.lat,
          longitude: d.place.lng,
          price: startingPrice(),
          image: photos[0] || '',
          extras: extrasFor(sent),
        });
        // This listing's own place, confirmed on its own (it never takes another listing's pin).
        const check = locationCheck();
        if (check && added?.item?.id) {
          await api.post(`/listings/${added.item.id}/location/verify`, check)
            .catch((e: any) => setLocationNote(e?.response?.data?.detail || ''));
        }
        await finish();
        return;
      }
      const { data } = await api.post('/providers/onboard', {
        business_name: d.name.trim(),
        business_type: d.type,
        description: describe(),
        location: d.place.name,
        latitude: d.place.lat,
        longitude: d.place.lng,
        contact_phone: d.phone,
        price_from: startingPrice(),
        images: photos.slice(0, 1),
        extras: extrasFor(sent),
        ...(locationCheck() ? { location_check: locationCheck() } : {}),
      });
      if (data.location_check_error) setLocationNote(String(data.location_check_error));
      // Nothing is paid while signing up: the listing goes up on its free start, and the yearly
      // pass is offered afterwards on the dashboard's membership card (ListingMembershipCard).
      await api.post('/providers/me/start-free');
      await finish();
    } catch (e: any) {
      const detail: string = e?.response?.data?.detail || '';
      setErr(detail || e?.message || t('ui.useProviderOnboard.failed'));
      // The server names the field it refused (backend lib/contentRules.ts): offer that step.
      setFixAt(/^(Business name|Name)\b/.test(detail) ? 'name' : /^Location\b/.test(detail) ? 'place' : null);
    } finally {
      putting.current = false;
      setBusy(false);
    }
  };

  // Back from the log-in that "Put my listing up" asked for: carry on and put it up, once. The mark
  // is used up on the first signed-in look, so it never fires later from another step.
  const resumed = useRef(false);
  useEffect(() => {
    if (!user || resumed.current) return;
    resumed.current = true;
    if (takePutUpMark(draftKey) && step === 'review') submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, step, draftKey]);

  return {
    t, user, nav, d, set, pickType, steps, i, step, err, setErr, fixAt, busy, uploading, next, back, goTo, adding, locationNote,
    addPhotos, photoUrl, startingPrice, offerLabels, listedRooms, submit,
  };
}

export type HostWizard = ReturnType<typeof useHostWizard>;
