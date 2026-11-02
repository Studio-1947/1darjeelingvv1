import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, WarningCircle, ArrowRight, MagnifyingGlass } from '@phosphor-icons/react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { uploadImage, uploadImages } from '@/lib/uploadImage';
import AvatarUploader from '@/components/provider/AvatarUploader';
import GalleryUploader from '@/components/provider/GalleryUploader';
import AmenityPicker from '@/components/provider/AmenityPicker';
import { RouteFareTable } from '@/components/provider/RouteEditor';
import { HOMESTAY_AMENITIES } from '@/constants/listingOptions';
import PricedEditor, { type Priced } from '@/components/provider/PricedEditor';
import { useSeo } from '@/components/Seo';

/**
 * The host's business profile: everything Studio1947's lists ask of a driver, a homestay and a
 * guide, on one page, saved through PATCH /providers/me (`profile`), which checks each field and
 * copies it onto the listing travellers see (backend lib/hostProfile.ts). The app has the same
 * screen (app/provider/profile.tsx).
 *
 * The items a new host must have before their documents can go for approval are listed at the
 * top, from the server's `profile_missing`, so the page and the server never disagree.
 */

const GUIDE_TYPES = ['trekking', 'heritage', 'nature', 'birding', 'tea', 'cultural', 'city', 'photography'];
const SEASONS = ['spring', 'summer', 'monsoon', 'autumn', 'winter'];
const SOCIAL = ['instagram', 'facebook', 'youtube', 'website'] as const;


const input = 'mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink';
const labelCls = 'text-xs font-semibold text-ink-soft uppercase';

