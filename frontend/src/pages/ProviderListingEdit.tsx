import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Eye, Upload } from '@phosphor-icons/react';
import api from '@/lib/api';
import { apiError } from '@/lib/plans';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { uploadImage, uploadImages } from '@/lib/uploadImage';
import { photoGoalFor } from '@/lib/photoGoal';
import { roomFit, roomsCapacity } from '@/lib/roomFit';
import { normalizeRoutes, startingPriceFrom } from '@/lib/routeFares';
import { MAX_PRICE } from '@/lib/hostFormChecks';
import { HOMESTAY_AMENITIES, CAFE_AMENITIES, HOMESTAY_TAGS, VEHICLE_TYPES } from '@/constants/listingOptions';
import PricedEditor, { type Priced } from '@/components/provider/PricedEditor';
import AmenityPicker from '@/components/provider/AmenityPicker';
import GalleryUploader from '@/components/provider/GalleryUploader';
import ChipToggleGroup, { toggleIn } from '@/components/provider/ChipToggleGroup';
import { RouteListEditor, RouteFareTable } from '@/components/provider/RouteEditor';
import Fold from '@/components/provider/Fold';
import { Button, ButtonLink, SelectField, TextArea, TextField } from '@/components/ag';
import { useCrumbTitle } from '@/components/PageBack';

/**
 * One listing's own editor (/provider/listings/:id), opened from the Business profile's list of
 * listings. A host can run several homestays, cafes, shops or vehicles, and each keeps its own
 * offers (rooms and food, menu, goods, services, routes), the details that go with them, and its
 * photos (user decision 2026-11-24; the server's PROPERTY_FIELDS). Business-wide things (name,
 * phone, about you, owners) stay on the profile.
 *
 * Saving writes the listing's details (PUT /listings/:id), then its offers and photos through the
 * profile save with `listing_id` (PATCH /providers/me), which checks every row as the profile always
 * did, sets the listing's "from" price, and mirrors the first listing onto the profile.
 */

const MENU_UNITS = ['plate', 'item', 'cup', 'head'];
const GOODS_UNITS = ['item', 'piece', 'kg', 'gram', 'litre', 'pack', 'dozen'];
const MAX_GOODS = 10;
/** Passenger capacity choices for a vehicle: the 1-30 the server accepts. */
const SEAT_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);

/** Saved priced rows (rooms, food, services, goods) as the editor holds them. */
function pricedRows(rows: any[] | undefined, unit: string): Priced[] {
  return (Array.isArray(rows) ? rows : []).map((r) => ({
    name: String(r?.name ?? ''), price: Number(r?.price) || '', unit: r?.unit || unit, ...(r?.photo ? { photo: String(r.photo) } : {}),
    // A homestay room's size and extra mattress (lib/roomFit.ts), kept so a save does not drop them.
    ...(Number(r?.occ) > 0 ? { occ: Number(r.occ), extra_beds: Number(r?.extra_beds) || 0, extra_bed_price: Number(r?.extra_bed_price) || '' } : {}),
    // A room the host switched off (let outside the app) stays off.
    ...(r?.available === false ? { available: false } : {}),
  }));
}

/** The rows as the server takes them: named rows only, with a room's size and Full switch. */
function pricedPayload(rows: Priced[]) {
  return rows.filter((r) => r.name.trim()).map((r) => {
    const fit = roomFit(r);
    return {
      name: r.name.trim(), price: Number(r.price) || 0, unit: r.unit, ...(r.photo ? { photo: r.photo } : {}),
      ...(fit.occ ? { occ: fit.occ } : {}),
      ...(fit.extraBeds ? { extra_beds: fit.extraBeds, ...(fit.extraBedPrice ? { extra_bed_price: fit.extraBedPrice } : {}) } : {}),
      ...(r.available === false ? { available: false } : {}),
    };
  });
}

