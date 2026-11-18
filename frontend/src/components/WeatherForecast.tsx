import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CircleNotch as Loader2 } from '@phosphor-icons/react';
import { parseDate } from '@/lib/dates';
import api from '@/lib/api';
import { Icon, type IconName } from '@/components/ag/Icon';

interface DayForecast {
  date: string;
  code: number;
  tempMax: number;
  tempMin: number;
  /** Highest chance of rain that day, in %. */
  rain: number | null;
}

// Open-Meteo's forecast endpoint is free, keyless and explicitly fine to call
// straight from the browser (https://github.com/public-apis/public-apis, Weather
// section) - unlike Nominatim, which the backend already proxies at /api/geocode
// under its own usage policy. Reuse that existing, rate-limited geocoder for
// lat/lon instead of standing up a second one here.
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const DAYS = 5;

/** Minimum query length: matches /api/geocode/search's own floor. */
const MIN_QUERY_LEN = 3;

type Kind = 'clear' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';
const ICON: Record<Kind, IconName> = { clear: 'sun', partly: 'pcloud', cloud: 'cloud', fog: 'fog', rain: 'rain', snow: 'snow', storm: 'storm' };
/** The condition's key under weather.conditions. */
const CONDITION: Record<Kind, string> = { clear: 'clear', partly: 'partly_cloudy', cloud: 'cloudy', fog: 'fog', rain: 'rain', snow: 'snow', storm: 'storm' };

