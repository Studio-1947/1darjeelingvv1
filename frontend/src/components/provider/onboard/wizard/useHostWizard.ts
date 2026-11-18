import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { uploadImages } from '@/lib/uploadImage';
import { readHostLink } from '@/lib/hostQuickFill';
import { isValidPhone, MAX_PRICE, MIN_PRICE } from '@/lib/hostFormChecks';

/*
 * Host onboarding, one question per screen (Aangan 2.0 wizard, provider.js):
 *   type -> place -> name and number -> price (homestay, driver, guide) | menu (cafe, shop)
 *   -> what you give + photos -> review -> done.
 * The step lives in the URL (?step=n) so the header Back steps back one question. Answers are
 * kept in sessionStorage so a refresh does not lose them. Submitting uses the same backend calls
 * as before: POST /providers/onboard, then /providers/me/start-free or the registration payment.
 */

export const HOST_TYPES = ['homestay', 'driver', 'guide', 'cafe', 'shop'] as const;
export type HostType = (typeof HOST_TYPES)[number];
export type StepKey = 'type' | 'place' | 'name' | 'price' | 'menu' | 'extras' | 'review';
export type Place = { name: string; lat: number; lng: number };
export type Room = { name: string; price: string; /** guests the room sleeps */ occ?: string };
export type Dish = { name: string; price: string; photo?: string };

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

/** Quick-add dishes on the menu step (the prototype's FOODIMG names). */
export const QUICK_DISHES = ['Veg momos', 'Chicken momos', 'Thukpa', 'Dal bhat thali', 'Darjeeling tea', 'Chicken curry with rice', 'Egg chowmein', 'Churpee soup', 'Sel roti and aloo dum', 'Butter tea'];

export const MAX_PHOTOS = 8;

const isFood = (ty: HostType | '') => ty === 'cafe' || ty === 'shop';
export const stepsFor = (ty: HostType | ''): StepKey[] => ['type', 'place', 'name', isFood(ty) ? 'menu' : 'price', 'extras', 'review'];

type Draft = {
  type: HostType | '';
  payWhen: 'later' | 'now';
  place: Place | null;
  name: string;
  phone: string;
  price: string;
  roomsMode: boolean;
  rooms: Room[];
  menu: Dish[];
  offers: string[];
  photos: string[];
};

const DRAFT_KEY = 'ag-host-draft';
const last10 = (p?: string | null) => (p || '').replace(/\D/g, '').slice(-10);

function loadDraft(): Partial<Draft> {
  try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}'); } catch { return {}; }
}

