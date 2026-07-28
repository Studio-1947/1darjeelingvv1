import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users as UsersIcon,
  Store,
  CalendarCheck,
  Wallet,
  LayoutList,
  Database,
  ShieldCheck,
  Mountain,
  LogOut
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// Import modular subcomponents
import StatCard from '@/components/admin/StatCard';
import OverviewTab from '@/components/admin/OverviewTab';
import UsersTab from '@/components/admin/UsersTab';
import ListingsTab from '@/components/admin/ListingsTab';
import SpotsTab, { type AdminSpot } from '@/components/admin/SpotsTab';
import SpotFormModal, { type SpotFormPayload } from '@/components/admin/SpotFormModal';
import BookingsTab from '@/components/admin/BookingsTab';
import PaymentsTab from '@/components/admin/PaymentsTab';

/**
 * Admin Console page acts as the state manager and layout shell.
 * It coordinates data fetching and renders the appropriate subcomponent tab.
 */
export default function Admin() {
  const { user, loading: authLoading, logout } = useAuth();
  const nav = useNavigate();

  // Tab state: 'overview' | 'users' | 'listings' | 'spots' | 'bookings' | 'payments'
  const [activeTab, setActiveTab] = useState('overview');

  // Database lists
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [listingsList, setListingsList] = useState<any[]>([]);
  const [spotsList, setSpotsList] = useState<AdminSpot[]>([]);
  const [bookingsList, setBookingsList] = useState<any[]>([]);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [err, setErr] = useState('');

  // Tourist-spot authoring: the open form (null = closed; { spot: null } = creating a new one)
  // and the id of the spot whose row action is in flight.
  const [spotForm, setSpotForm] = useState<{ spot: AdminSpot | null } | null>(null);
  const [spotBusyId, setSpotBusyId] = useState<string | null>(null);

  // Fetch all admin tables from the backend API
  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [statsRes, usersRes, listingsRes, spotsRes, bookingsRes, paymentsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/listings'),
        api.get('/admin/spots'),
        api.get('/admin/bookings'),
        api.get('/admin/payments')
      ]);
      setStats(statsRes.data);
      setUsersList(usersRes.data.items || []);
      setListingsList(listingsRes.data.items || []);
      setSpotsList(spotsRes.data.items || []);
      setBookingsList(bookingsRes.data.items || []);
      setPaymentsList(paymentsRes.data.items || []);
    } catch (e: any) {
      if (e?.response?.status === 403) {
        setErr('Admin authorization required');
      } else {
        setErr('Failed to load admin data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Check authorization and load data
  useEffect(() => {
    if (authLoading) return;
    if (!user) { 
      nav('/login'); 
      return; 
    }
    if (user.role !== 'admin') {
      setErr('Admin authorization required');
      setLoading(false);
      return;
    }
    loadAdminData();
  }, [authLoading, user, nav, loadAdminData]);

  // Seeding action
  const handleSeed = async () => {
    if (!confirm('Are you sure you want to seed default sample listings?')) return;
    setActionMsg('Seeding...');
    try {
      const { data } = await api.post('/admin/seed');
      setActionMsg(`Successfully seeded ${data.seeded} listings!`);
      loadAdminData();
    } catch (e) {
      setActionMsg('Failed to seed listings.');
    }
  };

  // User deletion action
  const handleDeleteUser = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete user "${name}"? This action is permanent.`)) return;
    try {
      await api.delete(`/admin/users/${userId}`);
      setActionMsg(`User "${name}" deleted successfully.`);
      loadAdminData();
    } catch (e: any) {
      setActionMsg(e?.response?.data?.detail || 'Failed to delete user.');
    }
  };

  // Service deletion action
  const handleDeleteListing = async (listingId: string, title: string) => {
    if (!confirm(`Are you sure you want to delete listing "${title}"?`)) return;
    try {
      await api.delete(`/admin/listings/${listingId}`);
      setActionMsg(`Listing "${title}" deleted successfully.`);
      loadAdminData();
    } catch (e) {
      setActionMsg('Failed to delete listing.');
    }
  };

  // ---- Tourist spots (admin-authored content) ----------------------------------
  // Create and edit share one handler: the form hands back a complete payload either way,
  // and the modal only closes when this resolves, so a failed save keeps the admin's work.
  const handleSubmitSpot = async (payload: SpotFormPayload) => {
    const editing = spotForm?.spot;
    const { data } = editing
      ? await api.patch(`/admin/spots/${editing.id}`, payload)
      : await api.post('/admin/spots', payload);
    setActionMsg(
      editing
        ? `Spot "${data.item.title}" saved.`
        : `Spot "${data.item.title}" created${data.item.published ? ' and published' : ' as a draft'}.`
    );
    await loadAdminData();
  };

  const handleDeleteSpot = async (spot: AdminSpot) => {
    const warning = spot.review_count > 0
      ? `\n\nThis will also delete its ${spot.review_count} review(s) and any saves.`
      : '';
    if (!confirm(`Delete the tourist spot "${spot.title}"?${warning}`)) return;
    setSpotBusyId(spot.id);
    try {
      await api.delete(`/admin/spots/${spot.id}`);
      setActionMsg(`Spot "${spot.title}" deleted.`);
      await loadAdminData();
    } catch (e: any) {
      setActionMsg(e?.response?.data?.detail || 'Failed to delete that spot.');
    } finally {
      setSpotBusyId(null);
    }
  };

  const handleToggleSpotPublished = async (spot: AdminSpot) => {
    setSpotBusyId(spot.id);
    try {
      await api.post(`/admin/spots/${spot.id}/publish`, { published: !spot.published });
      setActionMsg(`"${spot.title}" is now ${spot.published ? 'a draft — hidden from visitors' : 'live on the site'}.`);
      await loadAdminData();
    } catch (e: any) {
      setActionMsg(e?.response?.data?.detail || 'Failed to change that spot’s visibility.');
    } finally {
      setSpotBusyId(null);
    }
  };

  const handleToggleSpotFeatured = async (spot: AdminSpot) => {
    setSpotBusyId(spot.id);
    try {
      // Only `featured` is sent: the backend merges it over the stored extras, so the
      // gallery and the rest of the editorial content are untouched.
      await api.patch(`/admin/spots/${spot.id}`, { extras: { featured: !spot.featured } });
      setActionMsg(`"${spot.title}" ${spot.featured ? 'removed from' : 'added to'} featured spots.`);
      await loadAdminData();
    } catch (e: any) {
      setActionMsg(e?.response?.data?.detail || 'Failed to update that spot.');
    } finally {
      setSpotBusyId(null);
    }
  };

  // Provider status approval / suspension toggle action
  const handleToggleProviderStatus = async (providerId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    if (!confirm(`Are you sure you want to change provider status to "${nextStatus}"?`)) return;
    try {
      await api.put(`/admin/providers/${providerId}/status`, { status: nextStatus });
      setActionMsg(`Provider status updated to "${nextStatus}".`);
      loadAdminData();
    } catch (e) {
      setActionMsg('Failed to update provider status.');
    }
  };

  // Logout action
  const handleLogout = () => {
    logout();
    nav('/login');
  };

  if (authLoading || loading) {
    return <div className="p-16 text-center text-ink-soft">Loading Admin Dashboard...</div>;
  }

  if (err) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <h1 className="font-display font-extrabold text-3xl text-flag">Access Denied</h1>
        <p className="text-ink-soft mt-2">{err}</p>
        <button onClick={() => nav('/login')} className="mt-6 px-6 py-2.5 rounded-full bg-flag text-white font-bold btn-hover">
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 md:px-8 py-8" data-testid="admin-page">
      {/* Dashboard Top Header Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
            <ShieldCheck size={14} /> System Administrator
          </div>
          <h1 className="mt-1 font-display font-extrabold text-4xl text-ink leading-none">Console</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadAdminData} className="px-4 py-2 text-xs font-bold border border-[var(--line)] rounded-full text-ink hover:bg-mist transition-all">
            Refresh Data
          </button>
          <button onClick={handleSeed} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-pine text-white rounded-full btn-hover transition-all">
            <Database size={13} /> Seed Listings
          </button>
          <button onClick={handleLogout} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-ink text-white rounded-full btn-hover transition-all">
            <LogOut size={13} /> Log Out
          </button>
        </div>
      </div>

      {/* Admin Action Feedbacks */}
      {actionMsg && (
        <div className="mb-6 p-4 rounded-xl bg-gold/10 border border-gold/30 text-sm text-gold-dark font-semibold text-center animate-pulse">
          {actionMsg}
        </div>
      )}

      {/* Stats Cards Section */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
          <StatCard label="Total Users" value={stats.users} icon={UsersIcon} color="text-pine bg-pine/10" />
          <StatCard label="Service Providers" value={stats.providers} icon={Store} color="text-flag bg-flag/10" />
          <StatCard label="Active Services" value={stats.listings} icon={LayoutList} color="text-blue-500 bg-blue-50" />
          {/* Live spots only — drafts aren't visible to anyone but this console. */}
          <StatCard label="Tourist Spots" value={spotsList.filter((s) => s.published).length} icon={Mountain} color="text-emerald-600 bg-emerald-50" />
          <StatCard label="Bookings Made" value={stats.bookings} icon={CalendarCheck} color="text-orange-500 bg-orange-50" />
          <StatCard label="Paid Transactions" value={stats.payments} icon={Wallet} color="text-yellow-600 bg-yellow-50" />
        </div>
      )}

      {/* Tab Select Bar */}
      <div className="flex border-b border-[var(--line)] mb-6 overflow-x-auto whitespace-nowrap scrollbar-hide">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'users', label: 'Users & Businesses' },
          { id: 'listings', label: 'Services (Listings)' },
          { id: 'spots', label: 'Tourist Spots' },
          { id: 'bookings', label: 'Bookings' },
          { id: 'payments', label: 'Payments' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setActionMsg(''); }}
            className={`px-5 py-3 font-bold text-sm border-b-2 transition-all ${
              activeTab === tab.id ? 'border-flag text-flag' : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      {activeTab === 'overview' && <OverviewTab stats={stats} onSeed={handleSeed} />}
      {activeTab === 'users' && <UsersTab users={usersList} onDeleteUser={handleDeleteUser} onToggleProviderStatus={handleToggleProviderStatus} />}
      {/* Spots have their own authoring tab, so they're kept out of the provider-services table
          rather than appearing in two places with two different sets of controls. */}
      {activeTab === 'listings' && (
        <ListingsTab listings={listingsList.filter((l) => l.type !== 'spot')} onDeleteListing={handleDeleteListing} />
      )}
      {activeTab === 'spots' && (
        <SpotsTab
          spots={spotsList}
          busyId={spotBusyId}
          onCreate={() => { setActionMsg(''); setSpotForm({ spot: null }); }}
          onEdit={(spot) => { setActionMsg(''); setSpotForm({ spot }); }}
          onDelete={handleDeleteSpot}
          onTogglePublished={handleToggleSpotPublished}
          onToggleFeatured={handleToggleSpotFeatured}
        />
      )}
      {activeTab === 'bookings' && <BookingsTab bookings={bookingsList} />}
      {activeTab === 'payments' && <PaymentsTab payments={paymentsList} />}

      <SpotFormModal
        open={!!spotForm}
        spot={spotForm?.spot}
        onClose={() => setSpotForm(null)}
        onSubmit={handleSubmitSpot}
      />
    </div>
  );
}
