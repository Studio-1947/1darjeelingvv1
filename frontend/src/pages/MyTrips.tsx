import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Suitcase, Storefront } from '@phosphor-icons/react';
import { MyDeliveries } from '@/components/AfterTrip';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import TripStats, { tripBuckets, type TripFilter } from '@/components/TripStats';
import TripCard from '@/components/TripCard';
import { Box, ButtonLink, PageHead } from '@/components/ag';

/** The My trip tab (prototype V.trips): filter chips, then one card per booking, newest first. */
export default function MyTrips() {
  const { t } = useTranslation();
  useSeo({ title: t('nav.my_trips'), noindex: true });
  const { user, loading: authLoading, isHostMode } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TripFilter>('all');
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

  const head = <PageHead eyebrow={t('ui.trips.eyebrow', 'Your journey')} title={t('nav.my_trips')} />;

  if (authLoading || loading) {
    return <div className="ag-wrap"><div className="ag-main">{head}<p className="ag-small">{t('common.loading')}</p></div></div>;
  }

  // Logged-out state
  if (!user) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          {head}
          <Box>
            <span className="ag-micon"><Suitcase /></span>
            <p className="text-[var(--ink7)]">{t('ui.myTrips.logged_out_body')}</p>
            <ButtonLink to="/login?next=/my-trips" variant="primary" go block>{t('ui.myTrips.log_in_cta')}</ButtonLink>
          </Box>
        </div>
      </div>
    );
  }

  const shown = tripBuckets(bookings)[filter];

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        {head}

        {/* A host on the business side: their guests' bookings are on the dashboard. */}
        {isHostMode && (
          <Box tone="blush" className="!flex-row items-center flex-wrap">
            <span className="ag-micon"><Storefront /></span>
            <span className="flex-1 min-w-[180px] text-sm text-[var(--ink-strong)]">{t('ui.myTrips.host_banner')}</span>
            <ButtonLink to="/my-listings" size="sm" go>{t('ui.myTrips.go_to_listings')}</ButtonLink>
          </Box>
        )}

        {bookings.length === 0 ? (
          <Box data-testid="trips-empty">
            <span className="ag-micon"><Suitcase /></span>
            <div>
              <h2>{t('ui.trips.none', 'You have no trips yet.')}</h2>
              <p className="ag-small">{t('ui.myTrips.empty_all')}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink to="/explore" go data-testid="trips-find-place">{t('ui.trips.find', 'Find a place')}</ButtonLink>
              <ButtonLink to="/homestays" size="sm" data-testid="empty-book-stay">{t('dashboard.book_homestay')}</ButtonLink>
              <ButtonLink to="/drivers" size="sm" data-testid="empty-book-driver">{t('dashboard.find_driver')}</ButtonLink>
            </div>
          </Box>
        ) : (
          <>
            <TripStats bookings={bookings} filter={filter} onFilter={setFilter} />
            {shown.length === 0 ? (
              <Box data-testid="trip-filter-empty">
                <p className="ag-small">{filter === 'all' ? t('ui.myTrips.empty_all') : t(`ui.myTrips.empty_filtered.${filter}`)}</p>
                <ButtonLink to="/explore" go className="self-start">{t('ui.trips.find', 'Find a place')}</ButtonLink>
              </Box>
            ) : (
              shown.map((b) => (
                <TripCard key={b.id} booking={b} testId={`my-trip-card-${b.id}`}
                  confirming={confirmingId === b.id} busy={busyId === b.id}
                  onReviewed={() => loadBookings()} onAskCancel={() => setConfirmingId(b.id)} onCancel={() => cancelBooking(b.id)} onKeep={() => setConfirmingId(null)} />
              ))
            )}
          </>
        )}

        <MyDeliveries />
      </div>
    </div>
  );
}
