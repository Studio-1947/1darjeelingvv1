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
export const typeMatches = (want: string, have: string) => !want || have === want
  || (want === 'food' && (have === 'cafe' || have === 'shop')) || (want === 'nature' && have === 'biodiversity');

/** How far from the chosen place; 0 = any distance. */
const DISTANCES = [0, 5, 10, 25, 50];
/** The server hands out at most 200 a page; the count reads this many pages at most (2,000 listings). */
const PAGE = 200;
const MAX_PAGES = 10;

type Origin = { lat: number; lng: number };

/**
 * Home filter panel: four labelled questions, each a row of chips where exactly one is on.
 *   Where: Anywhere, My location, or a town.  How far (once there is a place): any, 5 to 50 km.
 *   What: the type.  Sort by: best match or cheapest first.
 * "Show N results" counts every match (all pages, not only the first 200), then opens /search with
 * these as its filters (Category reads near, within, sort and type from the address).
 */
export default function HomeFilterPanel({ query, onDone }: { query: string; onDone: () => void }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [near, setNear] = useState<string>(''); // '' (anywhere) | 'me' | a HUBS name
  const [me, setMe] = useState<Origin | null>(null);
  const [locating, setLocating] = useState(false);
  const [locErr, setLocErr] = useState('');
  const [rad, setRad] = useState(0);
  const [type, setType] = useState('');
  const [cheap, setCheap] = useState(false);
  const [all, setAll] = useState<any[] | null>(null);

  // The rows the count is taken from: every listing, or, once words are typed, what the smart search
  // finds for them (the same answer the results page gives), so "Show N results" is what you will see.
  const term = query.trim();
  useEffect(() => {
    let live = true;
    setAll(null);
    const timer = setTimeout(async () => {
      try {
        const rows: any[] = [];
        let offset: number | null = 0;
        for (let n = 0; offset !== null && n < MAX_PAGES; n += 1) {
          const { data } = await api.get('/listings', { params: { ...(term ? { q: term } : {}), limit: PAGE, offset } });
          rows.push(...(data.items || []));
          offset = typeof data.next_offset === 'number' ? data.next_offset : null;
          if (!live) return;
        }
        if (live) setAll(rows);
      } catch { if (live) setAll([]); }
    }, term ? 250 : 0);
    return () => { live = false; clearTimeout(timer); };
  }, [term]);

  const origin: Origin | null = near === 'me' ? me : near ? placeFor(near) : null;

  const count = useMemo(() => {
    if (!all) return null;
    return all.filter((it) => {
      if (!typeMatches(type, it.type)) return false;
      if (origin && rad > 0) {
        const d = distanceTo(origin, it);
        if (!d || d.km > rad) return false;
      }
      return true;
    }).length;
  }, [all, type, origin, rad]);

  const pickPlace = (p: string) => { setLocErr(''); setNear(p); if (!p) setRad(0); };
  const locate = () => {
    if (near === 'me') return;
    if (!navigator.geolocation) { setLocErr(t('filter.no_location', 'Location is not available on this device.')); return; }
    setLocErr('');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setNear('me'); setLocating(false); },
      (e) => {
        setLocating(false);
        setLocErr(e.code === e.PERMISSION_DENIED
          ? t('filter.location_denied', 'Location is off for aangan. Allow it in your browser settings and try again.')
          : t('filter.no_location', 'Location is not available on this device.'));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  const active = !!(near || type || cheap || rad);
  const clear = () => { setNear(''); setRad(0); setType(''); setCheap(false); setLocErr(''); };

  const search = () => {
    const p = new URLSearchParams();
    if (term) p.set('q', term);
    if (type) p.set('type', type);
    if (near) p.set('near', near);
    if (near && rad) p.set('within', String(rad));
    if (cheap) p.set('sort', 'price_asc');
    onDone();
    nav(`/search${p.toString() ? `?${p}` : ''}`);
  };

  const town = near && near !== 'me' ? near : '';
  const chip = (on: boolean) => `ag-home-ftonal${on ? ' on' : ''}`;

  return (
    <div className="ag-home-fpanel" id="booking-widget-panel" data-testid="booking-widget-pill-panel">
      <fieldset className="ag-home-fgroup">
        <legend>{t('filter.where', 'Where')}</legend>
        <div className="chips">
          <button type="button" className={chip(!near)} aria-pressed={!near} onClick={() => pickPlace('')} data-testid="home-filter-anywhere">
            {t('filter.anywhere', 'Anywhere')}
          </button>
          <button type="button" className={chip(near === 'me')} aria-pressed={near === 'me'} onClick={locate} disabled={locating} data-testid="home-filter-me">
            <Icon name="locate" /> {locating ? t('filter.locating', 'Finding you…') : t('filter.my_location', 'My location')}
          </button>
          <select className={`ag-in ag-home-fselect${town ? ' on' : ''}`} aria-label={t('filter.pick_town', 'Pick a town')}
            value={town} onChange={(e) => pickPlace(e.target.value)} data-testid="home-filter-place">
            <option value="">{t('filter.pick_town', 'Pick a town')}</option>
            {HUBS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
        </div>
        {locErr && <p className="ag-err m-0" role="alert">{locErr}</p>}
      </fieldset>

      {near && (
        <fieldset className="ag-home-fgroup" data-testid="home-filter-within">
          <legend>{t('filter.how_far', { place: near === 'me' ? t('filter.you', 'you') : near, defaultValue: 'How far from {{place}}' })}</legend>
          <div className="chips">
            {DISTANCES.map((km) => (
              <button key={km} type="button" className={chip(rad === km)} aria-pressed={rad === km} onClick={() => setRad(km)} data-testid={`home-filter-km-${km}`}>
                {km ? t('filter.km', { km, defaultValue: '{{km}} km' }) : t('filter.any_distance', 'Any distance')}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset className="ag-home-fgroup">
        <legend>{t('filter.what', 'What')}</legend>
        <div className="chips" data-testid="home-filter-type">
          {TYPES.map((o) => (
            <button key={o.value} type="button" className={chip(type === o.value)} aria-pressed={type === o.value} onClick={() => setType(o.value)}
              data-testid={`home-filter-type-${o.value || 'all'}`}>
              {t(o.key, o.fallback)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ag-home-fgroup">
        <legend>{t('filter.sort_by', 'Sort by')}</legend>
        <div className="chips">
          <button type="button" className={chip(!cheap)} aria-pressed={!cheap} onClick={() => setCheap(false)} data-testid="home-filter-best">
            {t('filter.best_match', 'Best match')}
          </button>
          <button type="button" className={chip(cheap)} aria-pressed={cheap} onClick={() => setCheap(true)} data-testid="home-filter-cheap">
            {t('filter.cheapest_first', 'Cheapest first')}
          </button>
        </div>
      </fieldset>

      <div className="ag-home-fgo">
        <button type="button" className="ag-home-fsearch" onClick={search} data-testid="booking-widget-panel-search">
          <Icon name="search" />
          {count === null
            ? t('widget.search')
            : <span data-testid="home-filter-count">{t('filter.show_n', { count, defaultValue: 'Show {{count}} results' })}</span>}
        </button>
        {active && (
          <button type="button" className="ag-btn text" onClick={clear} data-testid="home-filter-clear">{t('filter.clear', 'Clear filters')}</button>
        )}
      </div>
    </div>
  );
}
