import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Phone, Upload, WhatsappLogo } from '@phosphor-icons/react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { uploadImage, SUPPORTED_IMAGE_ACCEPT } from '@/lib/uploadImage';
import { DIETS, FOODS, GENDERS, PLACE_INTERESTS, TRAVELLER_TYPES, ageFromBirthYear } from '@/lib/travellerProfile';

/**
 * Edit your traveller profile (board: "As Traveller" -> "Profile Setup"). The same page is the
 * first-time setup after signing up (?setup=1), where it can be skipped and filled in later.
 * Every field but the name is optional; the server checks each one.
 */
export default function EditProfile() {
  useSeo({ title: 'Edit profile', noindex: true });
  const { user, loading, setUser } = useAuth();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const setup = sp.get('setup') === '1';
  const rawNext = sp.get('next') || '/dashboard';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard';

  const [form, setForm] = useState({
    name: '', email: '', avatar: '', whatsapp: '', sameWhatsapp: true, gender: '', age: '',
    address: '', pincode: '', interests: [] as string[], likedFoods: [] as string[], travellerType: '', diet: '',
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (loading) return;
    if (!user) { nav(`/login?next=${encodeURIComponent('/profile/edit')}`); return; }
    const whatsapp = user.whatsapp || '';
    setForm({
      name: user.name || '',
      email: user.email || '',
      avatar: user.avatar || '',
      whatsapp: whatsapp && whatsapp !== user.phone ? whatsapp : '',
      sameWhatsapp: !whatsapp || whatsapp === user.phone,
      gender: user.gender || '',
      age: user.birthYear ? String(ageFromBirthYear(user.birthYear)) : '',
      address: user.address || '',
      pincode: user.pincode || '',
      interests: user.interests || [],
      likedFoods: user.likedFoods || [],
      travellerType: user.travellerType || '',
      diet: user.diet || '',
    });
  }, [user, loading, nav]);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  // Works from the latest list, so quick taps on two chips both count.
  const toggle = (key: 'interests' | 'likedFoods', id: string) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      set({ avatar: await uploadImage(file) });
    } catch (msg: any) {
      toast.error(typeof msg === 'string' ? msg : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // Shown next to the field before saving; the server checks the same rules.
  const pinBad = !!form.pincode && !/^[1-9]\d{5}$/.test(form.pincode);
  const ageNum = Number(form.age);
  const ageBad = !!form.age && (!Number.isInteger(ageNum) || ageNum < 13 || ageNum > 100);
  const waDigits = form.whatsapp.replace(/\D/g, '');
  const waBad = !form.sameWhatsapp && !!form.whatsapp && (waDigits.length < 10 || waDigits.length > 15);
  const emailBad = !!form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const nameBad = form.name.trim().length < 2;
  const invalid = pinBad || ageBad || waBad || emailBad || nameBad;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (invalid) { setErr('Please fix the fields marked in red.'); return; }
    setBusy(true); setErr('');
    try {
      const { data } = await api.patch('/users/me', {
        name: form.name.trim(),
        email: form.email.trim() || null,
        avatar: form.avatar || null,
        whatsapp: form.sameWhatsapp ? user.phone : (form.whatsapp || null),
        gender: form.gender || null,
        age: form.age ? ageNum : null,
        address: form.address.trim() || null,
        pincode: form.pincode || null,
        interests: form.interests,
        liked_foods: form.likedFoods,
        traveller_type: form.travellerType || null,
        diet: form.diet || null,
      });
      setUser(data.user);
      toast.success('Profile saved');
      nav(next);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) return <div className="p-10 text-center text-ink-soft">Loading…</div>;

  const field = (bad: boolean) => `mt-1 w-full px-3.5 py-2.5 rounded-xl border bg-white outline-none text-sm text-ink ${bad ? 'border-flag' : 'border-[var(--line)] focus:border-pine'}`;
  const chip = (on: boolean) => `px-3.5 py-2 rounded-full border text-sm font-semibold transition-colors ${on ? 'bg-[#1F6656] text-white border-[#1F6656]' : 'bg-white text-ink border-[var(--line)] hover:border-pine/50'}`;
  const label = 'text-xs font-bold uppercase tracking-wider text-ink-soft';

  return (
    <form onSubmit={save} className="mx-auto max-w-2xl px-4 md:px-6 py-6 md:py-10 space-y-6" data-testid="edit-profile">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{setup ? 'Step 2 of 2' : 'Your account'}</div>
        <h1 className="font-display font-extrabold text-3xl text-ink mt-1">{setup ? 'Set up your profile' : 'Edit profile'}</h1>
        <p className="text-sm text-ink-soft mt-1">
          {setup ? 'Tell hosts a little about you. Everything except your name can be filled in later.' : 'Change your details any time. Only your name is required.'}
        </p>
      </div>

      {/* Who you are */}
      <section className="rounded-3xl border border-[var(--line)] bg-white p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-pine to-pine-dark text-white grid place-items-center font-display font-extrabold text-3xl flex-shrink-0">
            {form.avatar ? <img src={form.avatar} alt="" className="w-full h-full object-cover" /> : (form.name.trim().charAt(0).toUpperCase() || 'T')}
          </div>
          <label className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--line)] text-ink font-bold text-sm btn-hover cursor-pointer" data-testid="edit-photo">
            <Upload size={14} /> {uploading ? 'Uploading…' : form.avatar ? 'Change photo' : 'Add photo'}
            <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} onChange={pickPhoto} className="hidden" />
          </label>
        </div>

        <label className="block">
          <span className={label}>Name</span>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} data-testid="edit-name" className={field(nameBad)} />
          {nameBad && <span className="text-xs text-flag font-semibold">Please enter your name.</span>}
        </label>

        <div>
          <span className={label}>Phone number</span>
          <div className="mt-1 flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-mist/60 text-sm text-ink">
            <Phone size={14} className="text-ink-soft" /> {user.phone}
            <span className="ml-auto text-xs text-ink-soft">Used to sign in; cannot be changed here</span>
          </div>
        </div>

        <div>
          <span className={label}>WhatsApp</span>
          <label className="mt-1 flex items-center gap-2 text-sm text-ink cursor-pointer">
            <input type="checkbox" checked={form.sameWhatsapp} onChange={(e) => set({ sameWhatsapp: e.target.checked })} className="accent-[#1F6656] w-4 h-4" data-testid="edit-same-whatsapp" />
            Same as my phone number
          </label>
          {!form.sameWhatsapp && (
            <div className={`${field(waBad)} flex items-center gap-2`}>
              <WhatsappLogo size={16} className="text-[#25D366]" />
              <input value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value.replace(/[^\d+\s-]/g, '') })} type="tel" inputMode="tel" placeholder="98765 43210"
                data-testid="edit-whatsapp" className="flex-1 min-w-0 outline-none bg-transparent" />
            </div>
          )}
          {waBad && <span className="text-xs text-flag font-semibold">Enter a 10-digit WhatsApp number.</span>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className={label}>Gender</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {GENDERS.map((g) => (
                <button key={g.id} type="button" onClick={() => set({ gender: form.gender === g.id ? '' : g.id })} className={chip(form.gender === g.id)} data-testid={`edit-gender-${g.id}`}>{g.label}</button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={label}>Age</span>
            <input value={form.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} inputMode="numeric" placeholder="e.g. 28" data-testid="edit-age" className={field(ageBad)} />
            {ageBad && <span className="text-xs text-flag font-semibold">Age should be between 13 and 100.</span>}
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <label className="block sm:col-span-2">
            <span className={label}>Address</span>
            <input value={form.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} placeholder="House, street, town" data-testid="edit-address" className={field(false)} />
          </label>
          <label className="block">
            <span className={label}>Pincode</span>
            <input value={form.pincode} onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric" placeholder="734101" data-testid="edit-pincode" className={field(pinBad)} />
            {pinBad && <span className="text-xs text-flag font-semibold">6 digits.</span>}
          </label>
        </div>

        <label className="block">
          <span className={label}>Email <span className="normal-case font-semibold">(optional)</span></span>
          <input value={form.email} onChange={(e) => set({ email: e.target.value })} type="email" placeholder="you@example.com" data-testid="edit-email" className={field(emailBad)} />
          {emailBad && <span className="text-xs text-flag font-semibold">That email does not look right.</span>}
        </label>
      </section>

      {/* How you travel */}
      <section className="rounded-3xl border border-[var(--line)] bg-white p-5 space-y-5">
        <h2 className="font-display font-bold text-lg text-ink">How you travel</h2>
        <div>
          <span className={label}>Places you love</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {PLACE_INTERESTS.map((i) => (
              <button key={i.id} type="button" onClick={() => toggle('interests', i.id)} className={chip(form.interests.includes(i.id))} data-testid={`edit-interest-${i.id}`}>{i.label}</button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Foods you like</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {FOODS.map((f) => (
              <button key={f.id} type="button" onClick={() => toggle('likedFoods', f.id)} className={chip(form.likedFoods.includes(f.id))} data-testid={`edit-food-${f.id}`}>{f.label}</button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Type of traveller</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {TRAVELLER_TYPES.map((x) => (
              <button key={x.id} type="button" onClick={() => set({ travellerType: form.travellerType === x.id ? '' : x.id })} className={chip(form.travellerType === x.id)} data-testid={`edit-type-${x.id}`}>{x.label}</button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Food preference</span>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {DIETS.map((d) => (
              <button key={d.id} type="button" onClick={() => set({ diet: form.diet === d.id ? '' : d.id })} className={chip(form.diet === d.id)} data-testid={`edit-diet-${d.id}`}>{d.label}</button>
            ))}
          </div>
        </div>
      </section>

      {err && <p className="text-sm font-semibold text-flag" data-testid="edit-error">{err}</p>}

      <div className="flex flex-col sm:flex-row gap-3">
        <button type="submit" disabled={busy || uploading} data-testid="edit-save"
          className="inline-flex items-center justify-center gap-2 h-[50px] px-8 rounded-full bg-[#1F6656] text-white font-bold text-[15px] btn-hover disabled:opacity-60">
          <Check size={16} weight="bold" /> {busy ? 'Saving…' : 'Save profile'}
        </button>
        {setup && (
          <button type="button" onClick={() => nav(next)} data-testid="edit-skip"
            className="inline-flex items-center justify-center gap-2 h-[50px] px-6 rounded-full border border-[var(--line)] text-ink font-bold text-[15px] btn-hover">
            Skip for now <ArrowRight size={16} />
          </button>
        )}
      </div>
    </form>
  );
}