function formFrom(l: any) {
  const e = l?.extras || {};
  return {
    title: l?.title || '',
    location: l?.location || '',
    description: l?.description || '',
    image: l?.image || '',
    // The host's own "from" price, for a listing with no priced offers; a priced offer sets it on save.
    price: Number(l?.price) || 0,
    address: e.address || '',
    tags: (Array.isArray(l?.tags) ? l.tags : Array.isArray(e.tags) ? e.tags : []) as string[],
    car_model: e.car_model || '',
    vehicle_type: e.vehicle_type || '',
    // A room is one price a night for the whole room (a room saved per head before shows per night).
    rooms: pricedRows(e.rooms, 'night').map((r) => ({ ...r, unit: 'night' })),
    meals: pricedRows(e.meals, 'meal'),
    menu: pricedRows(e.menu, 'plate'),
    goods: pricedRows(e.goods, 'item'),
    services: pricedRows(e.services, 'day'),
    capacity: e.capacity ?? '',
    opening_hours: e.opening_hours || '',
    seats: e.seats ?? '',
    // Older listings saved routes as bare strings: make them rows, as the route editor needs.
    routes: normalizeRoutes(e.routes),
    amenities: (Array.isArray(e.amenities) ? e.amenities : []) as string[],
    images: (Array.isArray(e.images) ? e.images : []) as string[],
    photo_kinds: (e.photo_kinds && typeof e.photo_kinds === 'object' ? e.photo_kinds : {}) as Record<string, string>,
  };
}
type Form = ReturnType<typeof formFrom>;

