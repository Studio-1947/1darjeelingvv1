import React, { useState, useEffect } from 'react';
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

  // Bare text on the hero video: no panel, border or blur. Two consequences shape the
  // classes below. The gaps are wider than the card version's, because whitespace is now
  // the only thing separating one reading from the next; and the text carries the same
  // drop-shadow as the hero headline, because the footage runs bright in places and plain
  // white on a pale frame is unreadable without it.
  return (
    <div
      data-testid="weather-widget"
      className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4 md:gap-x-10"
    >
      {LOCATIONS.map((key) => (
        <div key={key} data-testid={`weather-card-${key}`} className="text-white">
          <div className="text-[11px] font-bold uppercase tracking-widest text-white/75 truncate drop-shadow">
            {temps[key].name}
          </div>
          <div className="font-display font-extrabold text-2xl leading-none mt-1.5 drop-shadow-lg">
            {temps[key].temp}°C
          </div>
        </div>
      ))}
    </div>
  );
}
