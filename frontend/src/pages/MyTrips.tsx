import React, { useCallback, useEffect, useState } from 'react';
import { MyDeliveries } from '@/components/AfterTrip';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import TripStats, { tripBuckets } from '@/components/TripStats';
import TripCard from '@/components/TripCard';
import { Ticket, Calendar, ArrowRight, XCircle, CircleNotch as Loader2, Compass, Phone, CheckCircle as CheckCircle2, Clock, MapPin, Storefront as Store, SignIn as LogIn } from '@phosphor-icons/react';

export default function MyTrips() {
  const { t, i18n } = useTranslation();
  useSeo({ title: t('nav.my_trips'), noindex: true });
  const { user, loading: authLoading, isHostMode } = useAuth();
  const nav = useNavigate();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState<'all' | 'upcoming' | 'completed' | 'cancelled'>('all');
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadBookings = useCallback(() => {
    return api.get('/bookings/me')
      .then((r) => setBookings(r.data.items || []))
      .catch((err) => console.error('Failed to load trips:', err));
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadBookings().finally(() => setLoading(false));
  }, [user, authLoading, loadBookings]);

  const cancelBooking = async (id: string) => {
    setBusyId(id);
    try {
      await api.patch(`/bookings/${id}/cancel`);
      await loadBookings();
      setConfirmingId(null);
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center text-ink-soft">
        <Loader2 size={24} className="animate-spin mx-auto mb-2 text-flag" />
        {t('common.loading')}
      </div>
    );
  }

  // Logged-out state
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 md:py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-flag/10 text-flag grid place-items-center mx-auto mb-4">
          <Ticket size={28} />
        </div>
        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-ink">My Trips & Bookings</h1>
        <p className="text-ink-soft max-w-md mx-auto mt-2 text-sm">
          Log in to view your complete trip history, upcoming homestay reservations, driver bookings, and cultural experiences in Darjeeling.
        </p>
        <button
          onClick={() => nav('/login?next=/my-trips')}
          className="mt-6 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-pine text-white font-bold text-sm btn-hover shadow-md"
        >
          <LogIn size={16} /> Log In to View Trips
        </button>
      </div>
    );
  }

  const { upcoming: upcomingList, completed: completedList, cancelled: cancelledList } = tripBuckets(bookings);
  const filteredBookings = tripBuckets(bookings)[tabFilter];

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 py-6 md:py-10 pb-24 lg:pb-12">
      {/* Banner for service providers */}
      {isHostMode && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-pine/10 to-pine/5 border border-pine/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Store size={18} className="text-pine flex-shrink-0" />
            <span className="text-xs font-semibold text-ink">
              Looking for your business listings & guest reservations?
            </span>
          </div>
          <Link
            to="/my-listings"
            className="inline-flex items-center gap-1 text-xs font-bold text-pine hover:underline"
          >
            Go to My Listings <ArrowRight size={12} />
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-flag flex items-center gap-1.5">
            <Ticket size={13} /> Personal History
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl md:text-4xl text-ink mt-1">
            My Trips & Bookings
          </h1>
          <p className="text-xs sm:text-sm text-ink-soft mt-1">
            Your journey history, upcoming reservations, and completed stays through aangan.
          </p>
        </div>
      </div>

      {/* Stats summary: tap a card to filter the list */}
      <div className="mb-8">
        <TripStats bookings={bookings} filter={tabFilter} onFilter={setTabFilter} />
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--line)] mb-6 overflow-x-auto no-scrollbar">
        {[
          { key: 'all', label: `All (${bookings.length})` },
          { key: 'upcoming', label: `Upcoming (${upcomingList.length})` },
          { key: 'completed', label: `Completed (${completedList.length})` },
          { key: 'cancelled', label: `Cancelled (${cancelledList.length})` },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTabFilter(key as any)}
            className={`px-4 py-2.5 font-bold text-xs sm:text-sm whitespace-nowrap transition-colors ${
              tabFilter === key
                ? 'text-[#1F6656] border-b-2 border-[#1F6656] -mb-px'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Bookings List */}
      {filteredBookings.length === 0 ? (
        <div className="mist-panel p-8 md:p-12 text-center rounded-3xl">
          <div className="w-12 h-12 rounded-full bg-mist text-ink-soft grid place-items-center mx-auto mb-3">
            <Ticket size={24} />
          </div>
          <h3 className="font-display font-bold text-lg text-ink">No trips found</h3>
          <p className="text-xs sm:text-sm text-ink-soft max-w-sm mx-auto mt-1">
            {tabFilter === 'all'
              ? 'You haven’t booked any homestays, drivers, or experiences yet.'
              : `You have no ${tabFilter} trips at the moment.`}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5 justify-center">
            <Link
              to="/homestays"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine text-white font-bold text-xs sm:text-sm btn-hover"
            >
              Browse Homestays <ArrowRight size={14} />
            </Link>
            <Link
              to="/drivers"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-pine text-white font-bold text-xs sm:text-sm btn-hover"
            >
              Find a Driver <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredBookings.map((b) => (
            <TripCard key={b.id} booking={b} testId={`my-trip-card-${b.id}`}
              confirming={confirmingId === b.id} busy={busyId === b.id}
              onReviewed={() => loadBookings()} onAskCancel={() => setConfirmingId(b.id)} onCancel={() => cancelBooking(b.id)} onKeep={() => setConfirmingId(null)} />
          ))}
        </div>
      )}

      <MyDeliveries />

      {/* Quick suggestions */}
      <div className="mt-12">
        <h2 className="font-display font-extrabold text-xl text-ink mb-4 flex items-center gap-2">
          <Compass size={20} className="text-pine" /> Explore More in Darjeeling
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Link to="/homestays" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover shadow-sm">
            <div className="w-9 h-9 rounded-full bg-mist text-pine grid place-items-center mb-2">
              <Compass size={18} />
            </div>
            <div className="font-display font-bold text-sm text-ink">Homestays</div>
          </Link>
          <Link to="/drivers" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover shadow-sm">
            <div className="w-9 h-9 rounded-full bg-mist text-pine grid place-items-center mb-2">
              <Phone size={18} />
            </div>
            <div className="font-display font-bold text-sm text-ink">Drivers & Cabs</div>
          </Link>
          <Link to="/cafes" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover shadow-sm">
            <div className="w-9 h-9 rounded-full bg-mist text-pine grid place-items-center mb-2">
              <Store size={18} />
            </div>
            <div className="font-display font-bold text-sm text-ink">Cafes & Bakeries</div>
          </Link>
          <Link to="/events" className="rounded-2xl p-4 bg-white border border-[var(--line)] btn-hover shadow-sm">
            <div className="w-9 h-9 rounded-full bg-mist text-pine grid place-items-center mb-2">
              <Ticket size={18} />
            </div>
            <div className="font-display font-bold text-sm text-ink">Events & Culture</div>
          </Link>
        </div>
      </div>
    </div>
  );
}
