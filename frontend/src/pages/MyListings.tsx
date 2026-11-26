import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { photoGoalFor } from '@/lib/photoGoal';
import { Icon } from '@/components/ag/Icon';
import { BAND_ICON } from '@/components/provider/dashboard/BookingCard';
import { useSeo } from '@/components/Seo';
import { ButtonLink, Chip, Chips, Status } from '@/components/ag';
import { toast } from 'sonner';

/**
 * Account → My Listings: every listing the business runs, of any kind, as cards with what a host
 * checks at a glance (status, price, what it offers, photos, new requests), grouped by kind and
 * filterable by whether it is taking bookings. A card opens the listing's own page
 * (/provider/listings/:id) where it is edited (user decision 2026-11-24). The Business profile shows
 * the same listings in short and links here.
 */

/** The listing's priced offers, by kind: what the card counts ("Rooms · 3"). */
const OFFER_FIELD: Record<string, string> = { homestay: 'rooms', cafe: 'menu', shop: 'goods', guide: 'services', driver: 'routes' };

type Filter = 'all' | 'on' | 'off';

export default function MyListings() {
  const { t } = useTranslation();
  useSeo({ title: t('nav.my_listings'), noindex: true });
  const { user, loading: authLoading, provider, refreshProvider } = useAuth();
  const nav = useNavigate();
  const { hash } = useLocation();

  const [listings, setListings] = useState<any[] | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login?next=/my-listings'); return; }
    if (user.role !== 'provider') { nav('/provider/onboard'); return; }
    if (!provider) refreshProvider();
  }, [authLoading, user, provider, nav, refreshProvider]);

  // An old link to the membership card (/my-listings#plan): the card lives on the Business profile now.
  // Memberships are per listing, on the dashboard's listing cards.
  useEffect(() => { if (hash === '#plan') nav('/provider/dashboard', { replace: true }); }, [hash, nav]);

  const load = useCallback(() => api.get('/bookings/provider')
    .then((r) => { setListings(r.data.listings || []); setBookings(r.data.items || []); })
    .catch(() => setListings([])), []);
  useEffect(() => { if (provider?.id) load(); }, [provider?.id, load]);

  const type: string = provider?.business_type || '';
  const live = provider?.status === 'active';

  // This business's own listings, grouped by kind (its own kind first), newest first within a kind.
  const groups = useMemo(() => {
    const own = (listings || []).filter((l) => l.provider_id === provider?.id)
      .filter((l) => filter === 'all' || (filter === 'on') === (l.extras?.available !== false))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const byKind = new Map<string, any[]>();
    if (type) byKind.set(type, []);
    for (const l of own) byKind.set(l.type, [...(byKind.get(l.type) || []), l]);
    return [...byKind.entries()].filter(([, g]) => g.length > 0);
  }, [listings, provider?.id, filter, type]);
  const all = (listings || []).filter((l) => l.provider_id === provider?.id);
  const nOff = all.filter((l) => l.extras?.available === false).length;

  // The same switch as on the profile and the listing's page: saved at once, the one the server checks.
  const setTaking = async (l: any, on: boolean) => {
    setSwitching(l.id);
    try {
      await api.patch(`/listings/${l.id}`, { extras: { ...(l.extras || {}), available: on } });
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('ui.providerProfile.could_not_save'));
    } finally {
      setSwitching(null);
    }
  };

  if (!provider || listings === null) {
    return <div className="ag-wrap"><div className="ag-main"><p className="ag-small">{t('common.loading')}</p></div></div>;
  }

  return (
    <div className="ag-wrap">
      <div className="ag-main" data-testid="my-listings">
        <div>
          <Link to="/provider/profile" className="ag-seeall">{t('hostProfile.title')}</Link>
          <h1 className="ag-host-tabh mt-3">{t('host.your_listings', 'Your listings')} <span className="text-[var(--ink-muted)]">{all.length}</span></h1>
          <p className="ag-small mt-3">{t('hostProfile.listings_note', 'Tap one to edit its prices, details and photos.')}</p>
        </div>

        {/* The same two ways to add as on the profile: another of the business's own kind, or any kind. */}
        <div className="ag-row">
          {type && (
            <ButtonLink to={`/provider/onboard?add=1&type=${type}&step=1`} icon={<Icon name={type === 'driver' ? 'car' : 'home'} />} data-testid="add-another-cta">
              {t(`hostProfile.add_another_${type}`, 'Add another property')}
            </ButtonLink>
          )}
          <ButtonLink to="/provider/onboard?add=1" icon={<Icon name="plus" />} data-testid="add-listing-cta">{t('pd.add_listing', 'Add listing')}</ButtonLink>
          <ButtonLink to="/feed" variant="text" data-testid="post-update-cta">{t('pd.post_update')}</ButtonLink>
        </div>

        {/* Filter by Taking bookings, shown once there is something to tell apart. */}
        {all.length > 1 && (
          <Chips>
            {([['all', `${t('home.filter_all', 'All')} · ${all.length}`], ['on', `${t('host.taking', 'Taking bookings')} · ${all.length - nOff}`], ['off', `${t('host.paused', 'Not taking bookings')} · ${nOff}`]] as [Filter, string][])
              .map(([key, label]) => <Chip key={key} on={filter === key} onClick={() => setFilter(key)} data-testid={`listings-filter-${key}`}>{label}</Chip>)}
          </Chips>
        )}

        {groups.length === 0 && <p className="ag-small" data-testid="listings-empty">{t('pd.no_listings', 'You have no active listings.')}</p>}

        {groups.map(([kind, group]) => (
          <section key={kind} className="ag-host-sec" data-testid={`listings-group-${kind}`}>
            <span className="ag-eyebrow">{t(`ob.wz.t_${kind}`, { defaultValue: kind })} · {group.length}</span>
            <div className="ag-host-lgrid">
              {group.map((l) => {
                const e = l.extras || {};
                const on = e.available !== false;
                const offers = Array.isArray(e[OFFER_FIELD[l.type]]) ? e[OFFER_FIELD[l.type]].length : 0;
                const pics = Array.isArray(e.images) ? e.images.length : 0;
                const goal = photoGoalFor(l.type);
                const asks = bookings.filter((b) => b.listing_id === l.id && b.awaiting_host).length;
                const offerLabel = ({ homestay: t('profile.rooms'), cafe: t('hostProfile.menu'), shop: t('hostProfile.goods'), guide: t('hostProfile.services'), driver: t('el.routes_covered') } as Record<string, string>)[l.type] || '';
                return (
                  <article key={l.id} className="ag-host-lcard" data-testid={`my-listing-card-${l.id}`}>
                    <Link to={`/provider/listings/${l.id}`} className="ag-host-lphoto" style={l.image ? { backgroundImage: `url(${l.image})` } : undefined}
                      aria-label={l.title} data-testid={`listing-photo-${l.id}`}>
                      {!l.image && <Icon name={BAND_ICON[l.type] || 'home'} />}
                    </Link>
                    <div className="ag-host-lbody">
                      <span className="ag-host-gtag"><Icon name={BAND_ICON[l.type] || 'home'} />{t(`ob.wz.t_${l.type}`, { defaultValue: l.type })}</span>
                      <b>{l.title}</b>
                      <span className="ag-small">{l.location}{Number(l.price) > 0 ? ` · ${t('host.from', 'From')} ₹${Number(l.price).toLocaleString('en-IN')}` : ''}</span>
                      {/* What a host checks at a glance, one short line each. */}
                      <ul className="ag-host-lfacts">
                        <li>{offerLabel} · {offers}</li>
                        <li className={goal && pics < goal ? 'warn' : undefined}>{t('hostProfile.photos')} · {goal ? `${pics} / ${goal}` : pics}</li>
                        {asks > 0 && <li className="hot">{t('host.new', 'New requests')} · {asks}</li>}
                      </ul>
                      <div className="flex flex-wrap items-center gap-2">
                        <Status tone={!live ? 'pending' : on ? 'ok' : 'no'}>
                          {!live ? t('provider.pending_review') : on ? t('host.live', 'Live on aangan') : t('host.paused', 'Not taking bookings')}
                        </Status>
                      </div>
                      <div className="ag-host-lacts">
                        <ButtonLink to={`/provider/listings/${l.id}`} go icon={<Icon name="person" />} data-testid={`edit-listing-${l.id}`}>{t('common.edit')}</ButtonLink>
                        <ButtonLink to={`/listing/${l.id}`} icon={<Icon name="globe" />} data-testid={`view-listing-${l.id}`}>{t('common.view')}</ButtonLink>
                        {asks > 0 && <ButtonLink to="/provider/dashboard" icon={<Icon name="t_trip" />}>{t('host.bookings', 'Bookings')}</ButtonLink>}
                        <span className="ag-host-tgrow">
                          <label className="ag-host-ltoggle" title={t('host.taking', 'Taking bookings')}>
                            <input type="checkbox" role="switch" checked={on} disabled={switching === l.id}
                              aria-label={`${t('host.taking', 'Taking bookings')}: ${l.title}`}
                              onChange={(ev) => setTaking(l, ev.target.checked)} data-testid={`listing-taking-${l.id}`} />
                          </label>
                        </span>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
