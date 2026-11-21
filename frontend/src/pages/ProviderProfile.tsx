import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { missingLabel } from '@/lib/serverText';
import { photoGoalFor } from '@/lib/photoGoal';
import { MagnifyingGlass, Eye, X, VideoCamera, Check } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import EditListingModal from '@/components/provider/dashboard/EditListingModal';
import ListingFormModal from '@/components/ListingFormModal';
import SignOutButton from '@/components/SignOutButton';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { uploadImage, uploadImages } from '@/lib/uploadImage';
import AvatarUploader from '@/components/provider/AvatarUploader';
import GalleryUploader from '@/components/provider/GalleryUploader';
import AmenityPicker from '@/components/provider/AmenityPicker';
import { RouteFareTable } from '@/components/provider/RouteEditor';
import { HOMESTAY_AMENITIES, CAFE_AMENITIES } from '@/constants/listingOptions';
import PricedEditor, { type Priced } from '@/components/provider/PricedEditor';
import { roomFit, roomsCapacity } from '@/lib/roomFit';
import OwnersSection from '@/components/provider/OwnersSection';
import HostMiniSite, { type MiniSiteData } from '@/components/provider/HostMiniSite';
import { useSeo } from '@/components/Seo';
import { Box, Button, ButtonLink, Chip, Chips, IconButton, SelectField, TextArea, TextField } from '@/components/ag';

/**
 * The host's business profile: everything Studio1947's lists ask of a driver, a homestay, a
 * guide, a cafe and a local shop, on one page, saved through PATCH /providers/me (`profile`), which checks each field and
 * copies it onto the listing travellers see (backend lib/hostProfile.ts). The app has the same
 * screen (app/provider/profile.tsx).
 *
 * The items a new host must have before their documents can go for approval are listed at the
 * top, from the server's `profile_missing`, so the page and the server never disagree.
 */

const GUIDE_TYPES = ['trekking', 'heritage', 'nature', 'birding', 'tea', 'cultural', 'city', 'photography'];
const SEASONS = ['spring', 'summer', 'monsoon', 'autumn', 'winter'];
const SOCIAL = ['instagram', 'facebook', 'youtube', 'website'] as const;
const MENU_UNITS = ['plate', 'item', 'cup', 'head'];
const GOODS_UNITS = ['item', 'piece', 'kg', 'gram', 'litre', 'pack', 'dozen'];
const MAX_GOODS = 10;

/** One panel of the form: a Box with its h2 and an optional note. */
function Section({ title, note, children, testid, id }: { title: string; note?: string; children: React.ReactNode; testid?: string; id?: string }) {
  return (
    <Box as="section" id={id} data-testid={testid} className={id ? 'scroll-mt-20' : undefined}>
      <div>
        <h2>{title}</h2>
        {note && <p className="ag-small">{note}</p>}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4">{children}</div>
    </Box>
  );
}

/** A labelled group for controls that are not a single field (chips, priced rows, uploads). */
function Group({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium text-[var(--ink-strong)]">{label}</span>
      {children}
      {hint && <span className="text-xs text-[var(--ink-muted)]">{hint}</span>}
    </div>
  );
}

function Toggle({ on, onChange, label, note, testid }: { on: boolean; onChange: (v: boolean) => void; label: string; note?: string; testid?: string }) {
  // The prototype's label.switch: title and note on the left, a 52x32 switch on the right.
  return (
    <label className="ag-host-switch">
      <span>
        <b>{label}</b>
        {note && <span className="ag-small">{note}</span>}
      </span>
      <input type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} data-testid={testid} />
    </label>
  );
}

function MultiChips({ options, selected, onChange, label }: { options: string[]; selected: string[]; onChange: (v: string[]) => void; label: (o: string) => string }) {
  return (
    <Chips>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Chip key={o} on={on} onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}>
            {on && <Check weight="bold" aria-hidden="true" />}{label(o)}
          </Chip>
        );
      })}
    </Chips>
  );
}

/** Pick up to ten driver listings to recommend to guests. */
function DriverPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    api.get('/listings?type=driver').then((r) => setDrivers(r.data.items || [])).catch(() => setDrivers([]));
  }, []);
  const shown = drivers.filter((d) => !q || `${d.title} ${d.location}`.toLowerCase().includes(q.toLowerCase())).slice(0, 12);
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : selected.length < 10 ? [...selected, id] : selected);
  return (
    <div className="grid gap-2.5" data-testid="recommended-drivers">
      <label className="relative">
        <MagnifyingGlass size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hostProfile.find_driver')} aria-label={t('hostProfile.find_driver')} className="ag-in !pl-12" />
      </label>
      <Chips>
        {shown.map((d) => {
          const on = selected.includes(d.id);
          return (
            <Chip key={d.id} on={on} onClick={() => toggle(d.id)} className="max-w-full">
              {on && <Check weight="bold" aria-hidden="true" />}<span className="truncate">{d.title} · {d.location}</span>
            </Chip>
          );
        })}
      </Chips>
      <p className="ag-small">{t('hostProfile.drivers_selected', { count: selected.length })}</p>
    </div>
  );
}

