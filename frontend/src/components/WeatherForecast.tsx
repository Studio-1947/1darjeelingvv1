import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CaretUp,
  CaretDown,
  CircleNotch as Loader2,
} from '@phosphor-icons/react';
import { parseDate } from '@/lib/dates';
import api from '@/lib/api';

interface DayForecast {
  date: string;
  code: number;
  tempMax: number;
  tempMin: number;
}

interface Props {
  /** Free-text place name, straight from the destination search field. */
  query: string;
}

// Open-Meteo's forecast endpoint is free, keyless and explicitly fine to call
// straight from the browser (https://github.com/public-apis/public-apis, Weather
// section) - unlike Nominatim, which the backend already proxies at /api/geocode
// under its own usage policy. Reuse that existing, rate-limited geocoder for
// lat/lon instead of standing up a second one here.
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/** Minimum query length: matches /api/geocode/search's own floor. */
const MIN_QUERY_LEN = 3;

/** Maps a WMO weather code (Open-Meteo's `weathercode`) to an icon, accent color and condition key. */
function weatherInfo(code: number) {
  if (code === 0) return { Icon: Sun, tint: 'text-gold', chip: 'bg-gold/15', condition: 'clear' };
  if (code <= 3) return { Icon: CloudSun, tint: 'text-gold', chip: 'bg-gold/10', condition: 'partly_cloudy' };
  if (code === 45 || code === 48) return { Icon: CloudFog, tint: 'text-slate-300', chip: 'bg-slate-300/10', condition: 'fog' };
  if (code >= 51 && code <= 67) return { Icon: CloudRain, tint: 'text-sky-300', chip: 'bg-sky-300/10', condition: 'rain' };
  if (code >= 71 && code <= 86) return { Icon: CloudSnow, tint: 'text-sky-100', chip: 'bg-sky-100/10', condition: 'snow' };
  if (code >= 95) return { Icon: CloudLightning, tint: 'text-violet-300', chip: 'bg-violet-300/10', condition: 'storm' };
  return { Icon: Cloud, tint: 'text-white/80', chip: 'bg-white/10', condition: 'cloudy' };
}

export default function WeatherForecast({ query }: Props) {
  const { t, i18n } = useTranslation();
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

        const fcRes = await fetch(
          `${FORECAST_URL}?latitude=${hit.lat}&longitude=${hit.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=7`
        );
        const fc = await fcRes.json();
        if (cancelled) return;

        const daily = fc?.daily;
        if (!daily?.time?.length) {
          setDays([]);
          setNotFound(true);
          return;
        }

        setPlaceName(String(hit.display_name || '').split(',')[0].trim());
        setDays(
          daily.time.map((date: string, i: number) => ({
            date,
            code: daily.weathercode[i],
            tempMax: Math.round(daily.temperature_2m_max[i]),
            tempMin: Math.round(daily.temperature_2m_min[i]),
          }))
        );
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
    <div data-testid="weather-forecast" className="w-full text-white">
      {loading && (
        <div className="flex items-center gap-2 text-white/80 text-sm py-2">
          <Loader2 size={16} className="animate-spin" />
          {t('weather.loading')}
        </div>
      )}

      {!loading && notFound && (
        <div data-testid="weather-forecast-not-found" className="text-white/70 text-sm py-2">
          {t('weather.not_found')}
        </div>
      )}

      {!loading && !notFound && days.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-white mb-2">
            {t('weather.forecast_for', { name: placeName })}
          </div>
          <div className="flex gap-2 sm:gap-3 overflow-x-auto no-scrollbar pb-1">
            {days.map((d, i) => {
              const { Icon, tint, chip, condition } = weatherInfo(d.code);
              const dt = parseDate(d.date);
              const dayLabel = i === 0
                ? t('weather.today')
                : dt
                  ? dt.toLocaleDateString(i18n.language || 'en', { weekday: 'short' })
                  : d.date;
              return (
                <div
                  key={d.date}
                  data-testid={`weather-forecast-day-${d.date}`}
                  className={`flex-shrink-0 w-[4.5rem] sm:w-24 flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 border transition-colors hover:bg-white/10 ${
                    i === 0 ? 'bg-white/10 border-gold/40' : 'bg-black/30 border-white/15'
                  }`}
                >
                  <span
                    className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wide ${
                      i === 0 ? 'text-gold' : 'text-white/70'
                    }`}
                  >
                    {dayLabel}
                  </span>
                  <span className={`flex items-center justify-center w-9 h-9 rounded-full ${chip}`}>
                    <Icon size={20} weight="fill" className={tint} />
                  </span>
                  <span className="text-[10px] text-white/50 leading-none truncate w-full text-center">
                    {t(`weather.conditions.${condition}`)}
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-0.5 text-sm font-extrabold text-white" title={t('weather.high')}>
                      <CaretUp size={9} weight="bold" className="text-flag" />
                      {d.tempMax}°
                    </span>
                    <span className="flex items-center gap-0.5 text-sm font-semibold text-white/60" title={t('weather.low')}>
                      <CaretDown size={9} weight="bold" className="text-sky-300" />
                      {d.tempMin}°
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
