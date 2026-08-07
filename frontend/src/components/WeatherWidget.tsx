import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, CloudSun, CloudFog, Thermometer, Wind, Droplets, Mountain, Eye } from 'lucide-react';
import api from '@/lib/api';

interface LocationWeather {
  name: string;
  altitude: string;
  temp: number;
  condition: string;
  humidity: number;
  wind: string;
  kanchenjungaIndex: 'clear' | 'partial' | 'misty';
  sunriseTime: string;
}

const WEATHERS: Record<string, LocationWeather> = {
  darjeeling: {
    name: 'Darjeeling Town',
    altitude: '2,045m',
    temp: 16,
    condition: 'Mild Mountain Breeze',
    humidity: 65,
    wind: '8 km/h NW',
    kanchenjungaIndex: 'clear',
    sunriseTime: '05:08 AM',
  },
  kalimpong: {
    name: 'Kalimpong Ridge',
    altitude: '1,250m',
    temp: 20,
    condition: 'Sunny & Pleasant',
    humidity: 58,
    wind: '6 km/h W',
    kanchenjungaIndex: 'clear',
    sunriseTime: '05:06 AM',
  },
  kurseong: {
    name: 'Kurseong Dow Hill',
    altitude: '1,458m',
    temp: 18,
    condition: 'Light Fog In Valleys',
    humidity: 72,
    wind: '10 km/h SW',
    kanchenjungaIndex: 'partial',
    sunriseTime: '05:09 AM',
  },
  mirik: {
    name: 'Mirik Lake',
    altitude: '1,495m',
    temp: 19,
    condition: 'Clear Blue Skies',
    humidity: 60,
    wind: '5 km/h W',
    kanchenjungaIndex: 'clear',
    sunriseTime: '05:10 AM',
  },
};

export default function WeatherWidget() {
  const { t } = useTranslation();
  const [selectedLoc, setSelectedLoc] = useState<keyof typeof WEATHERS>('darjeeling');
  const [weatherData, setWeatherData] = useState<LocationWeather>(WEATHERS.darjeeling);

  const handleSelectLocation = (key: keyof typeof WEATHERS) => {
    setSelectedLoc(key);
    if (WEATHERS[key]) {
      setWeatherData(WEATHERS[key]);
    }
  };

  useEffect(() => {
    let cancelled = false;
    api
      .get('/weather', { params: { location: selectedLoc } })
      .then((r) => {
        if (!cancelled && r.data) setWeatherData(r.data);
      })
      .catch(() => {
        if (!cancelled && WEATHERS[selectedLoc]) {
          setWeatherData(WEATHERS[selectedLoc]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedLoc]);

  const data = weatherData;

  const indexBadge = {
    clear: {
      label: t('weather.clear_view', 'Clear View Expected ☀️'),
      bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: Sun,
    },
    partial: {
      label: t('weather.partial_view', 'Partial Cloud Cover ⛅'),
      bg: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      icon: CloudSun,
    },
    misty: {
      label: t('weather.misty_view', 'Misty / Low Visibility 🌫️'),
      bg: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
      icon: CloudFog,
    },
  }[data.kanchenjungaIndex || 'clear'];

  const BadgeIcon = indexBadge.icon;

  return (
    <div
      data-testid="weather-widget"
      className="relative bg-black/60 backdrop-blur-xl border border-white/20 rounded-3xl p-4 md:p-6 text-white shadow-2xl transition-all border-light overflow-hidden"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/15">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-gold">
            <Mountain size={20} />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-white/60">
              {t('weather.live_heading', 'Himalayan Climate & Peaks')}
            </div>
            <div className="font-display font-extrabold text-lg flex items-center gap-2">
              {data.name} <span className="text-xs text-white/50 font-normal">({data.altitude})</span>
            </div>
          </div>
        </div>

        {/* Location Selector Chips */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
          {Object.keys(WEATHERS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleSelectLocation(key as keyof typeof WEATHERS)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                selectedLoc === key
                  ? 'bg-white text-pine shadow-sm scale-105'
                  : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              {WEATHERS[key].name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        {/* Temperature & Condition */}
        <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3.5">
          <div className="w-12 h-12 rounded-xl bg-gold/20 text-gold flex items-center justify-center flex-shrink-0">
            <Thermometer size={24} />
          </div>
          <div>
            <div className="font-display font-extrabold text-2xl leading-none">
              {data.temp}°C
            </div>
            <div className="text-xs text-white/80 font-semibold mt-1 truncate">
              {data.condition}
            </div>
          </div>
        </div>

        {/* Kanchenjunga Index */}
        <div className="sm:col-span-2 flex flex-col justify-between bg-white/5 border border-white/10 rounded-2xl p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white/70 flex items-center gap-1.5">
              <Eye size={14} className="text-gold" />
              {t('weather.kanchenjunga_heading', 'Kanchenjunga Sunrise Viewability')}
            </span>
            <span className="text-[11px] text-white/60 font-semibold">
              Sunrise {data.sunriseTime}
            </span>
          </div>

          <div
            className={`mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-extrabold ${indexBadge.bg}`}
          >
            <BadgeIcon size={16} />
            <span>{indexBadge.label}</span>
          </div>
        </div>
      </div>

      {/* Humidity & Wind Footer */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
        <span className="flex items-center gap-1.5">
          <Droplets size={14} className="text-blue-400" />
          Humidity: <span className="font-bold text-white">{data.humidity}%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Wind size={14} className="text-teal-300" />
          Wind: <span className="font-bold text-white">{data.wind}</span>
        </span>
      </div>
    </div>
  );
}