export default function ProviderProfile() {
  const { t } = useTranslation();
  useSeo({ title: t('hostProfile.title') });
  const nav = useNavigate();
  const { user, loading: authLoading, provider, refreshProvider } = useAuth();

  const [p, setP] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [stats, setStats] = useState<{ review_count?: number; average_rating?: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [myListings, setMyListings] = useState<any[]>([]);
  const [editListing, setEditListing] = useState<any>(null);
  const [addListing, setAddListing] = useState(false);
  const loadListings = () => api.get('/bookings/provider').then((r) => setMyListings(r.data.listings || [])).catch(() => setMyListings([]));
  useEffect(() => { loadListings(); }, []);
  useEffect(() => { api.get('/providers/me/stats').then((r) => setStats(r.data)).catch(() => setStats(null)); }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login?next=/provider/profile'); return; }
    if (user.role !== 'provider') { nav('/provider/onboard'); }
  }, [authLoading, user, nav]);

  // Signing in from "List your business" makes the account a host before any business is saved.
  // With no business there is no profile to show: go to setup instead of "Loading…" for ever.
  const [loadFailed, setLoadFailed] = useState(false);
  const checkBusiness = React.useCallback(() => {
    setLoadFailed(false);
    api.get('/providers/me')
      .then((r) => { if (!r.data?.provider) nav('/provider/onboard', { replace: true }); else refreshProvider(); })
      .catch((e) => { if (e?.response?.status === 404) nav('/provider/onboard', { replace: true }); else setLoadFailed(true); });
  }, [nav, refreshProvider]);
  useEffect(() => {
    if (authLoading || user?.role !== 'provider' || provider) return;
    checkBusiness();
  }, [authLoading, user?.role, provider, checkBusiness]);

  useEffect(() => {
    if (!provider) return;
    const e = provider.extras || {};
    const priced = (rows: any[] | undefined, nameKey = 'name', unit = 'day'): Priced[] =>
      (Array.isArray(rows) ? rows : []).map((r) => ({
        name: String(r?.[nameKey] ?? r?.name ?? ''), price: Number(r?.price) || '', unit: r?.unit || unit, ...(r?.photo ? { photo: String(r.photo) } : {}),
        // A homestay room's size and extra mattress (lib/roomFit.ts), kept so a save does not drop them.
        ...(Number(r?.occ) > 0 ? { occ: Number(r.occ), extra_beds: Number(r?.extra_beds) || 0, extra_bed_price: Number(r?.extra_bed_price) || '' } : {}),
      }));
    setP(provider);
    setForm({
      business_name: provider.business_name || '',
      contact_phone: provider.contact_phone || '',
      cover: (provider.images || [])[0] || '',
      host_avatar: e.host_avatar || '',
      host_name: e.host_name || '',
      whatsapp: e.whatsapp || '',
      available: e.available !== false,
      languages: (Array.isArray(e.languages) ? e.languages : []).join(', '),
      experience_years: e.experience_years ?? '',
      host_bio: e.host_bio || '',
      intro_video: e.intro_video || '',
      social: { ...(e.social || {}) },
      images: Array.isArray(e.images) ? e.images : [],
      photo_kinds: e.photo_kinds && typeof e.photo_kinds === 'object' ? e.photo_kinds : {},
      // driver
      vehicle_number: e.vehicle_number || '',
      license_number: e.license_number || '',
      seats: e.seats ?? '',
      routes: Array.isArray(e.routes) ? e.routes : [],
      // homestay
      rooms: priced(e.rooms, 'name', 'night'),
      meals: priced(e.meals, 'name', 'meal'),
      capacity: e.capacity ?? '',
      amenities: Array.isArray(e.amenities) ? e.amenities : [],
      recommended_drivers: Array.isArray(e.recommended_drivers) ? e.recommended_drivers : [],
      home_delivery: e.home_delivery === true,
      // guide
      age: e.age ?? '',
      gender: e.gender || '',
      guide_types: Array.isArray(e.guide_types) ? e.guide_types : [],
      services: priced(e.services, 'name', 'day'),
      seasons: Array.isArray(e.seasons) ? e.seasons : [],
      // cafe and shop
      menu: priced(e.menu, 'name', 'plate'),
      goods: priced(e.goods, 'name', 'item'),
      shop_kind: e.shop_kind || '',
      opening_hours: e.opening_hours || '',
    });
  }, [provider]);

  // The dashboard's Menu button links to /provider/profile#menu: once the form is drawn, bring the
  // cafe menu or the shop's goods into view (once, so later edits do not jump the page).
  const location = useLocation();
  const scrolledToHash = useRef(false);
  useEffect(() => {
    if (!form || scrolledToHash.current || location.hash !== '#menu') return;
    scrolledToHash.current = true;
    window.requestAnimationFrame(() => document.getElementById('menu')?.scrollIntoView({ block: 'start' }));
  }, [form, location.hash]);

  const type: string = p?.business_type || '';
  const missing: { key: string; label: string; min?: number; have?: number }[] = p?.profile_missing || [];
  const updateForm = (updater: (current: any) => any) => {
    // Once a host makes another edit, the previous success state is no longer current.
    // Restore the save action immediately, including on the mobile layout.
    setMsg((current) => current?.ok ? null : current);
    setForm(updater);
  };
  const set = (patch: any) => updateForm((f: any) => ({ ...f, ...patch }));

  const upload = (field: 'cover' | 'host_avatar') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(field);
    try { set({ [field]: await uploadImage(file) }); }
    catch (err) { setMsg({ ok: false, text: typeof err === 'string' ? err : t('kyc.uploadFailed') }); }
    finally { setUploading(null); }
  };
  // The intro video is an uploaded file travellers play on the page, not a link.
  const uploadVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setMsg({ ok: false, text: t('hostProfile.video_too_big') }); return; }
    setUploading('video');
    try {
      const { data } = await api.post('/providers/me/intro-video', file, { headers: { 'Content-Type': file.type || 'video/mp4' } });
      set({ intro_video: data.url });
    } catch (err: any) {
      setMsg({ ok: false, text: err?.response?.data?.detail || t('hostProfile.video_failed') });
    } finally {
      setUploading(null);
    }
  };

  const uploadGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading('images');
    try { const urls = await uploadImages(files); updateForm((f: any) => ({ ...f, images: [...f.images, ...urls] })); }
    catch (err) { setMsg({ ok: false, text: typeof err === 'string' ? err : t('kyc.uploadFailed') }); }
    finally { setUploading(null); }
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
    const priced = (rows: Priced[]) => rows.filter((r) => r.name.trim()).map((r) => {
      const fit = roomFit(r);
      return {
        name: r.name.trim(), price: Number(r.price) || 0, unit: r.unit, ...(r.photo ? { photo: r.photo } : {}),
        ...(fit.occ ? { occ: fit.occ } : {}),
        ...(fit.extraBeds ? { extra_beds: fit.extraBeds, ...(fit.extraBedPrice ? { extra_bed_price: fit.extraBedPrice } : {}) } : {}),
      };
    });
    const profile: Record<string, unknown> = {
      host_avatar: form.host_avatar,
      whatsapp: form.whatsapp.trim(),
      available: form.available,
      languages: form.languages.split(',').map((s: string) => s.trim()).filter(Boolean),
      host_bio: form.host_bio,
      intro_video: form.intro_video.trim(),
      social: Object.fromEntries(SOCIAL.map((k) => [k, (form.social[k] || '').trim()]).filter(([, v]) => v)),
      images: form.images,
    };
    if (num(form.experience_years) !== undefined) profile.experience_years = num(form.experience_years);
    if (type === 'driver') {
      Object.assign(profile, { vehicle_number: form.vehicle_number.trim(), license_number: form.license_number.trim(), routes: form.routes });
      if (num(form.seats) !== undefined) profile.seats = num(form.seats);
    } else if (type === 'homestay') {
      Object.assign(profile, {
        host_name: form.host_name.trim(), rooms: priced(form.rooms), meals: priced(form.meals),
        amenities: form.amenities, recommended_drivers: form.recommended_drivers,
        // Only labels for photos still in the gallery.
        photo_kinds: Object.fromEntries(Object.entries(form.photo_kinds || {}).filter(([url, k]) => k && form.images.includes(url))),
      });
      // Rooms that say what they sleep decide the guest occupancy; otherwise the host's own number.
      const fromRooms = roomsCapacity(form.rooms);
      if (fromRooms > 0) profile.capacity = fromRooms;
      else if (num(form.capacity) !== undefined) profile.capacity = num(form.capacity);
    } else if (type === 'guide') {
      Object.assign(profile, { host_name: form.host_name.trim(), guide_types: form.guide_types, services: priced(form.services), seasons: form.seasons });
      if (form.gender) profile.gender = form.gender;
      if (num(form.age) !== undefined) profile.age = num(form.age);
    } else if (type === 'cafe') {
      Object.assign(profile, {
        host_name: form.host_name.trim(), menu: priced(form.menu), amenities: form.amenities,
        recommended_drivers: form.recommended_drivers, home_delivery: form.home_delivery,
      });
    } else if (type === 'shop') {
      Object.assign(profile, {
        host_name: form.host_name.trim(), shop_kind: form.shop_kind.trim(), goods: priced(form.goods).slice(0, MAX_GOODS),
        recommended_drivers: form.recommended_drivers, home_delivery: form.home_delivery,
      });
    }
    if ((type === 'cafe' || type === 'shop') && num(form.capacity) !== undefined) profile.capacity = num(form.capacity);
    if (type === 'cafe' || type === 'shop') profile.opening_hours = (form.opening_hours || '').trim();
    const body: Record<string, unknown> = { profile };
    if (form.business_name.trim() && form.business_name.trim() !== p.business_name) body.business_name = form.business_name.trim();
    if (form.contact_phone.trim() && form.contact_phone.trim() !== p.contact_phone) body.contact_phone = form.contact_phone.trim();
    if (form.cover && form.cover !== (p.images || [])[0]) body.cover_image = form.cover;
    try {
      const { data } = await api.patch('/providers/me', body);
      setP((prev: any) => ({ ...prev, ...data.provider }));
      await refreshProvider();
      setMsg({ ok: true, text: t('hostProfile.saved') });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || e.message || t('ui.providerProfile.could_not_save') });
    } finally {
      setBusy(false);
    }
  };

  // Matches the server's missingMandatory: 6 car photos; 8 photos for a homestay, cafe or shop.
  const photoGoal = photoGoalFor(type);
  const photosNote = type === 'driver' ? 'hostProfile.photos_note_driver' : type === 'cafe' ? 'hostProfile.photos_note_cafe'
    : type === 'shop' ? 'hostProfile.photos_note_shop' : 'hostProfile.photos_note_homestay';
  // "Gallery · 11 photos (8 needed) ✓", or "Gallery · 3 of 8 needed" while short.
  const galleryHave = form?.images?.length || 0;
  const galleryLabel = !photoGoal ? t('hostProfile.gallery') : `${t('hostProfile.gallery')} · ${galleryHave >= photoGoal
    ? t('hostProfile.gallery_done', '{{have}} photos ({{goal}} needed) ✓', { have: galleryHave, goal: photoGoal })
    : t('hostProfile.gallery_short', '{{have}} of {{goal}} needed', { have: galleryHave, goal: photoGoal })}`;
  const nameLabel = type === 'homestay' ? t('hostProfile.property_name') : type === 'guide' ? t('hostProfile.business_name_guide') : t('hostProfile.business_name');
  const unitLabel = (u: string) => t(`profile.unit_${u}`);

  if (!form) {
    if (loadFailed) {
      return (
        <div className="ag-wrap"><div className="ag-main" data-testid="profile-load-failed">
          <p className="ag-small">{t('ui.providerProfile.load_failed', 'Could not open your business profile. Check your connection.')}</p>
          <Button onClick={checkBusiness}>{t('common.retry', 'Try again')}</Button>
        </div></div>
      );
    }
    return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;
  }

  const previewItems = (): MiniSiteData['items'] => {
    const rows = (list: Priced[]) => list.filter((r) => r.name.trim()).map((r) => ({ name: r.name, price: Number(r.price) || 0, unit: r.unit, photo: r.photo }));
    if (type === 'driver') return (form.routes || []).map((r: any) => ({ name: r.route || r.name || '', price: Number(r.price) || 0, unit: r.unit || 'trip', photo: r.photo })).filter((r: any) => r.name);
    if (type === 'homestay') return [...rows(form.rooms), ...rows(form.meals)];
    if (type === 'guide') return rows(form.services);
    if (type === 'cafe') return rows(form.menu);
    if (type === 'shop') return rows(form.goods);
    return [];
  };
  const preview: MiniSiteData = {
    type,
    name: form.business_name,
    hostName: form.host_name,
    avatar: form.host_avatar,
    cover: form.cover,
    verified: !!p?.badges?.verified,
    member: !!p?.badges?.member,
    slug: p?.slug,
    experienceYears: Number(form.experience_years) || 0,
    joinedAt: p?.created_at,
    rating: stats?.average_rating ?? null,
    reviewCount: stats?.review_count ?? 0,
    location: p?.location,
    about: form.host_bio,
    video: form.intro_video,
    languages: String(form.languages || '').split(',').map((x: string) => x.trim()).filter(Boolean),
    items: previewItems(),
    gallery: form.images,
    available: form.available,
    homeDelivery: form.home_delivery && (type === 'cafe' || type === 'shop'),
  };

  return (
    <div className="ag-wrap">
      <div className="ag-main" data-testid="provider-profile">
        <div>
          <p className="ag-host-typeline">{t(`ob.wz.t_${type}`, { defaultValue: type })}</p>
          <h1 className="ag-host-tabh">{t('hostProfile.title')}</h1>
          <p className="ag-small mt-3">{t('hostProfile.subtitle')}</p>
        </div>

        {missing.length > 0 ? (
          <Box tone="blush" className="ag-host-need" data-testid="profile-missing">
            <h2>{t('hostProfile.required_title')}</h2>
            <ul>
              {missing.map((m) => <li key={m.key}><span className="d" aria-hidden="true">•</span>{missingLabel(t, m, p?.business_type)}</li>)}
            </ul>
            <p className="ag-small">{t('hostProfile.required_note')}</p>
          </Box>
        ) : (
          <Box flat className="!flex-row items-center !gap-2" data-testid="profile-complete">
            <Icon name="check" className="flex-none text-[var(--ok)]" />
            <span className="text-sm text-[var(--ink-strong)]">{t('hostProfile.required_done')}</span>
          </Box>
        )}

        <Box as="section" className="ag-host-switches">
          <Toggle on={form.available} onChange={(v) => set({ available: v })} testid="profile-available"
            label={t('hostProfile.available_on')}
            note={t('hostProfile.available_note')} />
          {(type === 'cafe' || type === 'shop') && (
            <div>
              <Toggle on={form.home_delivery} onChange={(v) => set({ home_delivery: v })} testid="profile-home-delivery"
                label={type === 'shop' ? t('hostProfile.home_delivery_shop') : t('hostProfile.home_delivery')}
                note={type === 'shop' ? t('hostProfile.home_delivery_shop_note') : t('hostProfile.home_delivery_cafe_note')} />
            </div>
          )}
        </Box>

        <Section title={t('hostProfile.about_you')}>
          <AvatarUploader src={form.host_avatar} initial={(form.host_name || form.business_name || '?').charAt(0).toUpperCase()}
            uploading={uploading === 'host_avatar'} onFileSelected={upload('host_avatar')}
            label={type === 'homestay' ? t('hostProfile.owner_photo') : t('hostProfile.your_photo')} />
          <TextField label={nameLabel} value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} />
          {type === 'shop' && (
            <TextField label={t('hostProfile.shop_kind')} value={form.shop_kind} onChange={(e) => set({ shop_kind: e.target.value })}
              placeholder={t('hostProfile.shop_kind_ph')} data-testid="profile-shop-kind" />
          )}
          {(type === 'homestay' || type === 'guide' || type === 'cafe' || type === 'shop') && (
            <TextField label={type === 'homestay' ? `${t('hostProfile.host_name')} *` : type === 'guide' ? t('hostProfile.your_name') : `${t('hostProfile.owner_name')} *`}
              value={form.host_name} onChange={(e) => set({ host_name: e.target.value })} data-testid="profile-host-name" />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('hostProfile.phone')} value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} inputMode="tel" />
            <TextField label={t('hostProfile.whatsapp')} hint={t('hostProfile.whatsapp_hint')} value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} inputMode="tel" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('hostProfile.languages')} hint={t('hostProfile.languages_hint')} value={form.languages} onChange={(e) => set({ languages: e.target.value })} />
            <TextField label={t('hostProfile.experience')} type="number" min={0} max={80} value={form.experience_years} onChange={(e) => set({ experience_years: e.target.value })} />
          </div>
          {type === 'guide' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t('hostProfile.age')} type="number" min={18} max={90} value={form.age} onChange={(e) => set({ age: e.target.value })} />
              <SelectField label={t('hostProfile.gender')} value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
                <option value="">—</option>
                {['male', 'female', 'other'].map((g) => <option key={g} value={g}>{t(`profile.gender_${g}`)}</option>)}
              </SelectField>
            </div>
          )}
          <TextArea label={t('hostProfile.bio')} rows={4} value={form.host_bio} onChange={(e) => set({ host_bio: e.target.value })} />
          <div data-testid="profile-video">
            <Group label={t('hostProfile.video')} hint={t('hostProfile.video_hint')}>
              {form.intro_video && /\.(mp4|mov|webm)(\?|$)|\/videos\//i.test(form.intro_video) ? (
                <video src={form.intro_video} controls playsInline preload="metadata" className="aspect-video w-full max-w-sm rounded-[18px] bg-black" />
              ) : form.intro_video ? (
                <a href={form.intro_video} target="_blank" rel="noreferrer" className="ag-seeall self-start">{t('hostProfile.video_old_link')}</a>
              ) : null}
              <div className="ag-row">
                {/* A label styled as a small button, so the file picker opens from it. */}
                <label className="ag-btn sm cursor-pointer">
                  <VideoCamera />
                  <span>{uploading === 'video' ? t('hostProfile.video_uploading') : form.intro_video ? t('hostProfile.video_replace') : t('hostProfile.video_upload')}</span>
                  <input type="file" accept="video/mp4,video/quicktime,video/webm" className="sr-only" onChange={uploadVideo} data-testid="profile-video-input" />
                </label>
                {form.intro_video && (
                  <Button variant="stop" size="sm" onClick={() => set({ intro_video: '' })}>{t('hostProfile.video_remove')}</Button>
                )}
              </div>
            </Group>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {SOCIAL.map((k) => (
              <TextField key={k} label={t(`profile.social_${k}`)} value={form.social[k] || ''}
                onChange={(e) => set({ social: { ...form.social, [k]: e.target.value } })} placeholder={k === 'website' ? 'https://' : '@'} />
            ))}
          </div>
        </Section>

        {/* provider.js "Your properties" / "Your vehicles": each listing with Edit, and Add. */}
        <Box as="section" className="ag-host-props" data-testid="profile-properties">
          <h2>{type === 'driver' ? t('host.your_vehicles', 'Your vehicles') : t('host.your_properties', 'Your properties')}</h2>
          {myListings.map((l) => (
            <div key={l.id} className="row">
              <span className="min-w-0">
                <b>{l.title}</b>
                <span className="ag-small">{l.location}{Number(l.price) > 0 ? ` · ${t('host.from', 'From')} ₹${Number(l.price).toLocaleString('en-IN')}` : ''}</span>
              </span>
              <Button variant="text" onClick={() => setEditListing(l)}>{t('common.edit')}</Button>
            </div>
          ))}
          <Button className="self-start" icon={<Icon name={type === 'driver' ? 'car' : 'home'} />} onClick={() => setAddListing(true)}>
            {type === 'driver' ? t('host.add_vehicle', 'Add a vehicle') : t('host.add_property', 'Add a property')}
          </Button>
        </Box>

        {type === 'driver' && (
          <Section title={t('hostProfile.vehicle')} testid="profile-driver">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField label={t('hostProfile.vehicle_number')} value={form.vehicle_number} onChange={(e) => set({ vehicle_number: e.target.value })} placeholder="WB 74 A 1234" />
              <TextField label={t('hostProfile.license_number')} value={form.license_number} onChange={(e) => set({ license_number: e.target.value })} />
              <TextField label={t('hostProfile.seats')} type="number" min={1} max={30} value={form.seats} onChange={(e) => set({ seats: e.target.value })} />
            </div>
            <p className="ag-small">{t('hostProfile.vehicle_docs_note')}</p>
            <Group label={t('hostProfile.routes')}>
              <RouteFareTable routes={form.routes} onChange={(routes: any) => set({ routes })} emptyNote={t('hostProfile.routes_empty')} />
            </Group>
          </Section>
        )}

        {type === 'homestay' && (
          <Section title={t('hostProfile.rooms_food')} note={t('hostProfile.rooms_food_note')} testid="profile-homestay">
            <Group label={t('profile.rooms')}>
              <PricedEditor rows={form.rooms} onChange={(rooms) => set({ rooms })} units={['night', 'head']} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.room_ph')} addLabel={t('hostProfile.add_room')} testid="profile-rooms" sleeps />
            </Group>
            <Group label={t('profile.meals')}>
              <PricedEditor rows={form.meals} onChange={(meals) => set({ meals })} units={['meal', 'day', 'head']} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.meal_ph')} addLabel={t('hostProfile.add_meal')} testid="profile-meals" />
            </Group>
            {/* Rooms that say what they sleep decide the guest occupancy (saved with the profile); else the host types it. */}
            {roomsCapacity(form.rooms) > 0 ? (
              <TextField label={t('hostProfile.capacity')} hint={t('hostProfile.capacity_from_rooms')} value={String(roomsCapacity(form.rooms))}
                readOnly className="sm:max-w-[12rem]" data-testid="profile-capacity-rooms" />
            ) : (
              <TextField label={t('hostProfile.capacity')} type="number" min={1} max={100} value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} className="sm:max-w-[12rem]" />
            )}
            <Group label={t('hostProfile.amenities')}>
              <AmenityPicker presets={HOMESTAY_AMENITIES} selected={form.amenities} onChange={(amenities: string[]) => set({ amenities })} />
            </Group>
            <Group label={t('hostProfile.recommended_drivers')}>
              <DriverPicker selected={form.recommended_drivers} onChange={(recommended_drivers) => set({ recommended_drivers })} />
            </Group>
          </Section>
        )}

        {type === 'guide' && (
          <Section title={t('hostProfile.guiding')} testid="profile-guide">
            <Group label={t('hostProfile.guide_type')}>
              <MultiChips options={GUIDE_TYPES} selected={form.guide_types} onChange={(guide_types) => set({ guide_types })} label={(o) => t(`profile.guide_type_${o}`)} />
            </Group>
            <Group label={`${t('hostProfile.services')} *`}>
              <PricedEditor rows={form.services} onChange={(services) => set({ services })} units={['day', 'trip', 'hour', 'person']} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.service_ph')} addLabel={t('hostProfile.add_service')} testid="profile-services" />
            </Group>
            <Group label={t('hostProfile.seasons')}>
              <MultiChips options={SEASONS} selected={form.seasons} onChange={(seasons) => set({ seasons })} label={(o) => t(`profile.season_${o}`)} />
            </Group>
          </Section>
        )}

        {type === 'cafe' && (
          <Section title={t('hostProfile.menu')} note={t('hostProfile.menu_note')} testid="profile-cafe" id="menu">
            <PricedEditor rows={form.menu} onChange={(menu) => set({ menu })} units={MENU_UNITS} unitLabel={unitLabel}
              namePlaceholder={t('hostProfile.menu_ph')} addLabel={t('hostProfile.add_menu')} testid="profile-menu" />
            <Group label={t('hostProfile.amenities')}>
              <AmenityPicker presets={CAFE_AMENITIES} selected={form.amenities} onChange={(amenities: string[]) => set({ amenities })} />
            </Group>
            <TextField label={t('hostProfile.opening_hours')} value={form.opening_hours || ''} onChange={(e) => set({ opening_hours: e.target.value })} maxLength={120}
              placeholder={t('hostProfile.opening_hours_ph')} data-testid="profile-opening-hours" />
            <TextField label={t('hostProfile.capacity_cafe')} type="number" min={1} max={500} value={form.capacity} onChange={(e) => set({ capacity: e.target.value })}
              className="sm:max-w-[12rem]" data-testid="profile-capacity" />
            <Group label={t('hostProfile.recommended_drivers')}>
              <DriverPicker selected={form.recommended_drivers} onChange={(recommended_drivers) => set({ recommended_drivers })} />
            </Group>
          </Section>
        )}

        {type === 'shop' && (
          <Section title={t('hostProfile.goods')} note={t('hostProfile.goods_note')} testid="profile-shop" id="menu">
            <PricedEditor rows={form.goods} onChange={(goods) => set({ goods })} units={GOODS_UNITS} unitLabel={unitLabel}
              namePlaceholder={t('hostProfile.goods_ph')} addLabel={t('hostProfile.add_goods')} testid="profile-goods"
              max={MAX_GOODS} fullNote={t('hostProfile.goods_full')} />
            <TextField label={t('hostProfile.opening_hours')} value={form.opening_hours || ''} onChange={(e) => set({ opening_hours: e.target.value })} maxLength={120}
              placeholder={t('hostProfile.opening_hours_ph')} data-testid="profile-opening-hours" />
            <TextField label={t('hostProfile.capacity_shop')} type="number" min={1} max={500} value={form.capacity} onChange={(e) => set({ capacity: e.target.value })}
              className="sm:max-w-[12rem]" data-testid="profile-capacity" />
            <Group label={t('hostProfile.recommended_drivers')}>
              <DriverPicker selected={form.recommended_drivers} onChange={(recommended_drivers) => set({ recommended_drivers })} />
            </Group>
          </Section>
        )}

        <Section title={t('hostProfile.photos')} note={photoGoal ? t(photosNote, { count: photoGoal }) : t('hostProfile.photos_note')}>
          <Group label={t('hostProfile.cover')}>
            <div className="flex flex-wrap items-center gap-3">
              {form.cover
                ? <img src={form.cover} alt="" className="aspect-[16/9] w-44 rounded-[18px] border border-[var(--warmline)] object-cover" />
                : <div className="aspect-[16/9] w-44 rounded-[18px] border-2 border-dashed border-[var(--outline)]" />}
              <label className="ag-btn sm cursor-pointer">
                <span>{uploading === 'cover' ? t('common.loading') : t('hostProfile.change_cover')}</span>
                <input type="file" accept="image/*" className="sr-only" onChange={upload('cover')} />
              </label>
            </div>
          </Group>
          <Group label={galleryLabel} hint={type === 'homestay' ? t('photoKind.hint') : undefined}>
            <GalleryUploader images={form.images} uploading={uploading === 'images'} onFilesSelected={uploadGallery}
              onRemove={(i) => updateForm((f: any) => ({ ...f, images: f.images.filter((_: string, j: number) => j !== i) }))}
              {...(type === 'homestay' ? {
                kinds: form.photo_kinds,
                onKind: (url: string, kind: string) => updateForm((f: any) => ({ ...f, photo_kinds: { ...f.photo_kinds, [url]: kind } })),
              } : {})} />
          </Group>
        </Section>

        <OwnersSection onLeft={async () => { await refreshProvider(); nav('/'); }} />

        {/* Save, as the prototype's "Save profile" button, with what happened next to it. */}
        <div className="ag-host-saverow">
          {msg?.ok ? (
            <div className="ag-host-saverow" data-testid="profile-saved-actions">
              <p className="msg text-[var(--ok)]">{msg.text}</p>
              <Button variant="text" onClick={() => setMsg(null)}>{t('ui.providerProfile.keep_editing')}</Button>
              <ButtonLink to="/provider/dashboard" go>{t('hostProfile.back_dashboard')}</ButtonLink>
            </div>
          ) : (
            <>
              <Button onClick={save} disabled={busy} data-testid="profile-save">{busy ? t('common.loading') : t('hostProfile.save')}</Button>
              <p className={`msg ${msg ? 'text-[var(--fail)]' : 'text-[var(--ink-muted)]'}`} role={msg ? 'alert' : undefined} data-testid="profile-msg">
                {msg ? msg.text : t('hostProfile.save_hint')}
              </p>
            </>
          )}
        </div>

        {/* The prototype's "Live preview" card; tapping it opens the full page preview. */}
        <button type="button" className="ag-box ag-host-preview" onClick={() => setShowPreview(true)} data-testid="profile-preview-open">
          <span className="ag-eyebrow">{t('miniSite.preview_title')}</span>
          {p?.page_path && <span className="url">{`${window.location.host}${p.page_path}`}</span>}
          <h2>{form.business_name}</h2>
          <span className="ag-small">{t(`ob.wz.t_${type}`, { defaultValue: type })} · {p?.location}</span>
          {p?.created_at && <span className="ag-small">{t('host.joined', 'Joined aangan {{date}}', { date: new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) })}</span>}
          <span className={`ag-host-tag${p?.badges?.verified ? ' ok' : ''}`}>{p?.badges?.verified ? t('host.verified', 'Verified') : t('host.new_on', 'New on aangan')}</span>
        </button>

        <SignOutButton />
      </div>

      {editListing && <EditListingModal listing={editListing} onClose={() => setEditListing(null)} onSave={loadListings} />}
      <ListingFormModal open={addListing} onClose={() => setAddListing(false)}
        onSubmit={async (values: any) => { await api.post('/listings', values); await loadListings(); }} />

      {/* Live preview of the host's mini website (the board's "profiles look like websites"), full screen. */}
      {showPreview && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-[var(--page)]" role="dialog" aria-modal="true" aria-labelledby="profile-preview-title" data-testid="profile-preview">
          <div className="border-b border-[var(--hairline)] bg-[var(--surface)]">
            <div className="ag-wrap flex items-center gap-3 py-2">
              <Eye size={20} className="text-[var(--r)]" aria-hidden="true" />
              <b id="profile-preview-title" className="flex-1 font-medium text-[var(--ink-strong)]">{t('miniSite.preview_title')}</b>
              <IconButton label={t('common.close')} onClick={() => setShowPreview(false)}><X /></IconButton>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="ag-wrap">
              <div className="ag-main">
                <p className="ag-small">{t('miniSite.preview_note')}</p>
                <HostMiniSite data={preview} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