/** WMO weather code to the sky it shows (the same buckets as the prototype's wxKind). */
function kindOf(code: number): Kind {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloud';
  if (code <= 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return 'rain';
}

/** One forecast per point, in the order asked. Open-Meteo answers several points in one call. */
async function fetchForecasts(points: Array<{ lat: number; lng: number }>): Promise<DayForecast[][]> {
  const lat = points.map((p) => p.lat).join(',');
  const lng = points.map((p) => p.lng).join(',');
  const res = await fetch(
    `${FORECAST_URL}?latitude=${lat}&longitude=${lng}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FKolkata&forecast_days=${DAYS}`,
  );
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  const body = await res.json();
  const list: any[] = Array.isArray(body) ? body : [body];
  return list.map((fc) => {
    const d = fc?.daily;
    if (!d?.time?.length) return [];
    return d.time.map((date: string, i: number) => ({
      date,
      code: d.weather_code?.[i] ?? 3,
      tempMax: Math.round(d.temperature_2m_max[i]),
      tempMin: Math.round(d.temperature_2m_min[i]),
      rain: d.precipitation_probability_max?.[i] ?? null,
    }));
  });
}

/** The sky card with only a line in it: loading, failed, not found. */
function SkyMessage({ title, children, testId }: { title: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <div className="ag-feed-wx wx-cloud" data-testid={testId}>
      <div className="ag-feed-wxtop"><span className="ag-feed-wxeye">{title}</span></div>
      {children}
    </div>
  );
}

/** Today large over the sky's colour, then five days in a frosted strip. */
function ForecastView({ place, days, testId }: { place: string; days: DayForecast[]; testId?: string }) {
  const { t, i18n } = useTranslation();
  const today = days[0];
  const k0 = kindOf(today.code);
  return (
    <div className={`ag-feed-wx wx-${k0}`} data-testid={testId}>
      <div className="ag-feed-wxtop">
        <span className="ag-feed-wxeye min-w-0"><Icon name="pin" /> <span className="truncate">{place}</span></span>
        <span className="ag-feed-wxeye">{t('weather.today')}</span>
      </div>
      <div className="ag-feed-wxnow">
        <div className="min-w-0">
          <b className="ag-feed-wxtemp tabular-nums">{today.tempMax}°</b>
          <p className="ag-feed-wxcond">{t(`weather.conditions.${CONDITION[k0]}`)}</p>
          <p className="ag-feed-wxhl">
            H {today.tempMax}° · L {today.tempMin}°
            {today.rain != null && (<> · <Icon name="rain" /> {today.rain}%</>)}
          </p>
        </div>
        <span className="ag-feed-wxbig" aria-hidden="true"><Icon name={ICON[k0]} /></span>
      </div>
      <div className="ag-feed-wxstrip">
        {days.map((d, i) => {
          const k = kindOf(d.code);
          const dt = parseDate(d.date);
          const label = i === 0 ? t('weather.today') : dt ? dt.toLocaleDateString(i18n.language || 'en', { weekday: 'short' }) : d.date;
          return (
            <div key={d.date} data-testid={`weather-forecast-day-${d.date}`} title={t(`weather.conditions.${CONDITION[k]}`)}
              className={`ag-feed-wxcol${i === 0 ? ' on' : ''}`}>
              <span className="truncate max-w-full">{label}</span>
              <Icon name={ICON[k]} title={t(`weather.conditions.${CONDITION[k]}`)} />
              <b className="tabular-nums">{d.tempMax}°</b>
              <i className="tabular-nums">{d.tempMin}°</i>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The forecast for a typed place (under the home search). Geocodes the text through the backend,
 * then asks Open-Meteo.
 */
export default function WeatherForecast({ query }: { query: string }) {
  const { t } = useTranslation();
  const [placeName, setPlaceName] = useState('');
  const [days, setDays] = useState<DayForecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < MIN_QUERY_LEN) {
      setDays([]);
      setPlaceName('');
      setNotFound(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setNotFound(false);

    // Debounced so every keystroke doesn't fire a geocode + forecast round trip.
    const timer = setTimeout(async () => {
      try {
        const geoRes = await api.get('/geocode/search', { params: { q: needle } });
        const hit = geoRes.data?.results?.[0];
        if (cancelled) return;
        if (!hit) {
          setPlaceName('');
          setDays([]);
          setNotFound(true);
          return;
        }
        const [fc] = await fetchForecasts([{ lat: Number(hit.lat), lng: Number(hit.lon) }]);
        if (cancelled) return;
        if (!fc?.length) {
          setDays([]);
          setNotFound(true);
          return;
        }
        setPlaceName(String(hit.display_name || '').split(',')[0].trim());
        setDays(fc);
      } catch {
        if (!cancelled) {
          setDays([]);
          setNotFound(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  if (query.trim().length < MIN_QUERY_LEN) return null;

  if (loading || notFound || days.length === 0) {
    return (
      <SkyMessage title={t('feed.kind_weather', 'Weather')} testId="weather-forecast">
        {loading ? (
          <p className="ag-feed-wxmsg inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t('weather.loading')}</p>
        ) : (
          <p className="ag-feed-wxmsg" data-testid="weather-forecast-not-found">{t('weather.not_found')}</p>
        )}
      </SkyMessage>
    );
  }
  return <ForecastView place={placeName} days={days} testId="weather-forecast" />;
}

/* ---------- the Feed's weather box: the hill towns, one tap each ---------- */

type Town = { name: string; lat: number; lng: number; custom?: boolean };
const TOWNS: Town[] = [
  { name: 'Darjeeling', lat: 27.041, lng: 88.2663 },
  { name: 'Ghum', lat: 27.0087, lng: 88.253 },
  { name: 'Kurseong', lat: 26.88, lng: 88.279 },
  { name: 'Kalimpong', lat: 27.0594, lng: 88.4695 },
  { name: 'Mirik', lat: 26.887, lng: 88.187 },
  { name: 'Lepchajagat', lat: 27.029, lng: 88.201 },
  { name: 'Sittong', lat: 26.946, lng: 88.364 },
  { name: 'Gangtok', lat: 27.3389, lng: 88.6065 },
];

// One fetch per visit to the site, not one per visit to the Feed.
let townCache: { at: number; data: DayForecast[][] } | null = null;
const CACHE_MS = 3 * 60 * 60 * 1000;

type Hit = { name: string; lat: number; lng: number; sub?: string };

/**
 * Five days for each hill town, in one Open-Meteo call. "Search location" finds any place through
 * the backend's geocoder and "My location" uses the phone's position; either adds a chip up front.
 */
export function HillWeather() {
  const { t } = useTranslation();
  const [towns, setTowns] = useState<Town[]>(TOWNS);
  const [data, setData] = useState<DayForecast[][] | null>(townCache && Date.now() - townCache.at < CACHE_MS ? townCache.data : null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<'' | 'me' | string>('');
  const [oneFailed, setOneFailed] = useState(false);
  const [locFailed, setLocFailed] = useState(false);
  const [finding, setFinding] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const qRef = useRef<HTMLInputElement>(null);
  const myName = t('ob.wz.myloc', 'My location');

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const fc = await fetchForecasts(TOWNS);
      townCache = { at: Date.now(), data: fc };
      setData(fc);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { if (!data) load(); }, [data, load]);

  // Typed place names go to the backend geocoder (same floor and debounce as the home search).
  useEffect(() => {
    if (!finding) return;
    const needle = q.trim();
    if (needle.length < MIN_QUERY_LEN) { setHits([]); setSearching(false); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data: res } = await api.get('/geocode/search', { params: { q: needle } });
        if (cancelled) return;
        setHits((res?.results || []).slice(0, 6).map((r: any) => {
          const parts = String(r.display_name || '').split(',').map((s: string) => s.trim()).filter(Boolean);
          return { name: parts[0] || needle, sub: parts.slice(1, 3).join(', '), lat: Number(r.lat), lng: Number(r.lon) };
        }).filter((h: Hit) => Number.isFinite(h.lat) && Number.isFinite(h.lng)));
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, finding]);

  /** Forecast one more place and put its chip first, selected. */
  const addPlace = async (place: Town, key: string) => {
    const at = towns.findIndex((x) => x.name.toLowerCase() === place.name.toLowerCase());
    if (at >= 0 && data?.[at]?.length) { setSel(at); setFinding(false); return; }
    setBusy(key);
    setOneFailed(false);
    try {
      const [fc] = await fetchForecasts([place]);
      if (!fc?.length) throw new Error('empty');
      const keep = towns.map((x, i) => [x, data?.[i] || []] as const).filter(([x]) => x.name.toLowerCase() !== place.name.toLowerCase());
      setTowns([{ ...place, custom: true }, ...keep.map(([x]) => x)]);
      setData([fc, ...keep.map(([, d]) => d)]);
      setSel(0);
      setFinding(false);
      setQ('');
    } catch {
      setOneFailed(true);
    } finally {
      setBusy('');
    }
  };

  const myLocation = () => {
    const at = towns.findIndex((x) => x.custom && x.name === myName);
    if (at >= 0) { setSel(at); return; }
    if (!navigator.geolocation) { setLocFailed(true); return; }
    setBusy('me');
    setLocFailed(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy('');
        addPlace({ name: myName, lat: +pos.coords.latitude.toFixed(3), lng: +pos.coords.longitude.toFixed(3) }, 'me');
      },
      () => { setBusy(''); setLocFailed(true); },
      { timeout: 8000 },
    );
  };

  const toggleFind = () => {
    setFinding((v) => !v);
    setQ('');
    setHits([]);
    setTimeout(() => qRef.current?.focus(), 0);
  };

  const days = data?.[sel] || [];
  const needle = q.trim().toLowerCase();
  const townHits = TOWNS.filter((x) => !needle || x.name.toLowerCase().includes(needle));
  return (
    <section className="flex flex-col" data-testid="feed-weather" aria-label={t('feed.kind_weather', 'Weather')}>
      {days.length > 0 ? (
        <ForecastView place={towns[sel].name} days={days} testId="weather-forecast" />
      ) : (
        <SkyMessage title={t('feed.kind_weather', 'Weather')} testId="weather-forecast">
          {failed ? (
            <>
              <p className="ag-feed-wxmsg">{t('weather.failed', 'Could not load the forecast. Check your internet.')}</p>
              <button type="button" className="ag-btn sm ag-feed-wxretry" onClick={load} data-testid="weather-retry">{t('feed.retry')}</button>
            </>
          ) : (
            <p className="ag-feed-wxmsg inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t('weather.loading')}</p>
          )}
        </SkyMessage>
      )}

      <div className="ag-feed-wxpills" role="group" aria-label={t('weather.places', 'Places')}>
        <button type="button" className="ag-feed-wxpill act" onClick={toggleFind} aria-pressed={finding} aria-expanded={finding}
          data-testid="weather-search">
          <Icon name="search" /><span>{t('weather.search', 'Search location')}</span>
        </button>
        <button type="button" className="ag-feed-wxpill act" onClick={myLocation} disabled={busy === 'me'} data-testid="weather-my-location">
          {busy === 'me' ? <Loader2 className="animate-spin" /> : <Icon name="locate" />}<span>{busy === 'me' ? t('weather.loading') : myName}</span>
        </button>
        {data && towns.map((town, i) => {
          const first = data[i]?.[0];
          return (
            <button type="button" key={town.name} className="ag-feed-wxpill" aria-pressed={sel === i} onClick={() => setSel(i)}
              disabled={!first} data-testid={`weather-place-${i}`}>
              <Icon name={first ? ICON[kindOf(first.code)] : 'cloud'} /><span>{town.name}</span>{first && <b>{first.tempMax}°</b>}
            </button>
          );
        })}
      </div>

      {finding && (
        <div className="ag-feed-wxfind" data-testid="weather-find">
          <label className="ag-feed-wxq">
            <Icon name="search" />
            <input ref={qRef} type="search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
              placeholder={t('weather.search_ph', 'Search a town, village or spot…')} aria-label={t('weather.search', 'Search location')}
              data-testid="weather-search-input" />
            {searching && <Loader2 className="animate-spin" />}
          </label>
          <div className="ag-feed-wxlist">
            {townHits.map((x) => (
              <button type="button" key={`t-${x.name}`} className="ag-feed-wxopt" onClick={() => addPlace(x, x.name)} disabled={!!busy}>
                <Icon name="pin" /><span className="grow"><b>{x.name}</b></span>
                {busy === x.name ? <Loader2 className="animate-spin" /> : <Icon name="arrowne" />}
              </button>
            ))}
            {hits.filter((h) => !townHits.some((x) => x.name.toLowerCase() === h.name.toLowerCase())).map((h, i) => {
              const key = `${h.name}|${i}`;
              return (
                <button type="button" key={key} className="ag-feed-wxopt" onClick={() => addPlace(h, key)} disabled={!!busy}
                  data-testid={`weather-hit-${i}`}>
                  <Icon name="pin" />
                  <span className="grow"><b>{h.name}</b>{h.sub && <span className="ag-small block truncate">{h.sub}</span>}</span>
                  {busy === key ? <Loader2 className="animate-spin" /> : <Icon name="arrowne" />}
                </button>
              );
            })}
            {!searching && townHits.length === 0 && hits.length === 0 && needle.length >= MIN_QUERY_LEN && (
              <p className="ag-small m-0">{t('weather.search_none', 'No match. Try another name or place.')}</p>
            )}
          </div>
        </div>
      )}
      {(oneFailed || locFailed) && (
        <p className="ag-small m-0 mt-2">{locFailed ? t('ob.wz.noloc') : t('weather.failed', 'Could not load the forecast. Check your internet.')}</p>
      )}
      <p className="ag-feed-wxsrc">{t('weather.source', 'Forecast data: Open-Meteo')}</p>
    </section>
  );
}
