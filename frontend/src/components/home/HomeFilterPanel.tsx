import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { distanceTo, placeFor } from '@/lib/places';
import { Icon } from '@/components/ag/Icon';

/** The prototype's place list for "Any place" (data.js HUBS). */
export const HUBS = ['Darjeeling', 'Ghum', 'Kurseong', 'Kalimpong', 'Mirik', 'Sukhia Pokhri', 'Simana', 'Lepchajagat', 'Sikkim', 'Siliguri', 'Bagdogra', 'Sittong', 'Lamahatta', 'Takdah'];

/** Type choices, as the prototype's filterPanel lists them (stays, cars, spots, food, guides, events, nature). */
const TYPES: { value: string; key: string; fallback: string }[] = [
  { value: '', key: 'filter.everything', fallback: 'Everything' },
  { value: 'homestay', key: 'filter.t_stays', fallback: 'Homestay' },
  { value: 'driver', key: 'filter.t_cars', fallback: 'Car & Driver' },
  { value: 'spot', key: 'filter.t_spots', fallback: 'Places to see' },
  { value: 'food', key: 'filter.t_food', fallback: 'Foods & Shops' },
  { value: 'guide', key: 'filter.t_guides', fallback: 'Tour Guides' },
  { value: 'event', key: 'filter.t_events', fallback: 'Festivals' },
  { value: 'nature', key: 'filter.t_nature', fallback: 'Nature' },
];
/** 'food' is the prototype's Foods & Shops: cafes and shops together. */
export const typeMatches = (want: string, have: string) => !want || have === want || (want === 'food' && (have === 'cafe' || have === 'shop'));

type Origin = { lat: number; lng: number };

/**
 * Home filter panel, copied from the prototype's filterPanel(): My location or a place, "Within"
 * (a 0-100 km slider; 0 = any distance, shown once a place is set), the type, Cheapest first, and
 * "Search N" with the live number of matches. Search opens /search with these as its filters
 * (Category reads near, place, within, sort and type from the address).
 */
export default function HomeFilterPanel({ query, onDone }: { query: string; onDone: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  // Starts on Darjeeling, as the prototype does (S.near), so the Within slider shows at once.
  const [near, setNear] = useState<string>('Darjeeling'); // '' | 'me' | a HUBS name
  const [me, setMe] = useState<Origin | null>(null);
  const [locErr, setLocErr] = useState('');
  const [rad, setRad] = useState(0);
  const [type, setType] = useState('');
  const [cheap, setCheap] = useState(false);
  const [all, setAll] = useState<any[] | null>(null);

  // Everything once, for the live count (the same 60-per-type the results page loads).
  useEffect(() => {
    let live = true;
    api.get('/listings', { params: { limit: 60 } })
      .then(({ data }) => { if (live) setAll(data.items || []); })
      .catch(() => { if (live) setAll([]); });
    return () => { live = false; };
  }, []);

  const origin: Origin | null = near === 'me' ? me : near ? placeFor(near) : null;

  const count = useMemo(() => {
    if (!all) return null;
    const term = query.trim().toLowerCase();
    return all.filter((it) => {
      if (!typeMatches(type, it.type)) return false;
      if (term && ![it.title, it.description, it.location].some((s) => String(s || '').toLowerCase().includes(term))) return false;
      if (origin && rad > 0) {
        const d = distanceTo(origin, it);
        if (!d || d.km > rad) return false;
      }
      return true;
    }).length;
  }, [all, type, query, origin, rad]);

  const locate = () => {
    if (near === 'me') { setNear(''); return; }
    if (!navigator.geolocation) { setLocErr(t('filter.no_location', 'Location is not available on this device.')); return; }
    setLocErr('');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setNear('me'); },
      () => setLocErr(t('filter.no_location', 'Location is not available on this device.')),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const active = !!(type || cheap || rad);
  const clear = () => { setNear(''); setRad(0); setType(''); setCheap(false); setLocErr(''); };

  const search = () => {
    const p = new URLSearchParams();
    if (query.trim()) p.set('q', query.trim());
    if (type) p.set('type', type);
    // The default town with any distance changes nothing on the results page, so it is not sent.
    const sendNear = near === 'me' || (near && (near !== 'Darjeeling' || rad > 0));
    if (sendNear) p.set('near', near);
    if (near && rad) p.set('within', String(rad));
    if (cheap) p.set('sort', 'price_asc');
    onDone();
    nav(`/search${p.toString() ? `?${p}` : ''}`);
  };

  const radLabel = rad ? `${t('filter.within', 'Within')} ${rad} km` : t('filter.any_distance', 'Any distance');

  return (
    <div className="ag-home-fpanel" id="booking-widget-panel" data-testid="booking-widget-pill-panel">
      <div className="two">
        <button type="button" className={`ag-home-ftonal${near === 'me' ? ' on' : ''}`} aria-pressed={near === 'me'} onClick={locate} data-testid="home-filter-me">
          <Icon name="locate" /> {t('filter.my_location', 'My location')}
        </button>
        <select
          className="ag-in"
          aria-label={t('filter.near', 'Near')}
          value={near === 'me' ? '' : near}
          onChange={(e) => setNear(e.target.value)}
          data-testid="home-filter-place"
        >
          <option value="">{t('filter.any_place', 'Any place')}</option>
          {HUBS.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
      </div>
      {locErr && <p className="ag-err" role="alert">{locErr}</p>}

      {near && (
        <label className="ag-home-frange">
          <span className="row"><span>{t('filter.within', 'Within')}</span><b>{radLabel}</b></span>
          <input type="range" min={0} max={100} step={5} value={rad} onChange={(e) => setRad(Number(e.target.value))} aria-label={t('filter.within', 'Within')} data-testid="home-filter-within" />
        </label>
      )}

      <div className="two">
        <select className="ag-in" aria-label={t('filter.type', 'Type')} value={type} onChange={(e) => setType(e.target.value)} data-testid="home-filter-type">
          {TYPES.map((o) => <option key={o.value} value={o.value}>{t(o.key, o.fallback)}</option>)}
        </select>
        <button type="button" className={`ag-home-ftonal${cheap ? ' on' : ''}`} aria-pressed={cheap} onClick={() => setCheap((v) => !v)} data-testid="home-filter-cheap">
          {t('filter.cheapest_first', 'Cheapest first')}
        </button>
      </div>

      <div className="ag-home-fgo">
        <button type="button" className="ag-home-fsearch" onClick={search} data-testid="booking-widget-panel-search">
          <Icon name="search" /> {t('widget.search')}
          {count !== null && <span className="n" data-testid="home-filter-count">{count}</span>}
        </button>
        {active && (
          <button type="button" className="ag-btn text" onClick={clear} data-testid="home-filter-clear">{t('filter.clear', 'Clear filters')}</button>
        )}
      </div>
    </div>
  );
}
