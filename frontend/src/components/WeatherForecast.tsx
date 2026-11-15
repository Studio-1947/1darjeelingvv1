import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  Drop,
  MapPin,
  Crosshair,
  CircleNotch as Loader2,
} from '@phosphor-icons/react';
import { parseDate } from '@/lib/dates';
import api from '@/lib/api';
import { Box, Button, Chip, Chips } from '@/components/ag';

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

/**
 * The sky behind the forecast: the one gradient surface in the app, built from the theme's warm
 * tokens (dawn over the hills) rather than its own colours.
 */
const SKY: React.CSSProperties = {
  background: 'linear-gradient(165deg, var(--blush2) 0%, var(--blush) 30%, var(--creme2) 65%, var(--creme) 100%)',
  borderColor: 'var(--blush2)',
};

/** Maps a WMO weather code to an icon and a condition key under weather.conditions. */
function weatherInfo(code: number) {
  if (code === 0) return { Icon: Sun, condition: 'clear' };
  if (code <= 2) return { Icon: CloudSun, condition: 'partly_cloudy' };
  if (code === 45 || code === 48) return { Icon: CloudFog, condition: 'fog' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { Icon: CloudSnow, condition: 'snow' };
  if (code >= 95) return { Icon: CloudLightning, condition: 'storm' };
  if (code >= 51) return { Icon: CloudRain, condition: 'rain' };
  return { Icon: Cloud, condition: 'cloudy' };
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

/** Today large, then the next days in a strip: the weather box in the Feed and under the home search. */
function ForecastView({ place, days }: { place: string; days: DayForecast[] }) {
  const { t, i18n } = useTranslation();
  const today = days[0];
  const { Icon: TodayIcon, condition } = weatherInfo(today.code);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="ag-eyebrow inline-flex items-center gap-1.5 min-w-0">
          <MapPin size={14} weight="fill" className="flex-none" /> <span className="truncate">{place}</span>
        </span>
        <span className="ag-eyebrow">{t('weather.today')}</span>
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <b className="block text-[56px] leading-[60px] tracking-[-0.03em] text-[var(--ink-strong)] tabular-nums">{today.tempMax}°</b>
          <p className="ag-lead m-0">{t(`weather.conditions.${condition}`)}</p>
          <p className="ag-small m-0 inline-flex items-center gap-1 !text-[var(--ink7)]">
            {t('weather.high')} {today.tempMax}° · {t('weather.low')} {today.tempMin}°
            {today.rain != null && (<> · <Drop size={13} weight="fill" className="text-[var(--r)]" aria-hidden="true" /> {today.rain}%</>)}
          </p>
        </div>
        <TodayIcon size={80} weight="duotone" className="flex-none text-[var(--r)]" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-5 gap-1 rounded-[18px] bg-white/60 p-1.5">
        {days.map((d, i) => {
          const { Icon, condition: c } = weatherInfo(d.code);
          const dt = parseDate(d.date);
          const label = i === 0 ? t('weather.today') : dt ? dt.toLocaleDateString(i18n.language || 'en', { weekday: 'short' }) : d.date;
          return (
            <div key={d.date} data-testid={`weather-forecast-day-${d.date}`} title={t(`weather.conditions.${c}`)}
              className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs text-[var(--ink-muted)] ${i === 0 ? 'bg-white' : ''}`}>
              <span className="font-medium text-[var(--ink-strong)] truncate max-w-full">{label}</span>
              <Icon size={22} weight="duotone" className="text-[var(--r)]" aria-label={t(`weather.conditions.${c}`)} />
              <b className="text-[15px] leading-[18px] font-medium text-[var(--ink-strong)] tabular-nums">{d.tempMax}°</b>
              <span className="tabular-nums">{d.tempMin}°</span>
            </div>
          );
        })}
      </div>
    </>
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

  return (
    <Box data-testid="weather-forecast" style={SKY}>
      {loading ? (
        <p className="ag-small m-0 inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t('weather.loading')}</p>
      ) : notFound || days.length === 0 ? (
        <p className="ag-small m-0" data-testid="weather-forecast-not-found">{t('weather.not_found')}</p>
      ) : (
        <ForecastView place={placeName} days={days} />
      )}
    </Box>
  );
}

/* ---------- the Feed's weather box: the hill towns, one tap each ---------- */

type Town = { name: string; lat: number; lng: number; mine?: boolean };
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

/** Five days for each hill town, in one Open-Meteo call; "My location" adds the reader's own spot. */
export function HillWeather() {
  const { t } = useTranslation();
  const [towns, setTowns] = useState<Town[]>(TOWNS);
  const [data, setData] = useState<DayForecast[][] | null>(townCache && Date.now() - townCache.at < CACHE_MS ? townCache.data : null);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState(0);
  const [locating, setLocating] = useState(false);
  const [locFailed, setLocFailed] = useState(false);

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

  const myLocation = () => {
    const at = towns.findIndex((x) => x.mine);
    if (at >= 0) { setSel(at); return; }
    if (!navigator.geolocation) { setLocFailed(true); return; }
    setLocating(true);
    setLocFailed(false);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const [fc] = await fetchForecasts([here]);
        setTowns((list) => [{ name: t('ob.wz.myloc', 'My location'), ...here, mine: true }, ...list]);
        setData((d) => [fc, ...(d || [])]);
        setSel(0);
      } catch {
        setLocFailed(true);
      } finally {
        setLocating(false);
      }
    }, () => { setLocating(false); setLocFailed(true); }, { timeout: 8000 });
  };

  const days = data?.[sel] || [];
  return (
    <section className="flex flex-col gap-2.5" data-testid="feed-weather" aria-label={t('feed.kind_weather', 'Weather')}>
      <Box style={SKY} data-testid="weather-forecast">
        {days.length > 0 ? (
          <ForecastView place={towns[sel].name} days={days} />
        ) : (
          <>
            <span className="ag-eyebrow">{t('feed.kind_weather', 'Weather')}</span>
            {failed ? (
              <>
                <p className="ag-small m-0 !text-[var(--ink7)]">{t('weather.failed', 'Could not load the forecast. Check your internet.')}</p>
                <Button size="sm" className="self-start" onClick={load} data-testid="weather-retry">{t('feed.retry')}</Button>
              </>
            ) : (
              <p className="ag-small m-0 inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> {t('weather.loading')}</p>
            )}
          </>
        )}
      </Box>
      {data && (
        <Chips scroll aria-label={t('weather.places', 'Places')}>
          {!towns.some((x) => x.mine) && (
            <Chip onClick={myLocation} disabled={locating} data-testid="weather-my-location">
              {locating ? <Loader2 className="animate-spin" /> : <Crosshair />} {t('ob.wz.myloc', 'My location')}
            </Chip>
          )}
          {towns.map((town, i) => {
            const first = data[i]?.[0];
            const Icon = first ? weatherInfo(first.code).Icon : Cloud;
            return (
              <Chip key={town.name} on={sel === i} onClick={() => setSel(i)} data-testid={`weather-place-${i}`}>
                <Icon /> {town.name}{first && <b className="font-medium">{first.tempMax}°</b>}
              </Chip>
            );
          })}
        </Chips>
      )}
      {locFailed && <p className="ag-small m-0">{t('ob.wz.noloc')}</p>}
      <p className="ag-small m-0 !text-xs">{t('weather.source', 'Forecast data: Open-Meteo')}</p>
    </section>
  );
}
