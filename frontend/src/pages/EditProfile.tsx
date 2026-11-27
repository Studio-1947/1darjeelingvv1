import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CaretDown, Phone, CircleNotch as Loader2 } from '@phosphor-icons/react';
import { Icon } from '@/components/ag/Icon';
import SignOutButton from '@/components/SignOutButton';
import BlockedPeople from '@/components/BlockedPeople';
import { Avatar } from '@/components/TravellerPanels';
import { Box, Button, Chip, Chips, FieldError, PageHead, TextField } from '@/components/ag';
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
  const { t } = useTranslation();
  useSeo({ title: t('nav.edit_profile'), noindex: true });
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
      toast.error(typeof msg === 'string' ? msg : t('ui.editProfile.upload_failed'));
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
    if (invalid) { setErr(t('ui.editProfile.fix_fields')); return; }
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
      toast.success(t('ui.editProfile.saved'));
      nav(next);
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('ui.editProfile.save_failed'));
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;

  /** A labelled chip group; one or many can be on. */
  const group = (label: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-2" role="group" aria-label={label}>
      <span className="text-sm font-medium text-[var(--ink-strong)]">{label}</span>
      <Chips>{children}</Chips>
    </div>
  );

  return (
    <div className="ag-wrap">
      <div className="ag-main">
      <form onSubmit={save} className="contents" data-testid="edit-profile" noValidate>
        <PageHead eyebrow={setup ? t('ui.editProfile.step_2_of_2') : t('ui.editProfile.your_account')}
          title={setup ? t('ui.editProfile.setup_title') : t('nav.profile')}
          sub={setup ? t('ui.editProfile.setup_lead') : undefined} />

        {/* Who you are */}
        <Box as="section">
          <div className="flex items-center gap-3 min-w-0">
            {/* While the photo goes up, a spinner over it (as AvatarUploader does on the business side). */}
            <div className="relative flex-none overflow-hidden rounded-full">
              <Avatar name={form.name} src={form.avatar} size={72} />
              {uploading && (
                <div className="absolute inset-0 grid place-items-center bg-black/45 text-white" data-testid="edit-photo-uploading">
                  <Loader2 size={22} className="animate-spin" aria-hidden="true" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex flex-col gap-0.5">
              <h2 className="truncate !text-[18px]">{form.name.trim() || t('dashboard.traveller')}</h2>
              <label className={`ag-account-photo${uploading ? ' pointer-events-none opacity-70' : ''}`} data-testid="edit-photo" aria-busy={uploading}>
                {uploading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Icon name="download" />} {uploading ? t('common.uploading') : form.avatar ? t('ui.editProfile.change_photo') : t('ui.editProfile.add_photo')}
                <input type="file" accept={SUPPORTED_IMAGE_ACCEPT} onChange={pickPhoto} disabled={uploading} className="hidden" />
              </label>
            </div>
          </div>
          <h2>{t('ui.account.yourdetails', 'Your details')}</h2>
          <p className="ag-small -mt-2" data-testid="edit-signed-via">{user.phone ? t('ui.account.signed_wa', 'Signed in with WhatsApp') : t('ui.account.signed_gg', 'Signed in with Google')}</p>

          <TextField label={t('ui.editProfile.name')} value={form.name} onChange={(e) => set({ name: e.target.value })} maxLength={100} autoComplete="name"
            data-testid="edit-name" error={nameBad ? t('ui.editProfile.name_error') : undefined} errorId="edit-name-error" />

          <div className="ag-field">
            <span>{t('ui.editProfile.phone')}</span>
            <div className="ag-in flex items-center gap-2 !bg-[var(--soft)] text-[var(--ink-strong)]">
              <Phone size={16} className="text-[var(--ink-muted)]" aria-hidden="true" /> {/^\+91\d{10}$/.test(user.phone || '') ? `+91 ${user.phone.slice(3)}` : user.phone}
            </div>
            <span className="hint">{t('ui.editProfile.phone_note')}</span>
          </div>

          <TextField label={<>{t('ui.editProfile.email')} <span className="font-normal text-[var(--ink-muted)]">{t('ui.editProfile.optional')}</span></>}
            value={form.email} onChange={(e) => set({ email: e.target.value })} type="email" autoComplete="email" placeholder="you@example.com"
            data-testid="edit-email" error={emailBad ? t('ui.editProfile.email_error') : undefined} errorId="edit-email-error" />

          {/* More than the prototype asks for: optional, folded away so the card reads like the prototype. */}
          <details className="group" open={setup || pinBad || ageBad || waBad || undefined} data-testid="edit-more">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-[var(--r)] [&::-webkit-details-marker]:hidden">
              <span>{t('ui.editProfile.more', 'More about you')} <span className="font-normal text-[var(--ink-muted)]">{t('ui.editProfile.optional')}</span></span>
              <CaretDown size={14} weight="bold" className="transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[var(--ink-strong)]">{t('ui.editProfile.whatsapp')}</span>
                <label className="flex items-center gap-2 text-sm text-[var(--ink7)] cursor-pointer min-h-11">
                  <input type="checkbox" checked={form.sameWhatsapp} onChange={(e) => set({ sameWhatsapp: e.target.checked })} className="accent-[var(--r)] w-5 h-5" data-testid="edit-same-whatsapp" />
                  {t('ui.editProfile.same_as_phone')}
                </label>
                {!form.sameWhatsapp && (
                  <TextField aria-label={t('ui.editProfile.whatsapp')} value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value.replace(/[^\d+\s-]/g, '') })}
                    type="tel" inputMode="tel" placeholder="98765 43210" data-testid="edit-whatsapp"
                    error={waBad ? t('ui.editProfile.whatsapp_error') : undefined} errorId="edit-whatsapp-error" />
                )}
              </div>

              {group(t('ui.editProfile.gender'), GENDERS.map((g) => (
                <Chip key={g.id} on={form.gender === g.id} onClick={() => set({ gender: form.gender === g.id ? '' : g.id })} data-testid={`edit-gender-${g.id}`}>{t(g.labelKey)}</Chip>
              )))}

              <TextField label={t('ui.editProfile.age')} value={form.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} inputMode="numeric"
                placeholder={t('ui.editProfile.age_placeholder')} data-testid="edit-age" error={ageBad ? t('ui.editProfile.age_error') : undefined} errorId="edit-age-error" />

              <TextField label={t('ui.editProfile.address')} value={form.address} onChange={(e) => set({ address: e.target.value })} maxLength={300} autoComplete="street-address"
                placeholder={t('ui.editProfile.address_placeholder')} data-testid="edit-address" />

              <TextField label={t('ui.editProfile.pincode')} value={form.pincode} onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '').slice(0, 6) })} inputMode="numeric"
                autoComplete="postal-code" placeholder="734101" data-testid="edit-pincode" error={pinBad ? t('ui.editProfile.pincode_error') : undefined} errorId="edit-pincode-error" />
              <h3 id="travel-title" className="!text-base font-medium text-[var(--ink-strong)]">{t('ui.editProfile.how_you_travel')}</h3>
              {group(t('ui.editProfile.places_you_love'), PLACE_INTERESTS.map((i) => (
                <Chip key={i.id} on={form.interests.includes(i.id)} onClick={() => toggle('interests', i.id)} data-testid={`edit-interest-${i.id}`}>{t(i.labelKey)}</Chip>
              )))}
              {group(t('ui.editProfile.foods_you_like'), FOODS.map((f) => (
                <Chip key={f.id} on={form.likedFoods.includes(f.id)} onClick={() => toggle('likedFoods', f.id)} data-testid={`edit-food-${f.id}`}>{t(f.labelKey)}</Chip>
              )))}
              {group(t('ui.editProfile.traveller_type'), TRAVELLER_TYPES.map((x) => (
                <Chip key={x.id} on={form.travellerType === x.id} onClick={() => set({ travellerType: form.travellerType === x.id ? '' : x.id })} data-testid={`edit-type-${x.id}`}>{t(x.labelKey)}</Chip>
              )))}
              {group(t('ui.editProfile.food_preference'), DIETS.map((d) => (
                <Chip key={d.id} on={form.diet === d.id} onClick={() => set({ diet: form.diet === d.id ? '' : d.id })} data-testid={`edit-diet-${d.id}`}>{t(d.labelKey)}</Chip>
              )))}
            </div>
          </details>

          <FieldError id="edit-error">{err}</FieldError>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" go disabled={busy || uploading} data-testid="edit-save">
              {busy ? t('common.saving') : t('ui.account.savedetails', 'Save details')}
            </Button>
            {setup && (
              <Button variant="text" onClick={() => nav(next)} data-testid="edit-skip">{t('ui.editProfile.skip')}</Button>
            )}
          </div>
        </Box>
      </form>

        {!setup && <BlockedPeople />}
        {/* Full width, as on the Account tab and the Business profile. */}
        {!setup && <SignOutButton />}
      </div>
    </div>
  );
}