export default function ProviderListingEdit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, provider, refreshProvider } = useAuth();

  const [listing, setListing] = useState<any>(null);
  useCrumbTitle(listing?.title);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useSeo({ title: listing?.title || t('lf.edit_title') });

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav(`/login?next=/provider/listings/${id}`); return; }
    if (user.role !== 'provider') nav('/provider/onboard');
    else if (!provider) refreshProvider();
  }, [authLoading, user, provider, id, nav, refreshProvider]);

  // The host's listings, as the profile reads them; only this business's own can be saved here.
  const load = useCallback(() => api.get('/bookings/provider')
    .then((r) => {
      const l = (r.data.listings || []).find((x: any) => x.id === id && x.provider_id === provider?.id);
      setListing(l || null);
      setState(l ? 'ready' : 'missing');
      return l;
    })
    .catch(() => { setState('failed'); return null; }), [id, provider?.id]);
  // Once per business: a save refreshes `provider`, and reloading here would drop edits typed since.
  useEffect(() => {
    if (!provider?.id) return;
    load().then((l) => { if (l) setForm(formFrom(l)); });
  }, [provider?.id, load]);

  // Links land on a part: the dashboard's Menu button (#menu) and the checklist's "Add" links
  // (#photos, #prices) come here through the profile. Open that part once the form is drawn.
  const scrolled = useRef(false);
  const hash = location.hash.slice(1);
  useEffect(() => {
    if (!form || scrolled.current || !['menu', 'photos', 'prices'].includes(hash)) return;
    scrolled.current = true;
    window.requestAnimationFrame(() => document.getElementById(hash === 'menu' ? 'prices' : hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [form, hash]);

  // The fixed save bar covers the page's end: the page leaves room for it (--page-cta-h), as the profile does.
  const saveBarRef = useRef<HTMLDivElement>(null);
  const formReady = !!form;
  useEffect(() => {
    const el = saveBarRef.current;
    if (!el) return;
    const root = document.documentElement;
    const setH = () => root.style.setProperty('--page-cta-h', `${el.offsetHeight}px`);
    setH();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(setH) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); root.style.removeProperty('--page-cta-h'); };
  }, [formReady]);

  const set = (patch: Partial<Form>) => {
    setMsg((m) => (m?.ok ? null : m));
    setForm((f) => (f ? { ...f, ...patch } : f));
  };

  const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading('cover');
    try { set({ image: await uploadImage(file) }); }
    catch (err) { setMsg({ ok: false, text: typeof err === 'string' ? err : t('kyc.uploadFailed') }); }
    finally { setUploading(null); }
  };
  const uploadGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading('images');
    try { const urls = await uploadImages(files); setForm((f) => (f ? { ...f, images: [...f.images, ...urls] } : f)); }
    catch (err) { setMsg({ ok: false, text: typeof err === 'string' ? err : t('kyc.uploadFailed') }); }
    finally { setUploading(null); }
  };

  if (state === 'missing' || state === 'failed') {
    return (
      <div className="ag-wrap"><div className="ag-main" data-testid="listing-edit-missing">
        <p className="ag-small">{state === 'missing'
          ? t('hostProfile.listing_missing', 'This listing is not one of yours, or it was removed.')
          : t('ui.providerProfile.load_failed', 'Could not open your business profile. Check your connection.')}</p>
        <ButtonLink to="/provider/profile" className="self-start">{t('hostProfile.title')}</ButtonLink>
      </div></div>
    );
  }
  if (!form || !listing) return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;

  const type: string = listing.type;
  const taking = listing.extras?.available !== false;
  const setTaking = async (on: boolean) => {
    setSwitching(true);
    try {
      await api.patch(`/listings/${listing.id}`, { extras: { ...(listing.extras || {}), available: on } });
      setListing((l: any) => ({ ...l, extras: { ...(l.extras || {}), available: on } }));
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || t('ui.providerProfile.could_not_save') });
    } finally {
      setSwitching(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(t('pd.delete_confirm', 'Delete this listing? This cannot be undone.'))) return;
    setBusy(true);
    try {
      await api.delete(`/listings/${listing.id}`);
      nav('/provider/profile#listings', { replace: true });
    } catch (e: any) {
      // Refused while guests have open or upcoming bookings on it; the server says what to close first.
      setMsg({ ok: false, text: apiError(e, t('pd.delete_failed', 'Could not delete this listing.')) });
      setBusy(false);
    }
  };
  const unitLabel = (u: string) => t(`profile.unit_${u}`);
  const photoGoal = photoGoalFor(type);
  const photosNote = type === 'driver' ? 'hostProfile.photos_note_driver' : type === 'cafe' ? 'hostProfile.photos_note_cafe'
    : type === 'shop' ? 'hostProfile.photos_note_shop' : 'hostProfile.photos_note_homestay';
  const galleryHave = form.images.length;
  const galleryLabel = !photoGoal ? t('hostProfile.gallery') : `${t('hostProfile.gallery')} · ${galleryHave >= photoGoal
    ? t('hostProfile.gallery_done', '{{have}} photos ({{goal}} needed) ✓', { have: galleryHave, goal: photoGoal })
    : t('hostProfile.gallery_short', '{{have}} of {{goal}} needed', { have: galleryHave, goal: photoGoal })}`;

  // What each closed card says it holds, so the host sees the listing at a glance.
  const named = (rows: Priced[]) => rows.filter((r) => r.name.trim());
  const fromPrice = (rows: Priced[]) => {
    const prices = named(rows).map((r) => Number(r.price)).filter((p) => p > 0);
    return prices.length ? ` · ${t('host.from', 'From')} ₹${Math.min(...prices).toLocaleString('en-IN')}` : '';
  };
  const offers: Record<string, { title: string; note?: string; summary: string }> = {
    homestay: { title: t('hostProfile.rooms_food'), note: t('hostProfile.rooms_food_note'), summary: `${named(form.rooms).length} ${t('profile.rooms')}${fromPrice(form.rooms)}` },
    cafe: { title: t('hostProfile.menu'), note: t('hostProfile.menu_note'), summary: `${named(form.menu).length} ${t('hostProfile.menu')}${fromPrice(form.menu)}` },
    shop: { title: t('hostProfile.goods'), note: t('hostProfile.goods_note'), summary: `${named(form.goods).length} / ${MAX_GOODS}${fromPrice(form.goods)}` },
    guide: { title: `${t('hostProfile.services')} *`, summary: `${named(form.services).length}${fromPrice(form.services)}` },
    driver: { title: t('el.routes_covered'), note: t('el.routes_note'), summary: `${form.routes.length}` },
  };
  const offer = offers[type];

  const save = async () => {
    if (!form.title.trim() || !form.location.trim() || !form.description.trim()) {
      // Open Details (even if the host closed it again) and bring it into view.
      const details = document.getElementById('details') as HTMLDetailsElement | null;
      if (details) { details.open = true; details.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      setMsg({ ok: false, text: t('hostProfile.details_required', 'Add the name, place and a description under Details.') });
      return;
    }
    // Every room says how many people it sleeps: that is the most it takes, unless it has an extra mattress.
    if (type === 'homestay' && form.rooms.some((r) => r.name.trim() && !roomFit(r).occ)) {
      setMsg({ ok: false, text: t('hostProfile.rooms_need_sleeps') });
      return;
    }
    setBusy(true);
    setMsg(null);
    const num = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v));
    const profile: Record<string, unknown> = { images: form.images };
    if (type === 'homestay') {
      Object.assign(profile, {
        rooms: pricedPayload(form.rooms), meals: pricedPayload(form.meals), amenities: form.amenities,
        // Only labels for photos still in the gallery.
        photo_kinds: Object.fromEntries(Object.entries(form.photo_kinds).filter(([url, k]) => k && form.images.includes(url))),
      });
      // Rooms that say what they sleep decide the guest occupancy; otherwise the host's own number.
      const fromRooms = roomsCapacity(form.rooms);
      if (fromRooms > 0) profile.capacity = fromRooms;
      else if (num(form.capacity) !== undefined) profile.capacity = num(form.capacity);
    } else if (type === 'cafe' || type === 'shop') {
      if (type === 'cafe') Object.assign(profile, { menu: pricedPayload(form.menu), amenities: form.amenities });
      else profile.goods = pricedPayload(form.goods).slice(0, MAX_GOODS);
      profile.opening_hours = form.opening_hours.trim();
      if (num(form.capacity) !== undefined) profile.capacity = num(form.capacity);
    } else if (type === 'guide') {
      profile.services = pricedPayload(form.services);
    } else if (type === 'driver') {
      profile.routes = form.routes;
      if (num(form.seats) !== undefined) profile.seats = num(form.seats);
    }
    // A listing of the business's own type saves its offers through the profile save, which checks
    // every row and mirrors the first listing. A listing of another type (a homestay that also lists a
    // cafe) would be refused there ("menu" is not part of a homestay profile), so it saves them on
    // the listing itself, in one request, with the price its cheapest offer makes.
    const ownType = type === provider?.business_type;
    const offerRows = (type === 'homestay' ? profile.rooms : type === 'driver' ? null : profile[({ cafe: 'menu', shop: 'goods', guide: 'services' } as Record<string, string>)[type]]) as { price: number }[] | null | undefined;
    const offerFrom = type === 'driver' ? startingPriceFrom(form.routes)
      : Math.min(...(offerRows || []).map((r) => r.price).filter((n) => n > 0), Infinity);
    const price = Number.isFinite(offerFrom) && offerFrom > 0 ? offerFrom : form.price;
    try {
      await api.put(`/listings/${listing.id}`, {
        title: form.title.trim(),
        price,
        location: form.location.trim(),
        description: form.description.trim(),
        image: form.image,
        tags: type === 'homestay' ? form.tags : (listing.tags || []),
        extras: {
          ...(listing.extras || {}),
          ...(ownType ? {} : profile),
          address: form.address.trim(),
          ...(type === 'homestay' ? { tags: form.tags } : {}),
          ...(type === 'driver' ? { car_model: form.car_model.trim(), vehicle_type: form.vehicle_type } : {}),
        },
      });
      if (ownType) await api.patch('/providers/me', { listing_id: listing.id, profile });
      const fresh = await load();
      if (fresh) setForm(formFrom(fresh));
      // The first listing is mirrored on the profile, whose checklist reads it.
      await refreshProvider();
      setMsg({ ok: true, text: t('hostProfile.listing_saved', 'Saved. Travellers see the changes on this listing.') });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || e?.message || t('ui.providerProfile.could_not_save') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ag-wrap">
      <div className="ag-main pb-[calc(var(--page-cta-h)+24px)]" data-testid="listing-edit">
        <div>
          <p className="ag-host-typeline">{t(`ob.wz.t_${type}`, { defaultValue: type })}</p>
          <h1 className="ag-host-tabh">{listing.title}</h1>
          <p className="ag-small mt-3">{listing.location}</p>
          <ButtonLink to={`/listing/${listing.id}`} size="sm" className="mt-3" icon={<Eye />} data-testid="listing-view">{t('common.view')}</ButtonLink>
        </div>

        {/* This listing's own Taking bookings switch (the one the server checks), saved at once. */}
        <label className="ag-box ag-host-switch" data-testid="listing-taking">
          <span>
            <b>{t('host.taking', 'Taking bookings')}</b>
            <span className="ag-small">
              {/* As the dashboard's explainer reads it: "On this listing shows…", "Off it stays…". */}
              <b className={taking ? 'text-[var(--ok)]' : 'text-[var(--fail)]'}>{taking ? t('host.on', 'On') : t('host.off', 'Off')}</b>{' '}
              {taking ? t('host.tg_on', 'this listing shows to travellers and they can ask to book.') : t('host.tg_off', 'it stays on your website, but travellers cannot book it (full, closed for the season, or on a break).')}
            </span>
          </span>
          <input type="checkbox" role="switch" checked={taking} disabled={switching || busy} onChange={(e) => setTaking(e.target.checked)} data-testid="listing-taking-switch" />
        </label>

        <Fold title={t('hostProfile.details', 'Details')} summary={[form.title, form.location].filter(Boolean).join(' · ')} id="details" testid="listing-details">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <TextField label={t('lf.title')} value={form.title} onChange={(e) => set({ title: e.target.value })} data-testid="listing-title" />
            {/* A driver's price follows their cheapest route; others type one, which their cheapest priced offer replaces. */}
            {type !== 'driver' && (
              <TextField label={t('el.price')} type="number" min="0" max={MAX_PRICE} value={form.price}
                onChange={(e) => set({ price: Math.min(MAX_PRICE, Number(e.target.value) || 0) })} data-testid="listing-price" />
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('lf.location')} value={form.location} onChange={(e) => set({ location: e.target.value })} />
            <TextField label={t('el.address')} value={form.address} onChange={(e) => set({ address: e.target.value })} placeholder={t('el.address_ph')} />
          </div>
          <TextArea label={type === 'driver' ? t('el.driver_bio') : t('pd.description')} rows={4} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          {type === 'driver' && (
            <>
              <TextField label={t('el.car_model')} value={form.car_model} onChange={(e) => set({ car_model: e.target.value })} placeholder={t('el.car_model_ph')} />
              <div className="grid gap-2">
                <span className="text-sm font-medium text-[var(--ink-strong)]">{t('el.vehicle_type')}</span>
                <ChipToggleGroup options={VEHICLE_TYPES} selected={form.vehicle_type ? [form.vehicle_type] : []} onToggle={(v: string) => set({ vehicle_type: v })} />
              </div>
            </>
          )}
          {type === 'homestay' && (
            <div className="grid gap-2">
              <span className="text-sm font-medium text-[var(--ink-strong)]">{t('el.listing_tags')}</span>
              <ChipToggleGroup options={HOMESTAY_TAGS} selected={form.tags} onToggle={(tag: string) => set({ tags: toggleIn(form.tags, tag) })} />
            </div>
          )}
        </Fold>

        {offer && (
          <Fold title={offer.title} summary={offer.summary} id="prices" open={hash === 'prices' || hash === 'menu'} testid={`listing-${type}`}>
            {offer.note && <p className="ag-small -mt-2">{offer.note}</p>}
            {type === 'homestay' && (
              <>
                <div className="grid gap-2">
                  <span className="text-sm font-medium text-[var(--ink-strong)]">{t('profile.rooms')}</span>
                  <PricedEditor rows={form.rooms} onChange={(rooms) => set({ rooms })} units={['night']} unitLabel={unitLabel}
                    namePlaceholder={t('hostProfile.room_ph')} addLabel={t('hostProfile.add_room')} testid="profile-rooms" sleeps />
                </div>
                <div className="grid gap-2">
                  <span className="text-sm font-medium text-[var(--ink-strong)]">{t('profile.meals')}</span>
                  <PricedEditor rows={form.meals} onChange={(meals) => set({ meals })} units={['meal', 'day', 'head']} unitLabel={unitLabel}
                    namePlaceholder={t('hostProfile.meal_ph')} addLabel={t('hostProfile.add_meal')} testid="profile-meals" />
                </div>
                {/* Rooms that say what they sleep decide the guest occupancy; else the host types it. */}
                {roomsCapacity(form.rooms) > 0 ? (
                  <TextField label={t('hostProfile.capacity')} hint={t('hostProfile.capacity_from_rooms')} value={String(roomsCapacity(form.rooms))}
                    readOnly className="sm:max-w-[12rem]" data-testid="profile-capacity-rooms" />
                ) : (
                  <TextField label={t('hostProfile.capacity')} type="number" min={1} max={100} value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} className="sm:max-w-[12rem]" />
                )}
              </>
            )}
            {type === 'cafe' && (
              <PricedEditor rows={form.menu} onChange={(menu) => set({ menu })} units={MENU_UNITS} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.menu_ph')} addLabel={t('hostProfile.add_menu')} testid="profile-menu" />
            )}
            {type === 'shop' && (
              <PricedEditor rows={form.goods} onChange={(goods) => set({ goods })} units={GOODS_UNITS} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.goods_ph')} addLabel={t('hostProfile.add_goods')} testid="profile-goods"
                max={MAX_GOODS} fullNote={t('hostProfile.goods_full')} />
            )}
            {(type === 'cafe' || type === 'shop') && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label={t('hostProfile.opening_hours')} value={form.opening_hours} onChange={(e) => set({ opening_hours: e.target.value })} maxLength={120}
                  placeholder={t('hostProfile.opening_hours_ph')} data-testid="profile-opening-hours" />
                <TextField label={type === 'shop' ? t('hostProfile.capacity_shop') : t('hostProfile.capacity_cafe')} type="number" min={1} max={500}
                  value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} data-testid="profile-capacity" />
              </div>
            )}
            {type === 'guide' && (
              <PricedEditor rows={form.services} onChange={(services) => set({ services })} units={['day', 'trip', 'hour', 'person']} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.service_ph')} addLabel={t('hostProfile.add_service')} testid="profile-services" />
            )}
            {type === 'driver' && (
              <>
                {/* A pick, not typing: the server takes 1-30 (lib/hostProfile.ts). */}
                <SelectField label={t('hostProfile.seats')} value={String(form.seats ?? '')} onChange={(e) => set({ seats: e.target.value })}
                  className="sm:max-w-[16rem]" data-testid="profile-seats">
                  <option value="">{t('hostProfile.seats_pick', 'Choose')}</option>
                  {SEAT_OPTIONS.map((n) => <option key={n} value={String(n)}>{t('hostProfile.seats_n', { count: n })}</option>)}
                </SelectField>
                <RouteListEditor routes={form.routes} onChange={(routes: any) => set({ routes })} emptyNote={t('hostProfile.routes_empty')} />
                <div className="grid gap-2">
                  <span className="text-sm font-medium text-[var(--ink-strong)]">{t('hostProfile.routes')}</span>
                  <RouteFareTable routes={form.routes} onChange={(routes: any) => set({ routes })} emptyNote={t('hostProfile.routes_empty')} />
                </div>
              </>
            )}
          </Fold>
        )}

        {(type === 'homestay' || type === 'cafe') && (
          <Fold title={t('hostProfile.amenities')} summary={form.amenities.length ? String(form.amenities.length) : undefined} testid="listing-amenities">
            <AmenityPicker presets={type === 'homestay' ? HOMESTAY_AMENITIES : CAFE_AMENITIES} selected={form.amenities} onChange={(amenities: string[]) => set({ amenities })} />
          </Fold>
        )}

        <Fold id="photos" title={t('hostProfile.photos')} summary={galleryLabel} open={hash === 'photos'} testid="listing-photos">
          <p className="ag-small -mt-2">{photoGoal ? t(photosNote, { count: photoGoal }) : t('hostProfile.photos_note')}</p>
          <div className="grid gap-2">
            <span className="text-sm font-medium text-[var(--ink-strong)]">{t('hostProfile.cover')}</span>
            <div className="flex flex-wrap items-center gap-3">
              {form.image
                ? <img src={form.image} alt="" className="aspect-[16/9] w-44 rounded-[18px] border border-[var(--warmline)] object-cover" />
                : <div className="aspect-[16/9] w-44 rounded-[18px] border-2 border-dashed border-[var(--outline)]" />}
              <label className="ag-btn sm cursor-pointer">
                <Upload />
                <span>{uploading === 'cover' ? t('common.loading') : t('hostProfile.change_cover')}</span>
                <input type="file" accept="image/*" className="sr-only" onChange={uploadCover} />
              </label>
            </div>
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium text-[var(--ink-strong)]">{galleryLabel}</span>
            <GalleryUploader images={form.images} uploading={uploading === 'images'} onFilesSelected={uploadGallery}
              onRemove={(i) => setForm((f) => (f ? { ...f, images: f.images.filter((_, j) => j !== i) } : f))}
              {...(type === 'homestay' ? {
                kinds: form.photo_kinds,
                onKind: (url: string, kind: string) => setForm((f) => (f ? { ...f, photo_kinds: { ...f.photo_kinds, [url]: kind } } : f)),
              } : {})} />
            {type === 'homestay' && <span className="text-xs text-[var(--ink-muted)]">{t('photoKind.hint')}</span>}
          </div>
        </Fold>

        {/* Removing the listing (it used to be on My Listings). The server refuses while guests have open bookings on it. */}
        <Button variant="stop" className="self-start" onClick={remove} disabled={busy || switching} data-testid="listing-delete">{t('common.delete')}</Button>
      </div>

      {/* Save, in the same bar as the profile's, above the tab bar. */}
      <div ref={saveBarRef} className="ag-bookbar ag-host-savebar" data-testid="listing-savebar">
        <div className="ag-wrap">
          {msg?.ok ? (
            <div className="ag-host-saverow" data-testid="listing-saved-actions">
              <p className="msg text-[var(--ok)]">{msg.text}</p>
              <Button variant="text" onClick={() => setMsg(null)}>{t('ui.providerProfile.keep_editing')}</Button>
              <ButtonLink to="/provider/profile" go>{t('hostProfile.title')}</ButtonLink>
            </div>
          ) : (
            <>
              <p className={`msg ${msg ? 'text-[var(--fail)]' : 'text-[var(--ink-muted)]'}`} role={msg ? 'alert' : undefined} data-testid="listing-msg">
                {msg ? msg.text : t('hostProfile.save_hint')}
              </p>
              <Button variant="primary" go onClick={save} disabled={busy || switching || !!uploading} data-testid="listing-save">{busy ? t('common.loading') : t('listing.save', 'Save')}</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
