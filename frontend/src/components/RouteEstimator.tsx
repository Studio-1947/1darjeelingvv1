import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Car, Navigation, Clock, ShieldCheck, ArrowRight, MapPin } from 'lucide-react';
import api from '@/lib/api';

interface RouteDetail {
  distanceKm: number;
  durationHours: number;
  minFare: number;
  maxFare: number;
  routeNote: string;
  driverCount?: number;
}

const HUBS = [
  'Bagdogra Airport (IXB)',
  'NJP Railway Station',
  'Siliguri Junction',
  'Darjeeling Town',
  'Kalimpong',
  'Kurseong',
  'Mirik',
];

const ROUTE_DATA: Record<string, RouteDetail> = {
  'Bagdogra Airport (IXB)->Darjeeling Town': { distanceKm: 68, durationHours: 3.0, minFare: 2600, maxFare: 3200, routeNote: 'Scenic climb via Rohini & Ghum Hill Pass' },
  'Bagdogra Airport (IXB)->Kalimpong': { distanceKm: 76, durationHours: 2.8, minFare: 2800, maxFare: 3400, routeNote: 'River Teesta highway via Sevoke Coronation Bridge' },
  'Bagdogra Airport (IXB)->Kurseong': { distanceKm: 42, durationHours: 1.8, minFare: 2000, maxFare: 2500, routeNote: 'Direct ascent via Pankhabari / Rohini Road' },
  'Bagdogra Airport (IXB)->Mirik': { distanceKm: 53, durationHours: 2.0, minFare: 2200, maxFare: 2700, routeNote: 'Smooth Tea Garden route via Mirik Lake' },
  'NJP Railway Station->Darjeeling Town': { distanceKm: 71, durationHours: 3.2, minFare: 2600, maxFare: 3200, routeNote: 'Parallels historic Toy Train tracks via Sonada' },
  'NJP Railway Station->Kalimpong': { distanceKm: 73, durationHours: 2.7, minFare: 2700, maxFare: 3300, routeNote: 'Teesta Valley road via Sevoke Forest' },
  'NJP Railway Station->Kurseong': { distanceKm: 45, durationHours: 1.9, minFare: 2000, maxFare: 2500, routeNote: 'Giddapahar Pine forest bypass' },
  'Darjeeling Town->Kalimpong': { distanceKm: 50, durationHours: 2.2, minFare: 2200, maxFare: 2800, routeNote: 'Peshok Tea Garden viewpoint & Teesta Confluence' },
  'Darjeeling Town->Mirik': { distanceKm: 49, durationHours: 2.0, minFare: 2000, maxFare: 2500, routeNote: 'Indo-Nepal border road via Pashupati Market' },
  'Darjeeling Town->Kurseong': { distanceKm: 31, durationHours: 1.2, minFare: 1500, maxFare: 2000, routeNote: 'Hill Cart Road via Batasia Loop & Ghum' },
};

function getRouteInfo(fromLoc: string, toLoc: string): RouteDetail {
  if (fromLoc === toLoc) {
    return { distanceKm: 0, durationHours: 0, minFare: 0, maxFare: 0, routeNote: 'Same location selected' };
  }
  const directKey = `${fromLoc}->${toLoc}`;
  const reverseKey = `${toLoc}->${fromLoc}`;
  if (ROUTE_DATA[directKey]) return ROUTE_DATA[directKey];
  if (ROUTE_DATA[reverseKey]) return ROUTE_DATA[reverseKey];
  return { distanceKm: 55, durationHours: 2.5, minFare: 2400, maxFare: 3000, routeNote: 'Mountain hill highway route' };
}

