import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';

interface LocationWeather {
  name: string;
  temp: number;
}

/** Order here is the order the cards render in. */
const LOCATIONS = ['darjeeling', 'kalimpong', 'kurseong', 'mirik'] as const;
type LocationKey = (typeof LOCATIONS)[number];

/** Shown until /weather answers, and kept as the value if it never does. */
const FALLBACK: Record<LocationKey, LocationWeather> = {
  darjeeling: { name: 'Darjeeling', temp: 16 },
  kalimpong: { name: 'Kalimpong', temp: 20 },
  kurseong: { name: 'Kurseong', temp: 18 },
  mirik: { name: 'Mirik', temp: 19 },
};

export default function WeatherWidget() {
  const [temps, setTemps] = useState<Record<LocationKey, LocationWeather>>(FALLBACK);

  useEffect(() => {
    let cancelled = false;

    // One request per location; each resolves independently so a single failure
    // leaves the other three live rather than dropping the whole row to fallback.
    LOCATIONS.forEach((key) => {
      api
        .get('/weather', { params: { location: key } })
        .then((r) => {
          if (cancelled || !r.data || typeof r.data.temp !== 'number') return;
          setTemps((prev) => ({ ...prev, [key]: { ...prev[key], temp: r.data.temp } }));
        })
        .catch(() => {
          /* keep the fallback temp for this location */
        });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      data-testid="weather-widget"
      className="grid grid-cols-4 gap-2 sm:gap-4 md:gap-6 w-full"
    >
      {LOCATIONS.map((key) => (
        <Link
          key={key}
          to={`/search?q=${encodeURIComponent(temps[key].name)}`}
          data-testid={`weather-card-${key}`}
          className="group block text-white transition-transform active:scale-95 text-left"
        >
          <div className="text-[10px] sm:text-[11px] md:text-xs font-bold uppercase tracking-wider md:tracking-widest text-white/80 group-hover:text-white truncate drop-shadow transition-colors">
            {temps[key].name}
          </div>
          <div className="font-display font-extrabold text-lg sm:text-xl md:text-2xl leading-none mt-1 drop-shadow-lg group-hover:text-gold transition-colors">
            {temps[key].temp}°C
          </div>
        </Link>
      ))}
    </div>
  );
}
