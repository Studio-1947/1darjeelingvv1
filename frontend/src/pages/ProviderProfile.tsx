import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { missingLabel } from '@/lib/serverText';
import { MagnifyingGlass, Eye, X, VideoCamera, Check, CaretRight } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { uploadImage } from '@/lib/uploadImage';
import AvatarUploader from '@/components/provider/AvatarUploader';
import LicenceUpload from '@/components/provider/LicenceUpload';
import { useAppStatus } from '@/context/AppStatus'; // TEMPORARY(legal-pause)
import OwnersSection from '@/components/provider/OwnersSection';
import HostMiniSite, { type MiniSiteData } from '@/components/provider/HostMiniSite';
import Fold from '@/components/provider/Fold';
import { useSeo } from '@/components/Seo';
import { Box, Button, ButtonLink, Chip, Chips, IconButton, SelectField, TextArea, TextField } from '@/components/ag';

/**
 * The host's business profile: what is the same for the whole business (its name and phone, the
 * person behind it, a guide's kinds of guiding, a driver's licence, owners), saved through
 * PATCH /providers/me (`profile`), which checks each field and copies it onto every listing
 * (backend lib/hostProfile.ts). The app has the same screen (app/provider/profile.tsx).
 *
 * Each listing's own offers (rooms and food, menu, goods, services, routes) and photos are edited on
 * that listing's page (/provider/listings/:id, ProviderListingEdit), opened from the list of listings
 * here (user decision 2026-11-24). Every part is a collapsible card (Fold), so the page opens short.
 *
 * The items a new host must have before their documents can go for approval are listed at the
 * top, from the server's `profile_missing`, each with where it is fixed.
 */

const GUIDE_TYPES = ['trekking', 'heritage', 'nature', 'birding', 'tea', 'cultural', 'city', 'photography'];
const SEASONS = ['spring', 'summer', 'monsoon', 'autumn', 'winter'];

/** Languages a host picks from: the four the app is offered in (src/i18n.ts). Saved as these English names. */
const HOST_LANGUAGES = ['English', 'Hindi', 'Nepali', 'Bengali'];
/** The saved list, with a known language in its usual spelling ("nepali" -> "Nepali") and no repeats. */
const splitLangs = (v: unknown) => [...new Set(String(v ?? '').split(',').map((x) => x.trim()).filter(Boolean)
  .map((x) => HOST_LANGUAGES.find((l) => l.toLowerCase() === x.toLowerCase()) || x))];
function languageOptions(selected: string[]): string[] {
  const known = (x: string) => HOST_LANGUAGES.some((l) => l.toLowerCase() === x.toLowerCase());
  return [...HOST_LANGUAGES, ...selected.filter((x) => !known(x))];
}

/** Years of experience to pick from: 0-40, plus an older saved value above that (the server takes up to 80). */
function experienceOptions(current: unknown): number[] {
  const opts = Array.from({ length: 41 }, (_, i) => i);
  const n = Number(current);
  if (current !== '' && Number.isInteger(n) && n > 40 && n <= 80) opts.push(n);
  return opts;
}
const last10 = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10);

/** Where each item of the server's checklist is fixed: on this page, or on the first listing's page. */
const FIX_ON_LISTING: Record<string, string> = { images: 'photos', services: 'prices', rooms: 'prices', menu: 'prices', goods: 'prices' };

