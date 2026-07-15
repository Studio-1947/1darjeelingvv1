import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import { Upload, MapPin } from 'lucide-react';

const TYPES = ['homestay', 'driver', 'shop', 'cafe'];
const SCREEN_H = 'min-h-[calc(100svh-3.5rem)] md:min-h-[calc(100svh-4rem)]';

function Screen({ tone = 'bg', children }: { tone?: 'bg' | 'white' | 'mist', children: React.ReactNode }) {
  const bg = tone === 'white' ? 'bg-white' : tone === 'mist' ? 'bg-mist' : 'bg-[var(--bg)]';
  return (
    <section className={`${SCREEN_H} flex items-center ${bg} border-b border-[var(--line)]`}>
      <div className="mx-auto max-w-6xl w-full px-4 md:px-8 py-16 md:py-20">{children}</div>
    </section>
  );
}

function Eyebrow({ n, children }: { n: string, children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-ink-soft">
      <span className="text-pine">{n}</span>
      <span className="w-8 h-px bg-[var(--line)]" />
      {children}
    </div>
  );
}

export default function ProviderOnboard() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    business_name: '',
    business_type: 'homestay',
    description: '',
    location: '',
    contact_phone: '',
    price_from: '',
    image_url: '',
    host_name: '',
    host_bio: '',
    languages: 'Nepali, Hindi, English',
    host_avatar: '',
    address: '',
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingHostPic, setUploadingHostPic] = useState(false);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [customAmenityInput, setCustomAmenityInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const [payModal, setPayModal] = useState(null);
  const [confirm, setConfirm] = useState(null);

  useEffect(() => {
    if (!user) nav('/login');
  }, [user, nav]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg('');
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const res = await api.post('/listings/upload', {
          file: reader.result,
          filename: file.name
        });
        setForm((prev) => ({ ...prev, image_url: res.data.url }));
      } catch (err: any) {
        setMsg(err?.response?.data?.detail || 'Upload failed');
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setMsg('File reading failed');
      setUploading(false);
    };
  };

  const handleHostAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingHostPic(true);
    setMsg('');
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const res = await api.post('/listings/upload', {
          file: reader.result,
          filename: file.name
        });
        setForm((prev) => ({ ...prev, host_avatar: res.data.url }));
      } catch (err: any) {
        setMsg(err?.response?.data?.detail || 'Host photo upload failed');
      } finally {
        setUploadingHostPic(false);
      }
    };
    reader.onerror = () => {
      setMsg('File reading failed');
      setUploadingHostPic(false);
    };
  };

  const submit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/providers/onboard', {
        business_name: form.business_name,
        business_type: form.business_type,
        description: form.description || `Welcome to ${form.business_name}`,
        location: form.location || 'Darjeeling',
        contact_phone: form.contact_phone || user.phone,
        price_from: Number(form.price_from) || 0,
        images: form.image_url ? [form.image_url] : [],
        extras: {
          host_name: form.host_name || form.business_name.split(' ')[0] || 'Host',
          host_bio: form.host_bio || 'Your local host welcomes you to Darjeeling.',
          languages: form.languages.split(',').map((s) => s.trim()).filter(Boolean),
          contact_phone: form.contact_phone || user.phone,
          host_avatar: form.host_avatar || '',
          address: form.address || '',
          amenities: selectedAmenities,
          tags: selectedTags
        }
      });
      const providerId = data.provider.id;
      const orderRes = await createPaymentOrder({ flow: 'provider_registration', reference_id: providerId });
      if (orderRes.mock) {
        setPayModal({
          amount: orderRes.amount,
          order: orderRes.order,
          description: 'one-time registration',
          providerId,
        });
      } else {
        await payWithRazorpay({
          order: orderRes.order,
          key_id: orderRes.key_id,
          flow: 'provider_registration',
          reference_id: providerId,
          description: '₹99 one-time provider registration',
          prefill: { contact: user.phone, name: user.name },
        });
        await refresh();
        nav('/provider/dashboard');
      }
    } catch (e: any) {
      setMsg(e?.response?.data?.detail || e.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    if (!payModal) return;
    const res = await completeMockPayment({
      order_id: payModal.order.id,
      flow: 'provider_registration',
      reference_id: payModal.providerId,
    });
    setPayModal(null);
    await refresh();
    setConfirm({ open: true, data: res.record });
  };

  // Step 1: Core Details Questions
  if (step === 1) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 md:py-24">
        <div className="text-center mb-8">
          <span className="chip">₹99 · One-time fee</span>
          <h1 className="mt-3 font-display font-extrabold text-3xl text-ink">List Your Business</h1>
          <p className="mt-2 text-sm text-ink-soft">Get started by entering your basic business details.</p>
        </div>

        <div className="mist-panel p-6 space-y-5">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Business Name</span>
            <input
              required
              value={form.business_name}
              onChange={(e) => setForm({ ...form, business_name: e.target.value })}
              placeholder="e.g. Pine Breeze Homestay"
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none font-semibold text-sm text-ink"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Business Type</span>
            <select
              value={form.business_type}
              onChange={(e) => setForm({ ...form, business_type: e.target.value })}
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none font-semibold text-sm text-ink capitalize"
            >
              {TYPES.map((tp) => (
                <option key={tp} value={tp}>
                  {tp}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => {
              if (!form.business_name.trim()) {
                setMsg('Business name is required');
                return;
              }
              setMsg('');
              // Initialize default host name
              setForm((prev) => ({
                ...prev,
                host_name: prev.host_name || prev.business_name.split(' ')[0] || 'Host',
              }));
              setStep(2);
            }}
            className="w-full py-3 rounded-full bg-flag text-white font-bold btn-hover"
          >
            Next: Design Profile
          </button>
          {msg && <p className="text-xs text-center text-flag font-semibold">{msg}</p>}
        </div>
      </div>
    );
  }

  // Step 2: Listing Detail Page Replica (Only for Homestay)
  if (form.business_type === 'homestay') {
    return (
      <div className="pb-10">
        {/* ============ HERO COVER — direct replica ============ */}
        <section className={`relative ${SCREEN_H} w-full overflow-hidden bg-mist border-b border-[var(--line)]`}>
          {form.image_url ? (
            <img src={form.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-slate-200 grid place-items-center text-slate-400">
              No Cover Photo Uploaded (Click Top Right)
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/45" />

          {/* Upload Button Overlay */}
          <div className="absolute top-6 right-6 z-10">
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/95 backdrop-blur text-ink font-bold text-xs btn-hover cursor-pointer shadow-lg">
              <Upload size={14} /> {uploading ? 'Uploading...' : 'Upload Cover Photo'}
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10">
            <div className="mx-auto max-w-6xl px-4 md:px-8 pb-16 md:pb-20">
              <span className="chip bg-white/95 text-ink font-extrabold uppercase text-[10px]">Homestay</span>
              
              {/* Inline Title input */}
              <div className="mt-4 max-w-4xl">
                <input
                  type="text"
                  value={form.business_name}
                  onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                  placeholder="Enter stay name..."
                  className="bg-transparent border-b border-white/20 text-white font-display font-extrabold text-4xl sm:text-5xl md:text-7xl outline-none focus:border-white leading-none w-full"
                />
              </div>
              
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-white/90 text-sm md:text-base font-semibold">
                <span className="flex items-center gap-1.5"><MapPin size={16} /> {form.location || 'Lebong, Darjeeling'}</span>
                <span className="flex items-center gap-1.5">₹{form.price_from || '1500'}<span className="font-normal text-white/75">/night starting</span></span>
              </div>
            </div>
          </div>
        </section>

        {/* ============ ABOUT SCREEN — replica ============ */}
        <Screen tone="bg">
          <Eyebrow n="01">About the stay</Eyebrow>
          <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-start">
            <div className="lg:col-span-3 space-y-4">
              <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Describe Your Homestay</h2>
              <textarea
                required
                rows={5}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Describe your homestay, rooms, meals, view, and unique things about your stay..."
                className="w-full px-4 py-3.5 rounded-2xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
              />
            </div>

            <div className="lg:col-span-2 mist-panel p-5 md:p-6 w-full space-y-4 bg-white">
              <div>
                <span className="text-xs font-semibold text-ink-soft uppercase">Location / Area</span>
                <input
                  required
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Lebong, Darjeeling"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
                />
              </div>
              <div>
                <span className="text-xs font-semibold text-ink-soft uppercase">Full Address</span>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="e.g. 15 Gandhi Road, near Clock Tower"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
                />
              </div>
              <div>
                <span className="text-xs font-semibold text-ink-soft uppercase">Contact Phone</span>
                <input
                  required
                  type="text"
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="e.g. +91 88888 88888"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
                />
              </div>
              <div className="pt-2">
                <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">Listing Tags</span>
                <div className="flex flex-wrap gap-1.5">
                  {['family friendly', 'couple friendly', 'pet friendly', 'group friendly', 'nature lovers'].map((t) => {
                    const active = selectedTags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setSelectedTags((prev) =>
                            prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                          active ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-[var(--line)]'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Screen>

        {/* ============ WHAT THIS PLACE OFFERS — replica ============ */}
        <Screen tone="white">
          <Eyebrow n="01.5">What this place offers</Eyebrow>
          <div className="mt-8 w-full">
            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-ink">Select Stay Amenities</h2>
            <p className="text-sm text-ink-soft mt-2">Choose what amenities you offer guests, and add any other custom ones.</p>
            
            {/* Checklist of predefined amenities */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              {['Wi-Fi', 'Home-cooked meals', 'Hot water & heating', 'Hill views', 'Parking on site', 'Garden & forest setting', 'Quiet & cosy'].map((amenity) => {
                const active = selectedAmenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => {
                      setSelectedAmenities((prev) =>
                        prev.includes(amenity) ? prev.filter((x) => x !== amenity) : [...prev, amenity]
                      );
                    }}
                    className={`flex items-center gap-3 p-4 rounded-xl border text-left font-semibold text-sm transition-all ${
                      active ? 'bg-pine/10 text-pine border-pine font-bold' : 'bg-white text-ink border-[var(--line)]'
                    }`}
                  >
                    <input type="checkbox" checked={active} readOnly className="rounded border-[var(--line)] text-pine focus:ring-pine" />
                    <span>{amenity}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Amenities Input */}
            <div className="mt-8 max-w-md">
              <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">Add Other Custom Amenity</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customAmenityInput}
                  onChange={(e) => setCustomAmenityInput(e.target.value)}
                  placeholder="e.g. Bonfire bonfire, Pet allowed"
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!customAmenityInput.trim()) return;
                    if (!selectedAmenities.includes(customAmenityInput.trim())) {
                      setSelectedAmenities((prev) => [...prev, customAmenityInput.trim()]);
                    }
                    setCustomAmenityInput('');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-pine text-white font-bold text-sm btn-hover"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Selected amenities list (with remove button) */}
            {selectedAmenities.length > 0 && (
              <div className="mt-6 border-t border-[var(--line)] pt-5">
                <span className="text-xs font-semibold text-ink-soft uppercase block mb-3">All Selected Amenities ({selectedAmenities.length})</span>
                <div className="flex flex-wrap gap-2">
                  {selectedAmenities.map((amenity) => (
                    <span key={amenity} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-mist border border-[var(--line)] text-ink font-bold text-xs">
                      {amenity}
                      <button
                        type="button"
                        onClick={() => setSelectedAmenities((prev) => prev.filter((x) => x !== amenity))}
                        className="text-flag font-extrabold hover:scale-110 transition-transform ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Screen>

        {/* ============ MEET YOUR HOST — replica ============ */}
        <Screen tone="mist">
          <Eyebrow n="02">Meet your host</Eyebrow>
          <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
            <div className="lg:col-span-2 flex flex-col items-center lg:items-start text-center lg:text-left">
              <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white overflow-hidden shadow-md flex items-center justify-center font-display font-extrabold text-4xl md:text-5xl">
                {form.host_avatar ? (
                  <img src={form.host_avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  (form.host_name || 'Host').charAt(0).toUpperCase()
                )}
              </div>
              <div className="mt-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-xs btn-hover cursor-pointer shadow-sm">
                  <Upload size={12} /> {uploadingHostPic ? 'Uploading...' : 'Upload Host Photo'}
                  <input type="file" accept="image/*" onChange={handleHostAvatarUpload} className="hidden" />
                </label>
              </div>
              <div className="mt-5 flex flex-col gap-1 w-full text-left">
                <span className="text-xs font-semibold text-ink-soft uppercase">Host Name</span>
                <input
                  type="text"
                  value={form.host_name}
                  onChange={(e) => setForm({ ...form, host_name: e.target.value })}
                  placeholder="e.g. Mrs. Pradhan"
                  className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
                />
              </div>
            </div>

            <div className="lg:col-span-3 space-y-5">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-soft uppercase">Host Bio / Welcome Message</span>
                <textarea
                  rows={3}
                  value={form.host_bio}
                  onChange={(e) => setForm({ ...form, host_bio: e.target.value })}
                  placeholder="Tell guests about yourself. e.g. We are a family of four who love introducing visitors to Gorkha traditions..."
                  className="px-4 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-ink-soft uppercase">Languages Spoken (comma separated)</span>
                <input
                  type="text"
                  value={form.languages}
                  onChange={(e) => setForm({ ...form, languages: e.target.value })}
                  placeholder="Nepali, Hindi, English"
                  className="px-3 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink"
                />
              </div>
            </div>
          </div>
        </Screen>

        {/* ============ PRICE / SUBMIT SCREEN — replica ============ */}
        <Screen tone="white">
          <Eyebrow n="03">Complete profile</Eyebrow>
          <div className="mt-8 grid lg:grid-cols-5 gap-10 lg:gap-16 items-center">
            <div className="lg:col-span-2">
              <span className="text-xs font-semibold text-ink-soft uppercase">Starting Price (₹/Night)</span>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl text-ink font-display font-extrabold">₹</span>
                <input
                  required
                  type="number"
                  min="0"
                  value={form.price_from}
                  onChange={(e) => setForm({ ...form, price_from: e.target.value })}
                  placeholder="1500"
                  className="px-3 py-2 rounded-xl border border-[var(--line)] bg-white outline-none font-display font-extrabold text-4xl text-ink w-36"
                />
                <span className="text-sm font-semibold text-ink-soft">/ night onwards</span>
              </div>
              <p className="mt-5 text-xs text-ink-soft leading-relaxed">
                A one-time platform fee of ₹99 is charged to list your stay profile live on the homepage directory.
              </p>
            </div>

            <div className="lg:col-span-3">
              <div className="mist-panel p-6 space-y-4">
                <button
                  onClick={() => submit()}
                  disabled={busy || uploading || !form.price_from || !form.description || !form.location}
                  className="w-full py-4 rounded-full bg-flag text-white font-extrabold text-base btn-hover disabled:opacity-60"
                >
                  {busy ? 'Processing...' : 'Submit & Pay ₹99'}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full py-3 rounded-full border border-[var(--line)] text-ink font-bold text-sm btn-hover"
                >
                  Back to Basic Info
                </button>
                {msg && <p className="text-sm text-center text-flag font-semibold">{msg}</p>}
              </div>
            </div>
          </div>
        </Screen>

        {/* Mock Payment Modals */}
        <MockPaymentModal
          open={!!payModal}
          onClose={() => setPayModal(null)}
          amount={payModal?.amount || 0}
          title="Provider registration"
          description={payModal?.description || ''}
          onPay={finishMockPayment}
          prefill={{ upi: `${(form.business_name || 'business').toLowerCase().replace(/\s+/g, '')}@ybl` }}
        />

        <BookingConfirmation
          open={!!confirm?.open}
          onClose={() => { setConfirm(null); nav('/provider/dashboard'); }}
          mode="provider"
          data={confirm?.data}
          onView={() => { setConfirm(null); nav('/provider/dashboard'); }}
        />
      </div>
    );
  }

  // Step 2: Streamlined form for other business types (Driver, Shop, Cafe)
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <form onSubmit={submit} className="mist-panel p-5 md:p-8 space-y-4">
        <h2 className="font-display font-extrabold text-2xl text-ink mb-2">Onboard Business Profile</h2>
        <p className="text-xs text-ink-soft mb-4 capitalize">Category: {form.business_type}</p>
        
        <label className="block">
          <span className="text-xs font-semibold text-ink-soft">Description</span>
          <textarea required rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Introduce your business to visitors..."
            className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed" />
        </label>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Location</span>
            <input required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Darjeeling Town"
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Contact Phone</span>
            <input required value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
              placeholder="e.g. +91 98765 43210"
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink" />
          </label>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Starting Price / Average spend (₹)</span>
            <input required type="number" min="0" value={form.price_from} onChange={(e) => setForm({ ...form, price_from: e.target.value })}
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink" />
          </label>
          
          <div className="block">
            <span className="text-xs font-semibold text-ink-soft">Business Cover Image</span>
            <div className="mt-1 flex items-center gap-3">
              <div className="w-16 h-12 rounded-lg bg-mist overflow-hidden border border-[var(--line)] flex-shrink-0 flex items-center justify-center relative">
                {form.image_url ? (
                  <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] text-ink-soft">No Image</span>
                )}
                {uploading && <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-[9px] text-white">...</div>}
              </div>
              <label className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-[var(--line)] text-ink font-bold text-xs btn-hover cursor-pointer">
                <Upload size={12} /> Upload Photo
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        <div className="pt-4 flex gap-3">
          <button type="button" onClick={() => setStep(1)} className="w-1/3 py-3 rounded-full border border-[var(--line)] text-ink font-bold text-sm btn-hover">
            Back
          </button>
          <button disabled={busy || uploading} type="submit" className="flex-1 py-3 rounded-full bg-flag text-white font-bold btn-hover disabled:opacity-60">
            {busy ? 'Processing...' : 'Submit & Pay ₹99'}
          </button>
        </div>
        {msg && <p className="text-sm text-center text-flag font-semibold">{msg}</p>}
      </form>

      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title="Provider registration"
        description={payModal?.description || ''}
        onPay={finishMockPayment}
        prefill={{ upi: `${(form.business_name || 'business').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />

      <BookingConfirmation
        open={!!confirm?.open}
        onClose={() => { setConfirm(null); nav('/provider/dashboard'); }}
        mode="provider"
        data={confirm?.data}
        onView={() => { setConfirm(null); nav('/provider/dashboard'); }}
      />
    </div>
  );
}