export default function RouteEstimator() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [fromHub, setFromHub] = useState('Bagdogra Airport (IXB)');
  const [toHub, setToHub] = useState('Darjeeling Town');
  const [routeInfo, setRouteInfo] = useState<RouteDetail>(() => getRouteInfo('Bagdogra Airport (IXB)', 'Darjeeling Town'));

  useEffect(() => {
    let cancelled = false;
    api
      .get('/routes/estimate', { params: { from: fromHub, to: toHub } })
      .then((r) => {
        if (!cancelled && r.data) setRouteInfo(r.data);
      })
      .catch(() => {
        if (!cancelled) setRouteInfo(getRouteInfo(fromHub, toHub));
      });
    return () => {
      cancelled = true;
    };
  }, [fromHub, toHub]);

  const info = routeInfo;

  const handleSearchDrivers = () => {
    const fromName = fromHub.split(' ')[0];
    const toName = toHub.split(' ')[0];
    nav(`/search?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&type=driver`);
  };

  return (
    <div
      data-testid="route-estimator"
      className="relative bg-gradient-to-br from-[#14201A] to-[#1F332A] rounded-3xl p-5 md:p-8 text-white border border-white/15 shadow-2xl border-light overflow-hidden"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-pine/50 border border-pine text-white flex items-center justify-center">
          <Car size={20} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-flag">
            {t('estimator.tag', 'Transit & Fares')}
          </div>
          <h3 className="font-display font-extrabold text-xl md:text-2xl text-white">
            {t('estimator.title', 'Himalayan Route & Driver Fare Calculator')}
          </h3>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        <label className="block">
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
            {t('estimator.from', 'Pick Pickup Location')}
          </span>
          <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/20 bg-black/40 text-sm font-semibold">
            <MapPin size={16} className="text-pine flex-shrink-0" />
            <select
              value={fromHub}
              onChange={(e) => setFromHub(e.target.value)}
              className="w-full bg-transparent outline-none text-white cursor-pointer"
            >
              {HUBS.map((h) => (
                <option key={h} value={h} className="bg-ink text-white">
                  {h}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="block">
          <span className="text-xs font-bold text-white/60 uppercase tracking-wider">
            {t('estimator.to', 'Pick Drop Destination')}
          </span>
          <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/20 bg-black/40 text-sm font-semibold">
            <Navigation size={16} className="text-flag flex-shrink-0" />
            <select
              value={toHub}
              onChange={(e) => setToHub(e.target.value)}
              className="w-full bg-transparent outline-none text-white cursor-pointer"
            >
              {HUBS.map((h) => (
                <option key={h} value={h} className="bg-ink text-white">
                  {h}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      {/* Result Metrics */}
      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
          <div className="text-[10px] font-bold text-white/60 uppercase">Distance</div>
          <div className="font-display font-extrabold text-xl mt-1 text-white">
            {info.distanceKm} <span className="text-xs font-normal text-white/60">km</span>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-3">
          <div className="text-[10px] font-bold text-white/60 uppercase">Travel Time</div>
          <div className="font-display font-extrabold text-xl mt-1 text-white flex items-center gap-1">
            <Clock size={16} className="text-gold" /> {info.durationHours} <span className="text-xs font-normal text-white/60">hrs</span>
          </div>
        </div>

        <div className="col-span-2 bg-white/10 border border-white/20 rounded-2xl p-3 flex flex-col justify-between">
          <div className="text-[10px] font-bold text-gold uppercase tracking-wider flex items-center gap-1">
            <ShieldCheck size={13} /> Estimated Driver Fare Range
          </div>
          <div className="font-display font-extrabold text-xl text-white mt-0.5">
            ₹{info.minFare.toLocaleString('en-IN')} - ₹{info.maxFare.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-white/70 italic flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block flex-shrink-0" />
        {info.routeNote}
      </p>

      {/* CTA Button */}
      <button
        type="button"
        onClick={handleSearchDrivers}
        data-testid="estimator-search-drivers"
        className="mt-5 w-full py-3.5 rounded-full bg-pine hover:bg-pine-dark text-white font-extrabold flex items-center justify-center gap-2 btn-hover transition-all"
      >
        <span>Find Drivers Running This Route</span>
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
