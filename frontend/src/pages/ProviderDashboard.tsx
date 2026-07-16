import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, Clock, Wallet, CalendarCheck, Users, LayoutList, Phone, MessageCircle, ArrowRight, ExternalLink, X, Upload, Plus, Trash2, Edit, Pencil } from 'lucide-react';
import ListingFormModal from '@/components/ListingFormModal';

function StatCard({ label, value, sub, icon: Icon, tone = 'pine' }: { label: string; value: any; sub?: string; icon: any; tone?: string }) {
  const tones = {
    pine: 'from-pine to-pine-dark',
    flag: 'from-flag to-[#8a1e1e]',
    gold: 'from-gold to-[#c69108]',
    ink: 'from-ink to-[#374a41]',
  };
  return (
    <div className={`rounded-2xl p-4 md:p-5 text-white bg-gradient-to-br ${tones[tone]}`}>
      <div className="flex items-center gap-2 opacity-90"><Icon size={16} /> <span className="text-[11px] uppercase tracking-widest font-bold">{label}</span></div>
      <div className="mt-1 font-display font-extrabold text-2xl md:text-3xl leading-none">{value}</div>
      {sub && <div className="mt-1 text-xs text-white/85">{sub}</div>}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    confirmed: 'bg-pine/10 text-pine',
    pending_payment: 'bg-gold/20 text-[#8a6b04]',
    cancelled: 'bg-flag/10 text-flag',
  };
  return <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${map[status] || 'bg-mist text-ink-soft'}`}>{status?.replace('_', ' ')}</span>;
}

export default function ProviderDashboard() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const [provider, setProvider] = useState(null);
  const [stats, setStats] = useState({ total: 0, confirmed: 0, pending: 0, revenue: 0 });
  const [bookings, setBookings] = useState([]);
  const [listings, setListings] = useState([]);
  const [tab, setTab] = useState('bookings');
  const [selectedListing, setSelectedListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [listingModal, setListingModal] = useState<{ open: boolean; editing: any | null }>({ open: false, editing: null });

  const loadData = useCallback(async () => {
    const [p, b] = await Promise.all([
      api.get('/providers/me'),
      api.get('/bookings/provider'),
    ]);
    setProvider(p.data.provider);
    setStats(b.data.stats || {});
    setBookings(b.data.items || []);
    setListings(b.data.listings || []);
  }, []);

  const loadDashboard = React.useCallback(async () => {
    try {
      const [p, b] = await Promise.all([
        api.get('/providers/me'),
        api.get('/bookings/provider'),
      ]);
      setProvider(p.data.provider);
      setStats(b.data.stats || {});
      setBookings(b.data.items || []);
      setListings(b.data.listings || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login'); return; }
    (async () => {
      try {
        await loadDashboard();
      } finally {
        setLoading(false);
      }
    })();
  }, [user, authLoading, nav, loadDashboard]);

  const handleSaveListing = async (values: any) => {
    if (listingModal.editing) {
      await api.patch(`/listings/${listingModal.editing.id}`, values);
    } else {
      await api.post('/listings', values);
    }
    await loadDashboard();
  };

  const handleDeleteListing = async (listingId: string) => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
    await api.delete(`/listings/${listingId}`);
    await loadDashboard();
  };

  if (authLoading || loading) return <div className="p-10 text-center text-ink-soft">{t('common.loading')}</div>;

  if (!provider) {
    return (
      <div className="mx-auto max-w-2xl p-10 text-center">
        <h1 className="font-display font-extrabold text-3xl text-ink">No business yet</h1>
        <p className="text-ink-soft mt-2">Onboard your business to start receiving bookings.</p>
        <button onClick={() => nav('/provider/onboard')} data-testid="onboard-cta"
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-flag text-white font-bold btn-hover">
          {t('provider.onboard_title')} <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  const active = provider.status === 'active';

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10">
      {/* Header block */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag">{t('provider.dashboard_title')}</div>
          <h1 className="mt-1 font-display font-extrabold text-3xl sm:text-4xl md:text-5xl text-ink leading-tight">{provider.business_name}</h1>
          <p className="text-sm text-ink-soft mt-1 capitalize">{provider.business_type} · {provider.location}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              localStorage.setItem(`unlocked_traveller_${user.id}`, 'true');
              nav('/dashboard');
            }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-pine border border-pine/30 rounded-full px-3.5 py-1.5 hover:bg-pine/5 transition-colors"
          >
            Switch to Traveller
          </button>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs ${active ? 'bg-pine/10 text-pine' : 'bg-gold/20 text-[#8a6b04]'}`}
            data-testid="provider-status">
            {active ? <CheckCircle2 size={14} /> : <Clock size={14} />} {active ? t('provider.active') : t('provider.pending')}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Total bookings" value={stats.total} icon={LayoutList} tone="pine" />
        <StatCard label="Confirmed" value={stats.confirmed} sub={`${stats.pending} pending`} icon={CalendarCheck} tone="flag" />
        <StatCard label="Revenue" value={`₹${stats.revenue.toLocaleString('en-IN')}`} sub="from confirmed bookings" icon={Wallet} tone="gold" />
        {listings.length > 0 ? (
          <button
            onClick={() => setSelectedListing(listings[0])}
            className="text-left w-full rounded-2xl p-4 md:p-5 text-white bg-gradient-to-br from-ink to-[#374a41] hover:shadow-lg transition-all duration-200 flex flex-col justify-between"
            data-testid="edit-listing-stat-card"
          >
            <div className="flex items-center gap-2 opacity-90">
              <Edit size={16} /> 
              <span className="text-[11px] uppercase tracking-widest font-bold">Edit your listing</span>
            </div>
            <div className="mt-3 font-display font-extrabold text-lg md:text-xl leading-tight flex items-center justify-between w-full">
              <span>Configure Stay</span>
              <ArrowRight size={18} className="opacity-90" />
            </div>
          </button>
        ) : (
          <StatCard label="Listings live" value={0} icon={Users} tone="ink" />
        )}
      </div>

      {/* Tabs */}
      <div className="mt-8 flex items-center gap-2 border-b border-[var(--line)]">
        {[
          { k: 'bookings', label: 'Bookings' },
          { k: 'listings', label: 'Listings' },
          { k: 'profile', label: 'Business profile' },
        ].map(({ k, label }) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
            className={`px-4 py-2.5 font-bold text-sm ${tab === k ? 'text-flag border-b-2 border-flag -mb-px' : 'text-ink-soft hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Bookings */}
      {tab === 'bookings' && (
        <div className="mt-6">
          {bookings.length === 0 ? (
            <div className="mist-panel p-8 md:p-10 text-center">
              <p className="text-ink-soft">No bookings yet. Share your listing links to get your first booking.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {bookings.map((b) => (
                <article key={b.id} data-testid={`booking-${b.id}`}
                  className="bg-white rounded-2xl border border-[var(--line)] p-4 md:p-5 flex gap-4">
                  <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-mist flex-shrink-0">
                    {b.listing?.image && <img src={b.listing.image} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display font-bold text-ink text-base leading-tight line-clamp-1">{b.listing?.title || b.listing_title}</div>
                        <div className="text-xs text-ink-soft mt-0.5">{b.customer?.name || 'Tourist'} · {b.customer?.phone}</div>
                      </div>
                      <StatusPill status={b.status} />
                    </div>
                    <div className="mt-2 text-xs text-ink-soft space-y-0.5">
                      {b.check_in && <div>Check-in: <b className="text-ink">{b.check_in}</b>{b.check_out && <> → <b className="text-ink">{b.check_out}</b></>}</div>}
                      <div>Guests: <b className="text-ink">{b.guests}</b> · Placed: {new Date(b.created_at).toLocaleDateString()}</div>
                      {b.notes && <div className="italic">“{b.notes}”</div>}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a href={`tel:${b.customer?.phone || ''}`} data-testid={`booking-call-${b.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pine text-white font-bold text-xs btn-hover">
                        <Phone size={12} /> Call
                      </a>
                      <a href={`https://wa.me/${(b.customer?.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${b.customer?.name || ''}, this is regarding your booking for ${b.listing?.title || ''} on 1 Darjeeling.`)}`}
                        target="_blank" rel="noreferrer" data-testid={`booking-wa-${b.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366] text-white font-bold text-xs btn-hover">
                        <MessageCircle size={12} /> WhatsApp
                      </a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Listings */}
      {tab === 'listings' && (
        <div className="mt-6">
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setListingModal({ open: true, editing: null })}
              data-testid="add-listing-cta"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-flag text-white font-bold text-xs btn-hover"
            >
              <Plus size={14} /> Add listing
            </button>
          </div>
          {listings.length === 0 ? (
            <div className="mist-panel p-8 text-center text-ink-soft">You have no active listings.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((l) => (
                <div key={l.id} className="bg-white rounded-2xl border border-[var(--line)] overflow-hidden">
                  <div className="aspect-[4/3] bg-mist overflow-hidden">
                    {l.image && <img src={l.image} alt={l.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-4">
                    <div className="font-display font-bold text-ink line-clamp-1">{l.title}</div>
                    <div className="text-xs text-ink-soft mt-0.5 capitalize">{l.type} · {l.location}</div>
                    {l.price > 0 && <div className="mt-2 font-extrabold text-pine">₹{l.price}</div>}
                    <div className="mt-3 flex items-center gap-3">
                      <Link to={`/listing/${l.id}`} data-testid={`view-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-pine">
                        View <ExternalLink size={11} />
                      </Link>
                      <button onClick={() => setSelectedListing(l)} data-testid={`edit-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
                        <Pencil size={11} /> Edit
                      </button>
                      <button onClick={() => handleDeleteListing(l.id)} data-testid={`delete-listing-${l.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-flag hover:text-[#8a1e1e]">
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Profile */}
      {tab === 'profile' && (
        <div className="mt-6 mist-panel p-5 md:p-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="text-xs uppercase tracking-widest text-ink-soft">Business</div>
              <div className="mt-1 font-display font-extrabold text-2xl text-ink">{provider.business_name}</div>
              <div className="text-sm text-ink-soft capitalize">{provider.business_type} · {provider.location}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-ink-soft">Contact</div>
              <div className="mt-1 font-display font-extrabold text-2xl text-ink">{provider.contact_phone}</div>
            </div>
          </div>
          <div className="mt-6">
            <div className="text-xs uppercase tracking-widest text-ink-soft">Description</div>
            <p className="mt-1 text-ink leading-relaxed">{provider.description}</p>
          </div>
        </div>
      )}
      {selectedListing && (
        <EditListingModal
          listing={selectedListing}
          onClose={() => setSelectedListing(null)}
          onSave={loadDashboard}
        />
      )}

      <ListingFormModal
        open={listingModal.open}
        initial={listingModal.editing || undefined}
        onClose={() => setListingModal({ open: false, editing: null })}
        onSubmit={handleSaveListing}
      />
    </div>
  );
}

function EditListingModal({ listing, onClose, onSave }: { listing: any; onClose: () => void; onSave: () => void }) {
  const [title, setTitle] = useState(listing.title || '');
  const [price, setPrice] = useState(listing.price || 0);
  const [location, setLocation] = useState(listing.location || '');
  const [description, setDescription] = useState(listing.description || '');
  const [image, setImage] = useState(listing.image || '');
  const [gallery, setGallery] = useState<string[]>(listing.extras?.images || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [hostName, setHostName] = useState(listing.extras?.host_name || '');
  const [hostBio, setHostBio] = useState(listing.extras?.host_bio || '');
  const [hostAvatar, setHostAvatar] = useState(listing.extras?.host_avatar || '');
  const [uploadingHostPic, setUploadingHostPic] = useState(false);
  const [address, setAddress] = useState(listing.extras?.address || '');
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(listing.extras?.amenities || []);
  const [customAmenityInput, setCustomAmenityInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>(listing.tags || listing.extras?.tags || []);

  const uploadFile = async (file: File) => {
    const reader = new FileReader();
    return new Promise<string>((resolve, reject) => {
      reader.readAsDataURL(file);
      reader.onload = async () => {
        try {
          const res = await api.post('/listings/upload', {
            file: reader.result,
            filename: file.name
          });
          resolve(res.data.url);
        } catch (e: any) {
          reject(e?.response?.data?.detail || 'Upload failed');
        }
      };
      reader.onerror = () => reject('File reading failed');
    });
  };

  const handleHeroChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadFile(file);
      setImage(url);
    } catch (err: any) {
      setError(err);
    } finally {
      setUploading(false);
    }
  };

  const handleAddGalleryImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const url = await uploadFile(files[i]);
        urls.push(url);
      }
      setGallery((prev) => [...prev, ...urls]);
    } catch (err: any) {
      setError(err);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveGalleryImage = (index: number) => {
    setGallery((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.put(`/listings/${listing.id}`, {
        title,
        price: Number(price),
        location,
        description,
        image,
        tags: selectedTags,
        extras: {
          ...listing.extras,
          images: gallery,
          host_name: hostName,
          host_bio: hostBio,
          host_avatar: hostAvatar,
          address: address,
          amenities: selectedAmenities,
          tags: selectedTags
        }
      });
      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4 overflow-y-auto" data-testid="edit-listing-modal">
      <div className="bg-white rounded-3xl w-full max-w-2xl border border-[var(--line)] overflow-hidden shadow-2xl animate-fade-up">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-[var(--line)]">
          <h2 className="font-display font-extrabold text-2xl text-ink">Edit Listing Details & Images</h2>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-mist text-ink-soft transition-colors" data-testid="close-edit-modal">
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSave} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Title</span>
              <input required type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink font-semibold" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Price (₹ starting from)</span>
              <input required type="number" min="0" value={price} onChange={(e) => setPrice(Number(e.target.value) || 0)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink font-semibold" />
            </label>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Location</span>
              <input required type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink font-semibold" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-ink-soft">Full Address</span>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 15 Gandhi Road"
                className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink font-semibold" />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-ink-soft">Description</span>
            <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={4}
              className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink" />
          </label>

          {listing.type === 'homestay' && (
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
          )}

          {/* Hero Image Section */}
          <div className="border-t border-[var(--line)] pt-5">
            <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-3">Main Cover Image</span>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              <div className="w-full md:w-48 h-32 rounded-xl bg-mist overflow-hidden border border-[var(--line)] flex-shrink-0 relative">
                {image ? (
                  <img src={image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full grid place-items-center text-xs text-ink-soft">No Cover Image</div>
                )}
                {uploading && <div className="absolute inset-0 bg-black/40 grid place-items-center text-xs text-white">Uploading...</div>}
              </div>
              <div className="flex-1">
                <p className="text-xs text-ink-soft mb-3">This is the large cover background image shown at the top of your details page.</p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-xs btn-hover cursor-pointer">
                  <Upload size={14} /> Choose Cover Image
                  <input type="file" accept="image/*" onChange={handleHeroChange} className="hidden" />
                </label>
              </div>
            </div>
          </div>

          {/* Gallery Images Section */}
          <div className="border-t border-[var(--line)] pt-5">
            <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-1">Photo Gallery</span>
            <p className="text-xs text-ink-soft mb-4">Add photos of your rooms, bathrooms, surroundings, and amenities. These will render as a beautiful gallery inside your public listing page.</p>
            
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {gallery.map((url, index) => (
                <div key={index} className="aspect-[4/3] rounded-xl overflow-hidden border border-[var(--line)] bg-mist relative group">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => handleRemoveGalleryImage(index)}
                    className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/70 hover:bg-black text-white hover:scale-105 transition-all"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              
              <label className="aspect-[4/3] rounded-xl border-2 border-dashed border-[var(--line)] hover:border-flag/50 flex flex-col items-center justify-center gap-1 text-ink-soft hover:text-flag cursor-pointer transition-colors">
                <Plus size={20} />
                <span className="text-[10px] font-bold">Add Photos</span>
                <input type="file" accept="image/*" multiple onChange={handleAddGalleryImage} className="hidden" />
              </label>
            </div>
          </div>

          {/* Amenities Section */}
          {listing.type === 'homestay' && (
            <div className="border-t border-[var(--line)] pt-5 space-y-4">
              <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-1">What this place offers (Amenities)</span>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
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
                      className={`flex items-center gap-2.5 p-3 rounded-xl border text-left font-semibold text-xs transition-all ${
                        active ? 'bg-pine/10 text-pine border-pine font-bold' : 'bg-white text-ink border-[var(--line)]'
                      }`}
                    >
                      <input type="checkbox" checked={active} readOnly className="rounded border-[var(--line)] text-pine focus:ring-pine" />
                      <span>{amenity}</span>
                    </button>
                  );
                })}
              </div>

              <div className="max-w-md pt-2">
                <span className="text-xs font-semibold text-ink-soft uppercase block mb-2">Add Custom Amenity</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customAmenityInput}
                    onChange={(e) => setCustomAmenityInput(e.target.value)}
                    placeholder="e.g. Bonfire bonfire"
                    className="flex-1 px-3 py-2 rounded-xl border border-[var(--line)] bg-white outline-none text-xs font-semibold text-ink"
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
                    className="px-3.5 py-2 rounded-xl bg-pine text-white font-bold text-xs btn-hover"
                  >
                    Add
                  </button>
                </div>
              </div>

              {selectedAmenities.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedAmenities.map((amenity) => (
                    <span key={amenity} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-mist border border-[var(--line)] text-ink font-bold text-[10px]">
                      {amenity}
                      <button
                        type="button"
                        onClick={() => setSelectedAmenities((prev) => prev.filter((x) => x !== amenity))}
                        className="text-flag font-extrabold ml-1 hover:scale-110"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Host Settings */}
          {listing.type === 'homestay' && (
            <div className="border-t border-[var(--line)] pt-5 space-y-4">
              <span className="text-xs font-extrabold uppercase tracking-widest text-ink-soft block mb-1">Host Information</span>
              
              <div className="flex flex-col md:flex-row gap-4 items-start">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-pine to-pine-dark text-white overflow-hidden shadow-md flex items-center justify-center font-display font-extrabold text-2xl flex-shrink-0 relative">
                  {hostAvatar ? (
                    <img src={hostAvatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (hostName || 'Host').charAt(0).toUpperCase()
                  )}
                  {uploadingHostPic && <div className="absolute inset-0 bg-black/40 grid place-items-center text-[10px] text-white">...</div>}
                </div>
                <div className="flex-1 space-y-3 w-full">
                  <label className="block">
                    <span className="text-xs font-semibold text-ink-soft">Host Name</span>
                    <input type="text" value={hostName} onChange={(e) => setHostName(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] bg-white outline-none text-sm font-semibold text-ink" />
                  </label>
                  
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-[var(--line)] text-ink font-bold text-xs btn-hover cursor-pointer">
                    <Upload size={12} /> {uploadingHostPic ? 'Uploading...' : 'Upload Host Photo'}
                    <input type="file" accept="image/*" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingHostPic(true);
                      setError('');
                      try {
                        const url = await uploadFile(file);
                        setHostAvatar(url);
                      } catch (err: any) {
                        setError(err);
                      } finally {
                        setUploadingHostPic(false);
                      }
                    }} className="hidden" />
                  </label>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-ink-soft">Host Bio</span>
                <textarea rows={3} value={hostBio} onChange={(e) => setHostBio(e.target.value)}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink leading-relaxed" />
              </label>
            </div>
          )}

          {error && (
            <div className="p-3 bg-flag/10 border border-flag/20 rounded-xl text-xs text-flag font-semibold text-center animate-pulse">
              {error}
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-[var(--line)] pt-5 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full border border-[var(--line)] text-ink font-bold text-sm btn-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploading}
              data-testid="save-edit-listing"
              className="px-6 py-2.5 rounded-full bg-flag text-white font-bold text-sm btn-hover disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    );
}
