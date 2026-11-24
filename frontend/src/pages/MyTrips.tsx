import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MyDeliveries } from '@/components/AfterTrip';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import TripStats, { tileBuckets, tileLabel, type TripFilter } from '@/components/TripStats';
import TripCard from '@/components/TripCard';
import PlanCard from '@/components/feed/PlanCard';
import { fetchMyPlans, type TripPlan } from '@/lib/plans';
import { Box, Button, ButtonLink, PageHead } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';

/** The My trip tab (prototype V.trips): four tiles that filter, a summary line, then one card per booking, newest first. */
export default function MyTrips() {
  const { t } = useTranslation();
  useSeo({ title: t('nav.my_trips'), noindex: true });
  const { user, loading: authLoading, isHostMode } = useAuth();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<TripFilter>('all');
  const [plans, setPlans] = useState<{ joined: TripPlan[]; mine: TripPlan[] }>({ joined: [], mine: [] });

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
    fetchMyPlans().then((m) => setPlans({ joined: m.joined, mine: m.mine })).catch(() => {});
  }, [user, authLoading, loadBookings]);

  const swap = (np: TripPlan) => setPlans((p) => ({
    joined: p.joined.map((x) => (x.id === np.id ? np : x)),
    mine: p.mine.map((x) => (x.id === np.id ? np : x)),
  }));
  const hasPlans = !isHostMode && (plans.joined.length > 0 || plans.mine.length > 0);

  const head = <PageHead title={t('nav.trips', 'My trip')} />;

  if (authLoading || loading) {
    return <div className="ag-wrap"><div className="ag-main">{head}<p className="ag-small">{t('common.loading')}</p></div></div>;
  }

  // Signed out: the prototype's empty box (V.trips with no trips), with a quiet way to log in.
  if (!user) {
    return (
      <div className="ag-wrap">
        <div className="ag-main">
          {head}
          <Box className="ag-account-empty" data-testid="trips-guest">
            <Icon name="bag" />
            <p>{t('ui.trips.none', 'You have no trips yet.')}</p>
            <ButtonLink to="/" go data-testid="trips-find-place">{t('ui.trips.find', 'Find a place')}</ButtonLink>
            <ButtonLink to="/login?next=/my-trips" variant="text" size="sm" data-testid="trips-login">{t('nav.login', 'Log in')}</ButtonLink>
          </Box>
        </div>
      </div>
    );
  }

  const tiles = tileBuckets(bookings);
  const shown = tiles[filter];
  const places = new Set(tiles.completed.map((b) => b.listing?.location).filter(Boolean)).size;

  return (
    <div className="ag-wrap">
      <div className="ag-main">
        {head}

        {/* A host on the business side: their guests' bookings are on the dashboard. */}
        {isHostMode && (
          <Box tone="blush" className="!flex-row items-center flex-wrap">
            <span className="ag-micon"><Icon name="bag" /></span>
            <span className="flex-1 min-w-[180px] text-sm text-[var(--ink-strong)]">{t('ui.myTrips.host_banner')}</span>
            <ButtonLink to="/my-listings" size="sm" go>{t('host.your_listings', 'Your listings')}</ButtonLink>
          </Box>
        )}

        {bookings.length === 0 && hasPlans ? null : bookings.length === 0 ? (
          <Box className="ag-account-empty" data-testid="trips-empty">
            <Icon name="bag" />
            <p>{t('ui.trips.none', 'You have no trips yet.')}</p>
            <ButtonLink to="/explore" go data-testid="trips-find-place">{t('ui.trips.find', 'Find a place')}</ButtonLink>
          </Box>
        ) : (
          <>
            <TripStats bookings={bookings} filter={filter} onFilter={setFilter} />
            <div className="ag-account-tdsum" data-testid="trip-summary">
              <span><Icon name="bag" /> {t('ui.trips.total', 'Trips')} <b>{String(bookings.length).padStart(2, '0')}</b></span>
              <span><Icon name="pin" /> {t('ui.trips.places', 'Places visited')} <b>{String(places).padStart(2, '0')}</b></span>
            </div>
            {filter !== 'all' && (
              <p className="ag-small">
                {t(tileLabel(filter)[0], tileLabel(filter)[1])} ·{' '}
                <Button variant="text" className="!inline-flex !p-0 align-baseline" onClick={() => setFilter('all')}>{t('ui.trips.all', 'Everything')}</Button>
              </p>
            )}
            {shown.length === 0 ? (
              <Box className="ag-account-empty" data-testid="trip-filter-empty">
                <Icon name="bag" />
                <p>{filter === 'waiting' ? t('ui.trips.none_waiting', 'Nothing is waiting right now.') : t(`ui.myTrips.empty_filtered.${filter}`)}</p>
                <ButtonLink to="/explore" go>{t('ui.trips.find', 'Find a place')}</ButtonLink>
              </Box>
            ) : (
              shown.map((b) => (
                // Cancelling (with a reason, or a request to the host) happens in the card; it reloads after.
                <TripCard key={b.id} booking={b} testId={`my-trip-card-${b.id}`} onReviewed={() => loadBookings()} />
              ))
            )}
          </>
        )}

        {hasPlans && plans.joined.length > 0 && (
          <section className="flex flex-col gap-3" data-testid="trips-joined-plans" aria-labelledby="tj-h">
            <h2 id="tj-h" className="ag-feed-h inline-flex items-center gap-2"><Icon name="t_trip" /> {t('plans.tj_h', 'Trips you joined')}</h2>
            {plans.joined.map((p) => <PlanCard key={p.id} plan={p} onChange={swap} />)}
          </section>
        )}
        {hasPlans && plans.mine.length > 0 && (
          <section className="flex flex-col gap-3" data-testid="trips-my-plans" aria-labelledby="tj-my">
            <h2 id="tj-my" className="ag-feed-h">{t('plans.tj_my', 'Trips you planned')}</h2>
            {plans.mine.map((p) => <PlanCard key={p.id} plan={p} onChange={swap} />)}
          </section>
        )}

        <MyDeliveries />
      </div>
    </div>
  );
}