function Section({ title, note, children, testid }: { title: string; note?: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="mist-panel p-5 md:p-7" data-testid={testid}>
      <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink">{title}</h2>
      {note && <p className="mt-1 text-sm text-ink-soft">{note}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

function Toggle({ on, onChange, label, note, testid }: { on: boolean; onChange: (v: boolean) => void; label: string; note?: string; testid?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} data-testid={testid}
      className="w-full flex items-center justify-between gap-4 text-left">
      <span>
        <span className="block font-bold text-ink">{label}</span>
        {note && <span className="block text-sm text-ink-soft">{note}</span>}
      </span>
      <span className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full transition-colors ${on ? 'bg-[#1F6656]' : 'bg-[var(--line)]'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </span>
    </button>
  );
}

function Chips({ options, selected, onChange, label }: { options: string[]; selected: string[]; onChange: (v: string[]) => void; label: (o: string) => string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <button key={o} type="button" aria-pressed={on}
            onClick={() => onChange(on ? selected.filter((x) => x !== o) : [...selected, o])}
            className={`px-3.5 py-2 rounded-full text-sm font-bold border transition-colors ${on ? 'bg-[rgba(31,102,86,0.12)] text-[#1F6656] border-[#1F6656]' : 'bg-white text-ink-soft border-[var(--line)]'}`}>
            {label(o)}
          </button>
        );
      })}
    </div>
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
    <div data-testid="recommended-drivers">
      <div className="relative">
        <MagnifyingGlass size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('hostProfile.find_driver')} className={`${input} mt-0 pl-9`} />
      </div>
      <div className="mt-3 grid sm:grid-cols-2 gap-2">
        {shown.map((d) => {
          const on = selected.includes(d.id);
          return (
            <button key={d.id} type="button" onClick={() => toggle(d.id)} aria-pressed={on}
              className={`text-left px-3.5 py-2.5 rounded-xl border text-sm transition-colors ${on ? 'border-[#1F6656] bg-[rgba(31,102,86,0.08)]' : 'border-[var(--line)] bg-white'}`}>
              <span className="block font-bold text-ink truncate">{d.title}</span>
              <span className="block text-ink-soft truncate">{d.location}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-ink-soft">{t('hostProfile.drivers_selected', { count: selected.length })}</p>
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

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login?next=/provider/profile'); return; }
    if (user.role !== 'provider') { nav('/provider/onboard'); }
  }, [authLoading, user, nav]);

  useEffect(() => {
    if (!provider) return;
    const e = provider.extras || {};
    const priced = (rows: any[] | undefined, nameKey = 'name', unit = 'day'): Priced[] =>
      (Array.isArray(rows) ? rows : []).map((r) => ({ name: String(r?.[nameKey] ?? r?.name ?? ''), price: Number(r?.price) || '', unit: r?.unit || unit }));
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
    });
  }, [provider]);

  const type: string = p?.business_type || '';
  const missing: { key: string; label: string }[] = p?.profile_missing || [];
  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));

  const upload = (field: 'cover' | 'host_avatar') => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(field);
    try { set({ [field]: await uploadImage(file) }); }
    catch (err) { setMsg({ ok: false, text: typeof err === 'string' ? err : 'Upload failed' }); }
    finally { setUploading(null); }
  };
  const uploadGallery = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading('images');
    try { const urls = await uploadImages(files); setForm((f: any) => ({ ...f, images: [...f.images, ...urls] })); }
    catch (err) { setMsg({ ok: false, text: typeof err === 'string' ? err : 'Upload failed' }); }
    finally { setUploading(null); }
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setMsg(null);
    const num = (v: any) => (v === '' || v === null || v === undefined ? undefined : Number(v));
    const priced = (rows: Priced[]) => rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), price: Number(r.price) || 0, unit: r.unit }));
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
        amenities: form.amenities, recommended_drivers: form.recommended_drivers, home_delivery: form.home_delivery,
      });
      if (num(form.capacity) !== undefined) profile.capacity = num(form.capacity);
    } else if (type === 'guide') {
      Object.assign(profile, { host_name: form.host_name.trim(), guide_types: form.guide_types, services: priced(form.services), seasons: form.seasons });
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
      setMsg({ ok: true, text: t('hostProfile.saved') });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.response?.data?.detail || e.message || 'Could not save' });
    } finally {
      setBusy(false);
    }
  };

  const photoGoal = type === 'driver' ? 6 : type === 'homestay' ? 8 : 0;
  const nameLabel = type === 'homestay' ? t('hostProfile.property_name') : type === 'guide' ? t('hostProfile.business_name_guide') : t('hostProfile.business_name');
  const unitLabel = (u: string) => t(`profile.unit_${u}`);

  if (!form) {
    return <div className="mx-auto max-w-3xl px-4 py-16 text-ink-soft">{t('common.loading')}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12 space-y-5" data-testid="provider-profile">
      <div>
        <span className="chip capitalize">{t(`categories.${type}`, { defaultValue: type })}</span>
        <h1 className="mt-3 font-display font-extrabold text-3xl text-ink">{t('hostProfile.title')}</h1>
        <p className="mt-1 text-ink-soft">{t('hostProfile.subtitle')}</p>
      </div>

      {missing.length > 0 ? (
        <div className="rounded-2xl border border-[#F0B90B] bg-[#FFF8E1] p-5" data-testid="profile-missing">
          <p className="font-bold text-ink flex items-center gap-2"><WarningCircle size={20} className="text-[#B7791F]" /> {t('hostProfile.required_title')}</p>
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {missing.map((m) => <li key={m.key}>• {m.label}</li>)}
          </ul>
          <p className="mt-2 text-xs text-ink-soft">{t('hostProfile.required_note')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-white p-4 flex items-center gap-2 text-sm font-semibold text-ink" data-testid="profile-complete">
          <CheckCircle size={20} className="text-pine" /> {t('hostProfile.required_done')}
        </div>
      )}

      <section className="mist-panel p-5 md:p-7">
        <Toggle on={form.available} onChange={(v) => set({ available: v })} testid="profile-available"
          label={form.available ? t('hostProfile.available_on') : t('hostProfile.available_off')}
          note={t('hostProfile.available_note')} />
        {type === 'homestay' && (
          <div className="mt-5 pt-5 border-t border-[var(--line)]">
            <Toggle on={form.home_delivery} onChange={(v) => set({ home_delivery: v })} testid="profile-home-delivery"
              label={t('hostProfile.home_delivery')} note={t('hostProfile.home_delivery_note')} />
          </div>
        )}
      </section>

      <Section title={t('hostProfile.about_you')}>
        <AvatarUploader src={form.host_avatar} initial={(form.host_name || form.business_name || '?').charAt(0).toUpperCase()}
          uploading={uploading === 'host_avatar'} onFileSelected={upload('host_avatar')}
          label={type === 'homestay' ? t('hostProfile.owner_photo') : t('hostProfile.your_photo')} size="sm" />
        <Field label={nameLabel}>
          <input value={form.business_name} onChange={(e) => set({ business_name: e.target.value })} className={input} />
        </Field>
        {(type === 'homestay' || type === 'guide') && (
          <Field label={type === 'homestay' ? `${t('hostProfile.host_name')} *` : t('hostProfile.your_name')}>
            <input value={form.host_name} onChange={(e) => set({ host_name: e.target.value })} className={input} data-testid="profile-host-name" />
          </Field>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('hostProfile.phone')}>
            <input value={form.contact_phone} onChange={(e) => set({ contact_phone: e.target.value })} inputMode="tel" className={input} />
          </Field>
          <Field label={t('hostProfile.whatsapp')} hint={t('hostProfile.whatsapp_hint')}>
            <input value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} inputMode="tel" className={input} />
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t('hostProfile.languages')} hint={t('hostProfile.languages_hint')}>
            <input value={form.languages} onChange={(e) => set({ languages: e.target.value })} className={input} />
          </Field>
          <Field label={t('hostProfile.experience')}>
            <input type="number" min={0} max={80} value={form.experience_years} onChange={(e) => set({ experience_years: e.target.value })} className={input} />
          </Field>
        </div>
        {type === 'guide' && (
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label={t('hostProfile.age')}>
              <input type="number" min={18} max={90} value={form.age} onChange={(e) => set({ age: e.target.value })} className={input} />
            </Field>
            <Field label={t('hostProfile.gender')}>
              <select value={form.gender} onChange={(e) => set({ gender: e.target.value })} className={input}>
                <option value="">—</option>
                {['male', 'female', 'other'].map((g) => <option key={g} value={g}>{t(`profile.gender_${g}`)}</option>)}
              </select>
            </Field>
          </div>
        )}
        <Field label={t('hostProfile.bio')}>
          <textarea rows={4} value={form.host_bio} onChange={(e) => set({ host_bio: e.target.value })} className={input} />
        </Field>
        <Field label={t('hostProfile.video')} hint={t('hostProfile.video_hint')}>
          <input value={form.intro_video} onChange={(e) => set({ intro_video: e.target.value })} placeholder="https://" className={input} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          {SOCIAL.map((k) => (
            <Field key={k} label={t(`profile.social_${k}`)}>
              <input value={form.social[k] || ''} onChange={(e) => set({ social: { ...form.social, [k]: e.target.value } })}
                placeholder={k === 'website' ? 'https://' : '@'} className={input} />
            </Field>
          ))}
        </div>
      </Section>

      {type === 'driver' && (
        <Section title={t('hostProfile.vehicle')} testid="profile-driver">
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label={t('hostProfile.vehicle_number')}>
              <input value={form.vehicle_number} onChange={(e) => set({ vehicle_number: e.target.value })} placeholder="WB 74 A 1234" className={input} />
            </Field>
            <Field label={t('hostProfile.license_number')}>
              <input value={form.license_number} onChange={(e) => set({ license_number: e.target.value })} className={input} />
            </Field>
            <Field label={t('hostProfile.seats')}>
              <input type="number" min={1} max={30} value={form.seats} onChange={(e) => set({ seats: e.target.value })} className={input} />
            </Field>
          </div>
          <p className="text-xs text-ink-soft">{t('hostProfile.vehicle_docs_note')}</p>
          <div>
            <span className={labelCls}>{t('hostProfile.routes')}</span>
            <div className="mt-2"><RouteFareTable routes={form.routes} onChange={(routes: any) => set({ routes })} compact emptyNote={t('hostProfile.routes_empty')} /></div>
          </div>
        </Section>
      )}

      {type === 'homestay' && (
        <Section title={t('hostProfile.rooms_food')} note={t('hostProfile.rooms_food_note')} testid="profile-homestay">
          <div>
            <span className={labelCls}>{t('profile.rooms')}</span>
            <div className="mt-2">
              <PricedEditor rows={form.rooms} onChange={(rooms) => set({ rooms })} units={['night', 'head']} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.room_ph')} addLabel={t('hostProfile.add_room')} testid="profile-rooms" />
            </div>
          </div>
          <div>
            <span className={labelCls}>{t('profile.meals')}</span>
            <div className="mt-2">
              <PricedEditor rows={form.meals} onChange={(meals) => set({ meals })} units={['meal', 'day', 'head']} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.meal_ph')} addLabel={t('hostProfile.add_meal')} testid="profile-meals" />
            </div>
          </div>
          <Field label={t('hostProfile.capacity')}>
            <input type="number" min={1} max={100} value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} className={`${input} max-w-[10rem]`} />
          </Field>
          <div>
            <span className={labelCls}>{t('hostProfile.amenities')}</span>
            <div className="mt-2">
              <AmenityPicker presets={HOMESTAY_AMENITIES} selected={form.amenities} onChange={(amenities: string[]) => set({ amenities })} compact />
            </div>
          </div>
          <div>
            <span className={labelCls}>{t('hostProfile.recommended_drivers')}</span>
            <div className="mt-2"><DriverPicker selected={form.recommended_drivers} onChange={(recommended_drivers) => set({ recommended_drivers })} /></div>
          </div>
        </Section>
      )}

      {type === 'guide' && (
        <Section title={t('hostProfile.guiding')} testid="profile-guide">
          <div>
            <span className={labelCls}>{t('hostProfile.guide_type')}</span>
            <div className="mt-2"><Chips options={GUIDE_TYPES} selected={form.guide_types} onChange={(guide_types) => set({ guide_types })} label={(o) => t(`profile.guide_type_${o}`)} /></div>
          </div>
          <div>
            <span className={labelCls}>{t('hostProfile.services')} *</span>
            <div className="mt-2">
              <PricedEditor rows={form.services} onChange={(services) => set({ services })} units={['day', 'trip', 'hour', 'person']} unitLabel={unitLabel}
                namePlaceholder={t('hostProfile.service_ph')} addLabel={t('hostProfile.add_service')} testid="profile-services" />
            </div>
          </div>
          <div>
            <span className={labelCls}>{t('hostProfile.seasons')}</span>
            <div className="mt-2"><Chips options={SEASONS} selected={form.seasons} onChange={(seasons) => set({ seasons })} label={(o) => t(`profile.season_${o}`)} /></div>
          </div>
        </Section>
      )}

      <Section title={t('hostProfile.photos')}
        note={photoGoal ? t(type === 'driver' ? 'hostProfile.photos_note_driver' : 'hostProfile.photos_note_homestay', { count: photoGoal }) : t('hostProfile.photos_note')}>
        <div>
          <span className={labelCls}>{t('hostProfile.cover')}</span>
          <div className="mt-2 flex items-center gap-4">
            {form.cover ? <img src={form.cover} alt="" className="w-40 h-24 rounded-xl object-cover border border-[var(--line)]" /> : <div className="w-40 h-24 rounded-xl bg-white border border-dashed border-[var(--line)]" />}
            <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--line)] bg-white text-sm font-bold text-ink cursor-pointer btn-hover">
              {uploading === 'cover' ? t('common.loading') : t('hostProfile.change_cover')}
              <input type="file" accept="image/*" className="hidden" onChange={upload('cover')} />
            </label>
          </div>
        </div>
        <div>
          <span className={labelCls}>{t('hostProfile.gallery')}{photoGoal ? ` (${form.images.length}/${photoGoal})` : ''}</span>
          <div className="mt-2">
            <GalleryUploader images={form.images} uploading={uploading === 'images'} onFilesSelected={uploadGallery}
              onRemove={(i) => setForm((f: any) => ({ ...f, images: f.images.filter((_: string, j: number) => j !== i) }))} compact />
          </div>
        </div>
      </Section>

      <div className="sticky bottom-[calc(var(--bottom-nav-h)+0.5rem)] lg:bottom-4 z-20">
        <div className="mist-panel p-3 flex items-center gap-3 shadow-lg">
          <p className={`flex-1 text-sm font-semibold ${msg ? (msg.ok ? 'text-pine' : 'text-flag') : 'text-ink-soft'}`} data-testid="profile-msg">
            {msg ? msg.text : t('hostProfile.save_hint')}
          </p>
          <button type="button" onClick={save} disabled={busy} data-testid="profile-save"
            className="inline-flex items-center gap-2 px-6 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-60">
            {busy ? t('common.loading') : t('hostProfile.save')} <ArrowRight size={16} />
          </button>
        </div>
      </div>

      <p className="text-center text-sm text-ink-soft">
        <Link to="/provider/dashboard" className="font-bold text-pine underline">{t('hostProfile.back_dashboard')}</Link>
      </p>
    </div>
  );
}
