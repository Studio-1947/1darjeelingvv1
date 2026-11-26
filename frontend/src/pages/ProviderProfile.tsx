import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { missingLabel } from '@/lib/serverText';
import { MagnifyingGlass, Check, CaretRight } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { uploadImage } from '@/lib/uploadImage';
import AvatarUploader from '@/components/provider/AvatarUploader';
import { useAppStatus } from '@/context/AppStatus'; // TEMPORARY(legal-pause)
import InviteHostLink from '@/components/provider/InviteHostLink';
import SignOutButton from '@/components/SignOutButton';
import MultiChips from '@/components/provider/MultiChips';
import Fold from '@/components/provider/Fold';
import { useSeo } from '@/components/Seo';
import { Box, Button, ButtonLink, Chip, Chips, SelectField, TextArea, TextField } from '@/components/ag';

/**
 * The host's business profile, kept to the basics (user decision 2026-11-26): what is the same for
 * the whole business (its name, phone and cover, the person behind it), saved through
 * PATCH /providers/me (`profile`), which checks each field and copies it onto every listing
 * (backend lib/hostProfile.ts). The app has the same screen (app/provider/profile.tsx).
 *
 * Everything about one service lives on that listing's page (/provider/listings/:id,
 * ProviderListingEdit), opened from the list here: its offers and photos (decision 2026-11-24), and
 * since 2026-11-26 its membership, a car's numbers and licence, a guide's kinds and seasons, and the
 * co-owners. The live preview, Sign out (on Account) and Invite are gone or folded away.
 *
 * The items a new host must have before their documents can go for approval are listed at the
 * top, from the server's `profile_missing`, each with where it is fixed.
 */


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
  const [myListings, setMyListings] = useState<any[] | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const loadListings = (): Promise<any[]> => api.get('/bookings/provider')
    .then((r) => { const ls = r.data.listings || []; setMyListings(ls); return ls; })
    .catch(() => { setMyListings([]); return []; });
  useEffect(() => { loadListings(); }, []);

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

  // The provider as last loaded (a plan renewal refreshes it); the form is built once per business,
  // so a renewal on the plan card does not wipe edits typed below it.
  useEffect(() => { if (provider) setP(provider); }, [provider]);
  useEffect(() => {
    if (!provider) return;
    const e = provider.extras || {};
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
      // guide (the person; their kinds of guiding and seasons are on each guiding listing)
      age: e.age ?? '',
      gender: e.gender || '',
      // shop
      shop_kind: e.shop_kind || '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per business, see above
  }, [provider?.id]);

  const type: string = p?.business_type || '';
  const missing: { key: string; label: string; min?: number; have?: number; listing_id?: string; listing_title?: string }[] = p?.profile_missing || [];

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
  // Every kind the business runs, none of them the "main" one (decision 2026-11-26): a driver who
  // also lists a homestay is asked the host's name, a homestay that also lists a cafe gets delivery.
  const kinds = useMemo(() => [...new Set([type, ...listings.map((l) => l.type)].filter(Boolean))], [type, listings]);
  const runs = (k: string) => kinds.includes(k);

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
    // Memberships are per listing now, on the dashboard's listing cards.
    if (hash === 'plan') { handledHash.current = hash; nav('/provider/dashboard', { replace: true }); return; }
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

  // Each listing's own Taking bookings switch, saved at once (the server checks only this one), as on the dashboard.
  const setListingTaking = async (l: any, on: boolean) => {
    setSwitching(l.id);
    try {
      await api.patch(`/listings/${l.id}`, { extras: { ...(l.extras || {}), available: on } });
      await loadListings();
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || t('ui.providerProfile.could_not_save') });
    } finally {
      setSwitching(null);
    }
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
  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
    // Only what is the whole business's: a listing's offers and photos are saved on its own page.
    const profile: Record<string, unknown> = {
      host_avatar: form.host_avatar,
      whatsapp: form.sameWhatsapp ? '' : form.whatsapp.trim(),
      languages: form.languages.split(',').map((s: string) => s.trim()).filter(Boolean),
      host_bio: form.host_bio,
      // The intro video is no longer offered; saving clears one a host uploaded before.
      intro_video: '',
      // Social links are no longer asked for; saving clears any a host added before.
      social: {},
    };
    if (num(form.experience_years) !== undefined) profile.experience_years = num(form.experience_years);
    // `available` is copied onto every listing by the server, so it is sent only to undo a
    // business-wide pause; otherwise a profile save would switch each paused listing back on.
    if (p?.extras?.available === false) profile.available = form.available;
    // A car's numbers and a guide's kinds and seasons are saved on each listing's page. The rest is
    // asked of every kind the business runs.
    const sells = runs('cafe') || runs('shop');
    if (runs('homestay') || runs('guide') || sells) profile.host_name = form.host_name.trim();
    if (runs('homestay') || sells) profile.recommended_drivers = form.recommended_drivers;
    if (sells) profile.home_delivery = form.home_delivery;
    if (runs('shop')) profile.shop_kind = form.shop_kind.trim();
    if (runs('guide')) {
      if (form.gender) profile.gender = form.gender;
      if (num(form.age) !== undefined) profile.age = num(form.age);
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

  // One kind: its own word for the name ("Property name"); several: the business's name.
  const nameLabel = kinds.length > 1 ? t('hostProfile.business_name') : type === 'homestay' ? t('hostProfile.property_name') : type === 'guide' ? t('hostProfile.business_name_guide') : t('hostProfile.business_name');

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

  const sellsLocally = runs('cafe') || runs('shop');
  const recommendsDrivers = runs('homestay') || sellsLocally;
  const needsAbout = missing.some((m) => m.key === 'host_name');
  // Saved as paused for the whole business (the old business-wide switch), not just edited off here.
  const pausedAll = p?.extras?.available === false;
  const langs = splitLangs(form.languages);

  return (
    <div className="ag-wrap">
      <div className="ag-main pb-[calc(var(--page-cta-h)+24px)]" data-testid="provider-profile">
        <div>
          <p className="ag-host-typeline">{t(`ob.wz.t_${type}`, { defaultValue: type })}</p>
          <h1 className="ag-host-tabh">{t('hostProfile.title')}</h1>
          <p className="ag-small mt-3">{t('hostProfile.subtitle')}</p>
        </div>

        {missing.length > 0 ? (
          <Box tone="blush" className="ag-host-need" data-testid="profile-missing">
            <h2>{t('hostProfile.required_title')}</h2>
            <ul>
              {missing.map((m) => {
                // Each item links to where it is fixed: About you here, or the first listing's photos or prices.
                // The listing it is missing on (the server names it), else the first one.
                const part = FIX_ON_LISTING[m.key];
                const on = (m.listing_id && listings.find((l) => l.id === m.listing_id)) || first;
                const to = part ? (on ? listingPath(on, part) : '#listings') : '#about';
                return (
                  <li key={m.key}>
                    <span className="d" aria-hidden="true">•</span>
                    <span className="flex-1">{missingLabel(t, m, (m.listing_id && listings.find((l) => l.id === m.listing_id)?.type) || p?.business_type)}{m.listing_title && listings.length > 1 ? ` · ${m.listing_title}` : ''}</span>
                    <Link to={to} className="ag-seeall shrink-0" data-testid={`profile-missing-fix-${m.key}`}>{t('common.edit')}</Link>
                  </li>
                );
              })}
            </ul>
            <p className="ag-small">{t('hostProfile.required_note')}</p>
          </Box>
        ) : null}

        {/* Taking bookings is per listing (each card below). The business-wide switch shows only for a
            host who paused everything with it, so they can undo it, as on the dashboard (decision 2026-11-24). */}
        {(pausedAll || (deliveryOn && sellsLocally)) && (
          <Box as="section" className="ag-host-switches">
            {pausedAll && (
              <Toggle on={form.available} onChange={(v) => set({ available: v })} testid="profile-available"
                label={t('host.taking', 'Taking bookings')}
                note={form.available ? t('host.avail_on', 'Available. Travellers can ask to book.') : t('host.avail_off', 'Not available right now. Your listings show as paused.')} />
            )}
            {pausedAll && (
              // Undoing the business-wide pause turns every listing back on; each can then be paused on its own.
              <p className="ag-small -mt-1">{t('hostProfile.unpause_note', 'Switching this on turns every listing back on. Then pause any one on its card below.')}</p>
            )}
            {/* TEMPORARY(legal-pause): hidden while delivery is paused; the saved setting is kept and returns with it. */}
            {deliveryOn && sellsLocally && (
              <div>
                <Toggle on={form.home_delivery} onChange={(v) => set({ home_delivery: v })} testid="profile-home-delivery"
                  label={runs('cafe') ? t('hostProfile.home_delivery') : t('hostProfile.home_delivery_shop')}
                  note={runs('cafe') ? t('hostProfile.home_delivery_cafe_note') : t('hostProfile.home_delivery_shop_note')} />
              </div>
            )}
          </Box>
        )}

        {/* The business itself: its name and how guests reach it. */}
        <Fold title={t('pd.business', 'Business')} summary={[form.business_name, form.contact_phone].filter(Boolean).join(' · ')} testid="profile-business">
          <TextField label={nameLabel} value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} />
          {runs('shop') && (
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
            label={runs('homestay') ? t('hostProfile.owner_photo') : t('hostProfile.your_photo')} />
          {(runs('homestay') || runs('guide') || sellsLocally) && (
            <TextField label={runs('homestay') ? `${t('hostProfile.host_name')} *` : sellsLocally ? `${t('hostProfile.owner_name')} *` : t('hostProfile.your_name')}
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
          <div className={`grid gap-4 ${runs('guide') ? 'sm:grid-cols-3' : 'sm:max-w-[16rem]'}`}>
            <SelectField label={t('hostProfile.experience')} value={String(form.experience_years ?? '')} onChange={(e) => set({ experience_years: e.target.value })} data-testid="profile-experience">
              <option value="">{t('hostProfile.seats_pick', 'Choose')}</option>
              {experienceOptions(form.experience_years).map((n) => (
                <option key={n} value={String(n)}>{n === 0 ? t('hostProfile.exp_new', 'Less than a year') : t('hostProfile.exp_n', { count: n })}</option>
              ))}
            </SelectField>
            {runs('guide') && (
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
        </Fold>

        {/* Every listing the business runs, of any kind (a shop that also lets rooms or drives guests),
            in one place, grouped by kind; the listings come first because most edits are to one of them. */}
        <Box as="section" id="listings" className="ag-host-props scroll-mt-20" data-testid="profile-properties">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h2>{t('host.your_listings', 'Your listings')}</h2>
              {/* The fuller view: each listing's status, offers, photos and requests as cards. */}
              <Link to="/my-listings" className="ag-seeall shrink-0" data-testid="profile-see-listings">{t('home.see_all', 'See all')}</Link>
            </div>
            <p className="ag-small">{t('hostProfile.listings_note_all', 'Tap one to edit its prices, photos, membership and its own details.')}</p>
          </div>
          {listingGroups.map(([kind, group]) => (
            <div key={kind} className="grid gap-2" data-testid={`profile-listings-${kind}`}>
              {/* The kind is named only when there is more than one, so a one-kind business reads as before. */}
              {listingGroups.length > 1 && <span className="ag-eyebrow">{t(`ob.wz.t_${kind}`, { defaultValue: kind })} · {group.length}</span>}
              {group.map((l) => {
                const pics = Array.isArray(l.extras?.images) ? l.extras.images.length : 0;
                const on = l.extras?.available !== false;
                return (
                  // The card opens the listing's page; its Taking bookings switch sits beside it, not inside the link.
                  <div key={l.id} className="ag-host-listing" data-testid="profile-listing">
                    <Link to={listingPath(l)} className="main">
                      {l.image ? <img src={l.image} alt="" className="pic" /> : <span className="pic" aria-hidden="true" />}
                      <span className="txt">
                        <b>{l.title}</b>
                        <span className="ag-small">{l.location}{Number(l.price) > 0 ? ` · ${t('host.from', 'From')} ₹${Number(l.price).toLocaleString('en-IN')}` : ''}</span>
                        <span className={`ag-small${on ? '' : ' !text-[var(--fail)]'}`}>
                          {on ? `${t('hostProfile.photos')} · ${pics}` : t('host.paused', 'Not taking bookings')}
                        </span>
                      </span>
                      <CaretRight className="chev" aria-hidden="true" />
                    </Link>
                    <label className="ag-host-ltoggle" title={t('host.taking', 'Taking bookings')}>
                      <input type="checkbox" role="switch" checked={on} disabled={switching === l.id}
                        aria-label={`${t('host.taking', 'Taking bookings')}: ${l.title}`}
                        onChange={(e) => setListingTaking(l, e.target.checked)} data-testid={`profile-listing-taking-${l.id}`} />
                    </label>
                  </div>
                );
              })}
            </div>
          ))}
          {/* Adding a listing of any kind: the dashboard's guided steps (it asks the kind first). */}
          <div className="ag-row">
            <ButtonLink to="/provider/onboard?add=1" icon={<Icon name="plus" />} data-testid="profile-add-listing">
              {t('pd.add_listing', 'Add listing')}
            </ButtonLink>
          </div>
        </Box>

        {/* The rest, folded away: who drives guests on (homestays, cafes, shops) and inviting another host. */}
        <Fold title={t('hostProfile.more', 'More settings')} testid="profile-more">
          {recommendsDrivers && (
            <div data-testid="profile-recommended">
              <Group label={t('hostProfile.recommended_drivers')}>
                <DriverPicker selected={form.recommended_drivers} onChange={(recommended_drivers) => set({ recommended_drivers })} />
              </Group>
            </div>
          )}
          <InviteHostLink />
        </Fold>

        {/* Log out and Delete account, the page's last two actions, as on the Account tab. */}
        <SignOutButton className="mt-2" />
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

    </div>
  );
}
