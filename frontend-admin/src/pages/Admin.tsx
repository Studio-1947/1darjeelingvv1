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
  LogOut
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

// Import modular subcomponents
import StatCard from '@/components/admin/StatCard';
import OverviewTab from '@/components/admin/OverviewTab';
import UsersTab from '@/components/admin/UsersTab';
import ListingsTab from '@/components/admin/ListingsTab';
import BookingsTab from '@/components/admin/BookingsTab';
import PaymentsTab from '@/components/admin/PaymentsTab';

/**
 * Admin Console page acts as the state manager and layout shell.
 * It coordinates data fetching and renders the appropriate subcomponent tab.
 */
export default function Admin() {
  const { user, loading: authLoading, logout } = useAuth();
  const nav = useNavigate();

  // Tab state: 'overview' | 'users' | 'listings' | 'bookings' | 'payments'
  const [activeTab, setActiveTab] = useState('overview');

  // Database lists
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [listingsList, setListingsList] = useState<any[]>([]);
  const [bookingsList, setBookingsList] = useState<any[]>([]);
  const [paymentsList, setPaymentsList] = useState<any[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState('');
  const [err, setErr] = useState('');

  // Fetch all admin tables from the backend API
  const loadAdminData = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const [statsRes, usersRes, listingsRes, bookingsRes, paymentsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/listings'),
        api.get('/admin/bookings'),
        api.get('/admin/payments')
      ]);
      setStats(statsRes.data);
      setUsersList(usersRes.data.items || []);
      setListingsList(listingsRes.data.items || []);
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
      const { data } = await api.post('/dev/seed');
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <StatCard label="Total Users" value={stats.users} icon={UsersIcon} color="text-pine bg-pine/10" />
          <StatCard label="Service Providers" value={stats.providers} icon={Store} color="text-flag bg-flag/10" />
          <StatCard label="Active Services" value={stats.listings} icon={LayoutList} color="text-blue-500 bg-blue-50" />
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
      {activeTab === 'listings' && <ListingsTab listings={listingsList} onDeleteListing={handleDeleteListing} />}
      {activeTab === 'bookings' && <BookingsTab bookings={bookingsList} />}
      {activeTab === 'payments' && <PaymentsTab payments={paymentsList} />}
    </div>
  );
}