/** A labelled group for controls that are not a single field (chips, uploads). */
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
  const { home_delivery: deliveryOn } = useAppStatus(); // TEMPORARY(legal-pause)
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
  const [myListings, setMyListings] = useState<any[] | null>(null);
  const loadListings = (): Promise<any[]> => api.get('/bookings/provider')
    .then((r) => { const ls = r.data.listings || []; setMyListings(ls); return ls; })
    .catch(() => { setMyListings([]); return []; });
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
    setP(provider);
    setForm({
      business_name: provider.business_name || '',
      contact_phone: provider.contact_phone || '',
      // The business page's cover (the public /business page); each listing can have its own on its page.
      cover: (provider.images || [])[0] || '',
      host_avatar: e.host_avatar || '',
      host_name: e.host_name || '',
      whatsapp: e.whatsapp || '',
      // An empty WhatsApp means "same as the phone" (the server and the public page read it so).
      sameWhatsapp: !e.whatsapp || last10(e.whatsapp) === last10(provider.contact_phone),
      available: e.available !== false,
      languages: (Array.isArray(e.languages) ? e.languages : []).join(', '),
      experience_years: e.experience_years ?? '',
      host_bio: e.host_bio || '',
      intro_video: e.intro_video || '',
      recommended_drivers: Array.isArray(e.recommended_drivers) ? e.recommended_drivers : [],
      home_delivery: e.home_delivery === true,
      // driver
      vehicle_number: e.vehicle_number || '',
      license_number: e.license_number || '',
      // guide
      age: e.age ?? '',
      gender: e.gender || '',
      guide_types: Array.isArray(e.guide_types) ? e.guide_types : [],
      seasons: Array.isArray(e.seasons) ? e.seasons : [],
      // shop
      shop_kind: e.shop_kind || '',
    });
  }, [provider]);

  const type: string = p?.business_type || '';
  const missing: { key: string; label: string; min?: number; have?: number }[] = p?.profile_missing || [];

  // This business's own listings, oldest first. The first of the business's own type is the one set up
  // at sign-up: the server mirrors it onto the profile, so the checklist's photos and prices are fixed there.
  const listings = useMemo(() => (myListings || []).filter((l) => l.provider_id === provider?.id)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))), [myListings, provider?.id]);
  const first = listings.find((l) => l.type === type) || listings[0] || null;
  // The listings grouped by kind, the business's own kind first, then in the order they were added.
  const listingGroups = useMemo(() => {
    const groups = new Map<string, any[]>();
    if (type) groups.set(type, []);
    for (const l of listings) groups.set(l.type, [...(groups.get(l.type) || []), l]);
    return [...groups.entries()].filter(([, g]) => g.length > 0);
  }, [listings, type]);
  const listingPath = (l: { id: string }, part?: string) => `/provider/listings/${l.id}${part ? `#${part}` : ''}`;

  // Links land on a part. #about opens About you here; the dashboard's Menu button (#menu) and the
  // checklist's photo and price links (#photos, #prices) belong to a listing now: go to the first one's.
  const location = useLocation();
  const hash = location.hash.slice(1);
  // Each new hash is handled once (the checklist's Edit links change it while the page is open).
  const handledHash = useRef('');
  useEffect(() => {
    if (!form || !hash || handledHash.current === hash) return;
    if (['menu', 'photos', 'prices'].includes(hash)) {
      if (myListings === null) return;
      handledHash.current = hash;
      if (first) nav(listingPath(first, hash), { replace: true });
      return;
    }
    if (hash !== 'about' && hash !== 'listings') return;
    handledHash.current = hash;
    window.requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }, [form, hash, myListings, first, nav]);

  // The fixed save bar covers the page's end: the page leaves room for it through --page-cta-h,
  // as the item page's book bar does (ReserveSection).
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

  const set = (patch: any) => {
    // Once a host makes another edit, the previous success state is no longer current.
    setMsg((current) => current?.ok ? null : current);
    setForm((f: any) => ({ ...f, ...patch }));
  };

  const uploadCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading('cover');
    try { set({ cover: await uploadImage(file) }); }
    catch (err) { setMsg({ ok: false, text: typeof err === 'string' ? err : t('kyc.uploadFailed') }); }
    finally { setUploading(null); }
  };
  const uploadAvatar = async (file: File) => {
    setUploading('host_avatar');
    try { set({ host_avatar: await uploadImage(file) }); }
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

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
    // Only what is the whole business's: a listing's offers and photos are saved on its own page.
    const profile: Record<string, unknown> = {
      host_avatar: form.host_avatar,
      whatsapp: form.sameWhatsapp ? '' : form.whatsapp.trim(),
      available: form.available,
      languages: form.languages.split(',').map((s: string) => s.trim()).filter(Boolean),
      host_bio: form.host_bio,
      intro_video: form.intro_video.trim(),
      // Social links are no longer asked for; saving clears any a host added before.
      social: {},
    };
    if (num(form.experience_years) !== undefined) profile.experience_years = num(form.experience_years);
    if (type === 'driver') {
      Object.assign(profile, { vehicle_number: form.vehicle_number.trim(), license_number: form.license_number.trim() });
    } else if (type === 'homestay') {
      Object.assign(profile, { host_name: form.host_name.trim(), recommended_drivers: form.recommended_drivers });
    } else if (type === 'guide') {
      Object.assign(profile, { host_name: form.host_name.trim(), guide_types: form.guide_types, seasons: form.seasons });
      if (form.gender) profile.gender = form.gender;
      if (num(form.age) !== undefined) profile.age = num(form.age);
    } else if (type === 'cafe') {
      Object.assign(profile, { host_name: form.host_name.trim(), recommended_drivers: form.recommended_drivers, home_delivery: form.home_delivery });
    } else if (type === 'shop') {
      Object.assign(profile, {
        host_name: form.host_name.trim(), shop_kind: form.shop_kind.trim(),
        recommended_drivers: form.recommended_drivers, home_delivery: form.home_delivery,
      });
    }
    const body: Record<string, unknown> = { profile };
    if (form.business_name.trim() && form.business_name.trim() !== p.business_name) body.business_name = form.business_name.trim();
    if (form.contact_phone.trim() && form.contact_phone.trim() !== p.contact_phone) body.contact_phone = form.contact_phone.trim();
    if (form.cover && form.cover !== (p.images || [])[0]) body.cover_image = form.cover;
    try {
      const { data } = await api.patch('/providers/me', body);
      setP((prev: any) => ({ ...prev, ...data.provider }));
      await refreshProvider();
      await loadListings();
      setMsg({ ok: true, text: t('hostProfile.saved') });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || e.message || t('ui.providerProfile.could_not_save') });
    } finally {
      setBusy(false);
    }
  };

  const nameLabel = type === 'homestay' ? t('hostProfile.property_name') : type === 'guide' ? t('hostProfile.business_name_guide') : t('hostProfile.business_name');

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

  // The preview shows the public page as travellers meet it first: the business, with the first listing's offers and photos.
  const fe = first?.extras || {};
  const rows = (list: any) => (Array.isArray(list) ? list : []).filter((r: any) => r && (r.name || r.route))
    .map((r: any) => ({ name: r.route || r.name, price: Number(r.price) || 0, unit: r.unit || (type === 'driver' ? 'trip' : ''), photo: r.photo }));
  const previewItems: MiniSiteData['items'] = type === 'homestay' ? [...rows(fe.rooms), ...rows(fe.meals)]
    : rows(fe[({ driver: 'routes', guide: 'services', cafe: 'menu', shop: 'goods' } as Record<string, string>)[type]]);
  const preview: MiniSiteData = {
    type,
    name: form.business_name,
    hostName: form.host_name,
    avatar: form.host_avatar,
    cover: form.cover || first?.image || '',
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
    items: previewItems,
    gallery: Array.isArray(fe.images) ? fe.images : [],
    available: form.available,
    homeDelivery: deliveryOn && form.home_delivery && (type === 'cafe' || type === 'shop'), // TEMPORARY(legal-pause)
  };

  const sellsLocally = type === 'cafe' || type === 'shop';
  const recommendsDrivers = type === 'homestay' || sellsLocally;
  const needsAbout = missing.some((m) => m.key === 'host_name');
  const langs = splitLangs(form.languages);

  return (
    <div className="ag-wrap">
      <div className="ag-main pb-[calc(var(--page-cta-h)+24px)]" data-testid="provider-profile">
        <div>
          <p className="ag-host-typeline">{t(`ob.wz.t_${type}`, { defaultValue: type })}</p>
          <h1 className="ag-host-tabh">{t('hostProfile.title')}</h1>
          <p className="ag-small mt-3">{t('hostProfile.subtitle')}</p>
        </div>

        {/* The prototype's "Live preview" card, at the top so the host sees the page they are editing; tapping it opens the full preview. */}
        <button type="button" className="ag-box ag-host-preview" onClick={() => setShowPreview(true)} data-testid="profile-preview-open">
          <span className="ag-eyebrow">{t('miniSite.preview_title')}</span>
          {p?.page_path && <span className="url">{`${window.location.host}${p.page_path}`}</span>}
          <h2>{form.business_name}</h2>
          <span className="ag-small">{t(`ob.wz.t_${type}`, { defaultValue: type })} · {p?.location}</span>
          {p?.created_at && <span className="ag-small">{t('host.joined', 'Joined aangan {{date}}', { date: new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) })}</span>}
          <span className={`ag-host-tag${p?.badges?.verified ? ' ok' : ''}`}>{p?.badges?.verified ? t('host.verified', 'Verified') : t('host.new_on', 'New on aangan')}</span>
        </button>

        {missing.length > 0 ? (
          <Box tone="blush" className="ag-host-need" data-testid="profile-missing">
            <h2>{t('hostProfile.required_title')}</h2>
            <ul>
              {missing.map((m) => {
                // Each item links to where it is fixed: About you here, or the first listing's photos or prices.
                const part = FIX_ON_LISTING[m.key];
                const to = part ? (first ? listingPath(first, part) : '#listings') : '#about';
                return (
                  <li key={m.key}>
                    <span className="d" aria-hidden="true">•</span>
                    <span className="flex-1">{missingLabel(t, m, p?.business_type)}</span>
                    <Link to={to} className="ag-seeall shrink-0" data-testid={`profile-missing-fix-${m.key}`}>{t('common.edit')}</Link>
                  </li>
                );
              })}
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
          {/* TEMPORARY(legal-pause): hidden while delivery is paused; the saved setting is kept and returns with it. */}
          {deliveryOn && sellsLocally && (
            <div>
              <Toggle on={form.home_delivery} onChange={(v) => set({ home_delivery: v })} testid="profile-home-delivery"
                label={type === 'shop' ? t('hostProfile.home_delivery_shop') : t('hostProfile.home_delivery')}
                note={type === 'shop' ? t('hostProfile.home_delivery_shop_note') : t('hostProfile.home_delivery_cafe_note')} />
            </div>
          )}
        </Box>

        {/* Every listing the business runs, of any kind (a shop that also lets rooms or drives guests),
            in one place, grouped by kind; the listings come first because most edits are to one of them. */}
        <Box as="section" id="listings" className="ag-host-props scroll-mt-20" data-testid="profile-properties">
          <div>
            <h2>{t('host.your_listings', 'Your listings')}</h2>
            <p className="ag-small">{t('hostProfile.listings_note', 'Tap one to edit its prices, details and photos.')}</p>
          </div>
          {listingGroups.map(([kind, group]) => (
            <div key={kind} className="grid gap-2" data-testid={`profile-listings-${kind}`}>
              {/* The kind is named only when there is more than one, so a one-kind business reads as before. */}
              {listingGroups.length > 1 && <span className="ag-eyebrow">{t(`ob.wz.t_${kind}`, { defaultValue: kind })} · {group.length}</span>}
              {group.map((l) => {
                const pics = Array.isArray(l.extras?.images) ? l.extras.images.length : 0;
                return (
                  <Link key={l.id} to={listingPath(l)} className="ag-host-listing" data-testid="profile-listing">
                    {l.image ? <img src={l.image} alt="" className="pic" /> : <span className="pic" aria-hidden="true" />}
                    <span className="txt">
                      <b>{l.title}</b>
                      <span className="ag-small">{l.location}{Number(l.price) > 0 ? ` · ${t('host.from', 'From')} ₹${Number(l.price).toLocaleString('en-IN')}` : ''}</span>
                      <span className="ag-small">{t('hostProfile.photos')} · {pics}</span>
                    </span>
                    <CaretRight className="chev" aria-hidden="true" />
                  </Link>
                );
              })}
            </div>
          ))}
          {/* Two ways to add, both the dashboard's guided steps: another of the business's own kind
              (the kind already picked, so it starts at the place), or a listing of any kind (it asks first). */}
          <div className="ag-row">
            {type && (
              <ButtonLink to={`/provider/onboard?add=1&type=${type}&step=1`} icon={<Icon name={type === 'driver' ? 'car' : 'home'} />} data-testid="profile-add-another">
                {t(`hostProfile.add_another_${type}`, 'Add another property')}
              </ButtonLink>
            )}
            <ButtonLink to="/provider/onboard?add=1" icon={<Icon name="plus" />} data-testid="profile-add-listing">
              {t('pd.add_listing', 'Add listing')}
            </ButtonLink>
          </div>
        </Box>

        {/* The business itself: its name and how guests reach it. */}
        <Fold title={t('pd.business', 'Business')} summary={[form.business_name, form.contact_phone].filter(Boolean).join(' · ')} testid="profile-business">
          <TextField label={nameLabel} value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} />
          {type === 'shop' && (
            <TextField label={t('hostProfile.shop_kind')} value={form.shop_kind} onChange={(e) => set({ shop_kind: e.target.value })}
              placeholder={t('hostProfile.shop_kind_ph')} data-testid="profile-shop-kind" />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label={t('hostProfile.phone')} value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} inputMode="tel" />
            {/* Usually the same number the host signed in with (the code came on WhatsApp): a tick, not a second entry. */}
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-[var(--ink-strong)]">{t('hostProfile.whatsapp')}</span>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--ink7)]">
                <input type="checkbox" checked={form.sameWhatsapp} onChange={(e) => set({ sameWhatsapp: e.target.checked })}
                  className="h-5 w-5 accent-[var(--r)]" data-testid="profile-same-whatsapp" />
                {t('ui.editProfile.same_as_phone')}
              </label>
              {!form.sameWhatsapp && (
                <TextField aria-label={t('hostProfile.whatsapp')} value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })}
                  type="tel" inputMode="tel" placeholder="98765 43210" data-testid="profile-whatsapp" />
              )}
            </div>
          </div>
          <Group label={t('hostProfile.cover')}>
            <div className="flex flex-wrap items-center gap-3">
              {form.cover
                ? <img src={form.cover} alt="" className="aspect-[16/9] w-44 rounded-[18px] border border-[var(--warmline)] object-cover" />
                : <div className="aspect-[16/9] w-44 rounded-[18px] border-2 border-dashed border-[var(--outline)]" />}
              <label className="ag-btn sm cursor-pointer">
                <span>{uploading === 'cover' ? t('common.loading') : t('hostProfile.change_cover')}</span>
                <input type="file" accept="image/*" className="sr-only" onChange={uploadCover} data-testid="profile-cover-input" />
              </label>
            </div>
          </Group>
        </Fold>

        {/* The person behind it: what travellers read and watch before they ask. */}
        <Fold title={t('hostProfile.about_you')} id="about" open={needsAbout || hash === 'about'}
          summary={[form.host_name, langs.join(', ')].filter(Boolean).join(' · ')} testid="profile-about">
          <AvatarUploader src={form.host_avatar} initial={(form.host_name || form.business_name || '?').charAt(0).toUpperCase()}
            uploading={uploading === 'host_avatar'} onFile={uploadAvatar} onRemove={() => set({ host_avatar: '' })}
            label={type === 'homestay' ? t('hostProfile.owner_photo') : t('hostProfile.your_photo')} />
          {(type === 'homestay' || type === 'guide' || sellsLocally) && (
            <TextField label={type === 'homestay' ? `${t('hostProfile.host_name')} *` : type === 'guide' ? t('hostProfile.your_name') : `${t('hostProfile.owner_name')} *`}
              value={form.host_name} onChange={(e) => set({ host_name: e.target.value })} data-testid="profile-host-name" />
          )}
          {/* Tap to pick: the four languages the app itself speaks. One saved earlier outside them stays as a pill. */}
          <div data-testid="profile-languages">
            <Group label={t('hostProfile.languages')}>
              <MultiChips options={languageOptions(langs)} selected={langs}
                onChange={(v) => set({ languages: v.join(', ') })} label={(o) => t(`hostProfile.lang_${o.toLowerCase()}`, o)} />
            </Group>
          </div>
          {/* Experience, and a guide's age and gender, share one row instead of a half-empty one each. */}
          <div className={`grid gap-4 ${type === 'guide' ? 'sm:grid-cols-3' : 'sm:max-w-[16rem]'}`}>
            <SelectField label={t('hostProfile.experience')} value={String(form.experience_years ?? '')} onChange={(e) => set({ experience_years: e.target.value })} data-testid="profile-experience">
              <option value="">{t('hostProfile.seats_pick', 'Choose')}</option>
              {experienceOptions(form.experience_years).map((n) => (
                <option key={n} value={String(n)}>{n === 0 ? t('hostProfile.exp_new', 'Less than a year') : t('hostProfile.exp_n', { count: n })}</option>
              ))}
            </SelectField>
            {type === 'guide' && (
              <>
                <TextField label={t('hostProfile.age')} type="number" min={18} max={90} value={form.age} onChange={(e) => set({ age: e.target.value })} />
                <SelectField label={t('hostProfile.gender')} value={form.gender} onChange={(e) => set({ gender: e.target.value })}>
                  <option value="">—</option>
                  {['male', 'female', 'other'].map((g) => <option key={g} value={g}>{t(`profile.gender_${g}`)}</option>)}
                </SelectField>
              </>
            )}
          </div>
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
        </Fold>

        {type === 'guide' && (
          <Fold title={t('hostProfile.guiding')} summary={form.guide_types.map((g: string) => t(`profile.guide_type_${g}`)).join(', ')} testid="profile-guide">
            <Group label={t('hostProfile.guide_type')}>
              <MultiChips options={GUIDE_TYPES} selected={form.guide_types} onChange={(guide_types) => set({ guide_types })} label={(o) => t(`profile.guide_type_${o}`)} />
            </Group>
            <Group label={t('hostProfile.seasons')}>
              <MultiChips options={SEASONS} selected={form.seasons} onChange={(seasons) => set({ seasons })} label={(o) => t(`profile.season_${o}`)} />
            </Group>
          </Fold>
        )}

        {/* A driver's own papers: the same for every vehicle they list. */}
        {type === 'driver' && (
          <Fold title={t('hostProfile.vehicle')} summary={[form.vehicle_number, form.license_number].filter(Boolean).join(' · ')} testid="profile-driver">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={t('hostProfile.vehicle_number')} value={form.vehicle_number} onChange={(e) => set({ vehicle_number: e.target.value })} placeholder="WB 74 A 1234" />
              <TextField label={t('hostProfile.license_number')} value={form.license_number} onChange={(e) => set({ license_number: e.target.value })} />
            </div>
            <LicenceUpload />
            <p className="ag-small">{t('hostProfile.vehicle_docs_note')}</p>
          </Fold>
        )}

        {recommendsDrivers && (
          <Fold title={t('hostProfile.recommended_drivers')} summary={t('hostProfile.drivers_selected', { count: form.recommended_drivers.length })} testid="profile-recommended">
            <DriverPicker selected={form.recommended_drivers} onChange={(recommended_drivers) => set({ recommended_drivers })} />
          </Fold>
        )}

        <OwnersSection onLeft={async () => { await refreshProvider(); nav('/'); }} />
      </div>

      {/* Save, as the prototype's "Save profile" button, in a bar that stays above the tab bar
          (the item page's .ag-bookbar), so it is in reach from every card. */}
      <div ref={saveBarRef} className="ag-bookbar ag-host-savebar" data-testid="profile-savebar">
        <div className="ag-wrap">
          {msg?.ok ? (
            <div className="ag-host-saverow" data-testid="profile-saved-actions">
              <p className="msg text-[var(--ok)]">{msg.text}</p>
              <Button variant="text" onClick={() => setMsg(null)}>{t('ui.providerProfile.keep_editing')}</Button>
              <ButtonLink to="/provider/dashboard" go>{t('hostProfile.back_dashboard')}</ButtonLink>
            </div>
          ) : (
            <>
              <p className={`msg ${msg ? 'text-[var(--fail)]' : 'text-[var(--ink-muted)]'}`} role={msg ? 'alert' : undefined} data-testid="profile-msg">
                {msg ? msg.text : t('hostProfile.save_hint')}
              </p>
              {/* The page's main action, so it uses the filled primary button like the wizard's Next. */}
              <Button variant="primary" go onClick={save} disabled={busy || !!uploading} data-testid="profile-save">{busy ? t('common.loading') : t('hostProfile.save')}</Button>
            </>
          )}
        </div>
      </div>

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
