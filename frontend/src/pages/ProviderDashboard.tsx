import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { CheckCircle2, Clock, Wallet, CalendarCheck, Users, LayoutList, Phone, MessageCircle, ArrowRight, ExternalLink, Plus, Pencil, Trash2 } from 'lucide-react';
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

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login'); return; }
    (async () => {
      try {
        await loadData();
      } finally { setLoading(false); }
    })();
  }, [user, authLoading, nav, loadData]);

  const handleSaveListing = async (values: any) => {
    if (listingModal.editing) {
      await api.patch(`/listings/${listingModal.editing.id}`, values);
    } else {
      await api.post('/listings', values);
    }
    await loadData();
  };

  const handleDeleteListing = async (listingId: string) => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return;
    await api.delete(`/listings/${listingId}`);
    await loadData();
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
        <StatCard label="Listings live" value={listings.length} icon={Users} tone="ink" />
      </div>

      {/* Tabs */}
      <div className="mt-8 flex items-center gap-2 border-b border-[var(--line)]">
        {[
          { k: 'bookings', label: 'Bookings' },
          { k: 'listings', label: 'My listings' },
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
                      <button onClick={() => setListingModal({ open: true, editing: l })} data-testid={`edit-listing-${l.id}`}
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

      <ListingFormModal
        open={listingModal.open}
        initial={listingModal.editing || undefined}
        onClose={() => setListingModal({ open: false, editing: null })}
        onSubmit={handleSaveListing}
      />
    </div>
  );
}