export function useHostWizard() {
  const { t } = useTranslation();
  const { user, loading: authLoading, refresh } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const link = readHostLink(Object.fromEntries(params));

  const [d, setD] = useState<Draft>(() => {
    const saved = loadDraft();
    const ty = (HOST_TYPES as readonly string[]).includes(link.type || '') ? (link.type as HostType) : (saved.type || '');
    return {
      type: ty,
      payWhen: saved.payWhen || 'later',
      place: saved.place || null,
      name: saved.name || '',
      phone: saved.phone || '',
      price: saved.price || '',
      roomsMode: !!saved.roomsMode,
      rooms: saved.rooms || [],
      menu: saved.menu || [],
      offers: saved.offers || [],
      photos: saved.photos || [],
    };
  });
  const set = useCallback((patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch })), []);

  useEffect(() => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* private mode */ } }, [d]);

  // Signed out: sign in first, then come straight back here (with any invite ref).
  useEffect(() => {
    if (authLoading || user) return;
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    nav(`/login?next=${next}${link.ref ? `&ref=${encodeURIComponent(link.ref)}` : ''}&role=provider`, { replace: true });
  }, [authLoading, user, nav, location.pathname, location.search, link.ref]);

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
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [payModal, setPayModal] = useState<null | { amount: number; order: any; providerId: string }>(null);

  const goTo = useCallback((n: number | 'done') => {
    setErr('');
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
      offers: prev.type === ty ? prev.offers : [],
      name: prev.type === ty ? prev.name : ((ty === 'driver' || ty === 'guide') ? (user?.name || '') : ''),
    }));
  };

  /** The rule each step checks before moving on (copy from the prototype). */
  const check = (): string => {
    switch (step) {
      case 'type': return d.type ? '' : t('ob.wz.pickone');
      case 'place': return d.place ? '' : t('ob.wz.wz_noplace');
      case 'name':
        if (!d.name.trim()) return t('ob.wz.badname');
        if (!isValidPhone(d.phone)) return t('ob.wz.badphone');
        return '';
      case 'price': {
        if (d.type === 'homestay' && d.roomsMode) {
          const ok = d.rooms.filter((r) => r.name.trim() && Number(r.price) > 0);
          if (!ok.length) return t('ob.wz.needroom');
          if (ok.some((r) => Number(r.price) < MIN_PRICE || Number(r.price) > MAX_PRICE)) return t('ob.wz.price_range');
          return '';
        }
        const n = Number(d.price);
        if (!n) return t('ob.wz.n_price');
        if (!/^\d+$/.test(d.price) || n < MIN_PRICE || n > MAX_PRICE) return t('ob.wz.price_range');
        return '';
      }
      case 'menu': return d.menu.some((m) => m.name.trim() && Number(m.price) > 0) ? '' : t('ob.wz.mn_need');
      default: return '';
    }
  };

  const next = () => {
    const problem = check();
    if (problem) { setErr(problem); return; }
    goTo(i + 1);
  };
  const back = () => (i > 0 ? goTo(i - 1) : nav(-1));

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_PHOTOS - d.photos.length;
    if (room <= 0) return;
    setUploading(true);
    setErr('');
    try {
      const urls = await uploadImages(Array.from(files).slice(0, room));
      setD((prev) => ({ ...prev, photos: [...prev.photos, ...urls].slice(0, MAX_PHOTOS) }));
    } catch (e) {
      setErr(typeof e === 'string' ? e : t('kyc.uploadFailed'));
    } finally {
      setUploading(false);
    }
  };

  /** Cheapest price the listing shows ("from"). */
  const startingPrice = (): number => {
    if (isFood(d.type)) {
      const p = d.menu.map((m) => Number(m.price)).filter((n) => n > 0);
      return p.length ? Math.min(...p) : 0;
    }
    if (d.type === 'homestay' && d.roomsMode) {
      const p = d.rooms.map((r) => Number(r.price)).filter((n) => n > 0);
      return p.length ? Math.min(...p) : 0;
    }
    return Number(d.price) || 0;
  };

  const offerLabels = () => (d.type ? OFFERS[d.type] : []).filter((k) => d.offers.includes(k)).map((k) => t(`ob.wz.fo.${k}`));

  /** What the host's choices say about the place; the backend needs a description, the prototype asks none. */
  const describe = () => {
    const what = d.type ? t(`ob.wz.t_${d.type}`) : '';
    const offers = offerLabels();
    return `${what} · ${d.place?.name || ''}${offers.length ? `. ${offers.join(', ')}.` : ''}`;
  };

  const extrasFor = (): Record<string, unknown> => {
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
          ...(d.roomsMode ? (() => {
            const ok = d.rooms.filter((r) => r.name.trim() && Number(r.price) > 0);
            // How many guests the home sleeps: the rooms added up (the board's "guest occupancy").
            const guests = ok.reduce((n, r) => n + (Math.floor(Number(r.occ)) || 0), 0);
            return {
              rooms: ok.map((r) => ({ name: r.name.trim(), price: Number(r.price), unit: 'night' })),
              ...(guests > 0 ? { capacity: Math.min(100, guests) } : {}),
            };
          })() : {}),
        };
      case 'driver':
        return { images, tags: offers, contact_phone: phone, routes: [{ route: t('ob.wz.day_route'), price: Number(d.price) || 0, unit: 'day' }] };
      case 'guide':
        return { host_name: d.name, images, tags: offers, contact_phone: phone, services: [{ name: t('ob.wz.day_service'), price: Number(d.price) || 0, unit: 'day' }] };
      case 'cafe':
      case 'shop': {
        const items = d.menu.filter((m) => m.name.trim() && Number(m.price) > 0)
          .map((m) => ({ name: m.name.trim(), price: Number(m.price), unit: 'item', ...(m.photo ? { photo: m.photo } : {}) }));
        return { host_name: host, images, amenities: offers, contact_phone: phone, ...(d.type === 'cafe' ? { menu: items.map((m) => ({ ...m, unit: 'plate' })) } : { goods: items.slice(0, 10) }) };
      }
      default:
        return {};
    }
  };

  const finish = async () => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* private mode */ }
    await refresh();
    goTo('done');
  };

  /** "Put my listing up": onboard, then go live free (pay later) or pay the first year now. */
  const submit = async () => {
    if (!user || !d.type || !d.place) return;
    setBusy(true);
    setErr('');
    try {
      const { data } = await api.post('/providers/onboard', {
        business_name: d.name.trim(),
        business_type: d.type,
        description: describe(),
        location: d.place.name,
        latitude: d.place.lat,
        longitude: d.place.lng,
        contact_phone: d.phone,
        price_from: startingPrice(),
        images: d.photos.slice(0, 1),
        extras: extrasFor(),
      });
      const providerId = data.provider.id;
      if (d.payWhen === 'later') {
        await api.post('/providers/me/start-free');
        await finish();
        return;
      }
      const orderRes = await createPaymentOrder({ flow: 'provider_registration', reference_id: providerId });
      if (orderRes.mock) {
        setPayModal({ amount: orderRes.amount, order: orderRes.order, providerId });
      } else {
        await payWithRazorpay({
          order: orderRes.order,
          key_id: orderRes.key_id,
          flow: 'provider_registration',
          reference_id: providerId,
          description: 'aangan host plan · first year',
          prefill: { contact: user.phone, name: user.name },
        });
        await finish();
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || t('ui.useProviderOnboard.failed'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    if (!payModal) return;
    await completeMockPayment({ order_id: payModal.order.id, flow: 'provider_registration', reference_id: payModal.providerId });
    setPayModal(null);
    await finish();
  };

  return {
    t, user, nav, d, set, pickType, steps, i, step, err, setErr, busy, uploading, next, back, goTo,
    addPhotos, startingPrice, offerLabels, submit, payModal, setPayModal, finishMockPayment,
  };
}

export type HostWizard = ReturnType<typeof useHostWizard>;
