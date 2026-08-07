import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Car, Navigation, Clock, ShieldCheck, ArrowRight, MapPin, Zap, Mountain } from 'lucide-react';
import api from '@/lib/api';

export interface RouteDetail {
  distanceKm: number;
  durationHours: number;
  minFare: number;
  maxFare: number;
  hatchbackFare: number;
  suvFare: number;
  routeNote: string;
  terrainDifficulty: 'Easy Plain' | 'Moderate Hill' | 'Winding Mountain' | 'Steep Ascent';
  driverCount?: number;
}

const HUBS = [
  'Bagdogra Airport (IXB)',
  'NJP Railway Station',
  'Siliguri Junction (Tenzing Norgay Stand)',
  'Darjeeling Town (Chowk Bazaar / Clubside)',
  'Ghum Junction & Monastery',
  'Kalimpong Motor Stand',
  'Kurseong Motor Stand',
  'Mirik Lake & Simana Border',
];

const ROUTE_DATA: Record<string, Omit<RouteDetail, 'driverCount'>> = {
  // Bagdogra Airport (IXB)
  'Bagdogra Airport (IXB)->Darjeeling Town (Chowk Bazaar / Clubside)': { distanceKm: 68, durationHours: 3.0, minFare: 2800, maxFare: 4500, hatchbackFare: 2800, suvFare: 4200, routeNote: 'Scenic climb via Rohini Road & Ghum Hill Pass', terrainDifficulty: 'Winding Mountain' },
  'Bagdogra Airport (IXB)->Ghum Junction & Monastery': { distanceKm: 62, durationHours: 2.7, minFare: 2600, maxFare: 4200, hatchbackFare: 2600, suvFare: 4000, routeNote: 'Direct climb to highest railway elevation (2,258m)', terrainDifficulty: 'Winding Mountain' },
  'Bagdogra Airport (IXB)->Kalimpong Motor Stand': { distanceKm: 76, durationHours: 2.8, minFare: 2900, maxFare: 4800, hatchbackFare: 2900, suvFare: 4400, routeNote: 'River Teesta highway via Sevoke Coronation Bridge', terrainDifficulty: 'Moderate Hill' },
  'Bagdogra Airport (IXB)->Kurseong Motor Stand': { distanceKm: 42, durationHours: 1.8, minFare: 2200, maxFare: 4000, hatchbackFare: 2200, suvFare: 3600, routeNote: 'Direct climb via Pankhabari / Rohini Road', terrainDifficulty: 'Steep Ascent' },
  'Bagdogra Airport (IXB)->Mirik Lake & Simana Border': { distanceKm: 53, durationHours: 2.2, minFare: 2400, maxFare: 4200, hatchbackFare: 2400, suvFare: 3800, routeNote: 'Smooth Tea Garden highway via Dudhia & Mirik Lake', terrainDifficulty: 'Moderate Hill' },
  'Bagdogra Airport (IXB)->NJP Railway Station': { distanceKm: 16, durationHours: 0.6, minFare: 800, maxFare: 1400, hatchbackFare: 800, suvFare: 1300, routeNote: 'Bypass Highway via Fulbari / Mahananda', terrainDifficulty: 'Easy Plain' },
  'Bagdogra Airport (IXB)->Siliguri Junction (Tenzing Norgay Stand)': { distanceKm: 14, durationHours: 0.5, minFare: 700, maxFare: 1200, hatchbackFare: 700, suvFare: 1100, routeNote: 'City Corridor via Matigara & Hill Cart Road', terrainDifficulty: 'Easy Plain' },

  // NJP Railway Station
  'NJP Railway Station->Darjeeling Town (Chowk Bazaar / Clubside)': { distanceKm: 71, durationHours: 3.2, minFare: 2800, maxFare: 4600, hatchbackFare: 2800, suvFare: 4300, routeNote: 'Parallels historic DHR Toy Train tracks via Sonada', terrainDifficulty: 'Winding Mountain' },
  'NJP Railway Station->Ghum Junction & Monastery': { distanceKm: 65, durationHours: 2.9, minFare: 2700, maxFare: 4400, hatchbackFare: 2700, suvFare: 4100, routeNote: 'Hill Cart Road climb via Kurseong & Sonada', terrainDifficulty: 'Winding Mountain' },
  'NJP Railway Station->Kalimpong Motor Stand': { distanceKm: 73, durationHours: 2.8, minFare: 2800, maxFare: 4800, hatchbackFare: 2800, suvFare: 4400, routeNote: 'Teesta Valley highway via Sevoke Forest Sanctuary', terrainDifficulty: 'Moderate Hill' },
  'NJP Railway Station->Kurseong Motor Stand': { distanceKm: 45, durationHours: 2.0, minFare: 2200, maxFare: 4200, hatchbackFare: 2200, suvFare: 3700, routeNote: 'Giddapahar Pine forest bypass', terrainDifficulty: 'Steep Ascent' },
  'NJP Railway Station->Mirik Lake & Simana Border': { distanceKm: 56, durationHours: 2.2, minFare: 2500, maxFare: 4500, hatchbackFare: 2500, suvFare: 3900, routeNote: 'Tea estate route via Simana Viewpoint', terrainDifficulty: 'Moderate Hill' },
  'NJP Railway Station->Siliguri Junction (Tenzing Norgay Stand)': { distanceKm: 8, durationHours: 0.3, minFare: 400, maxFare: 800, hatchbackFare: 400, suvFare: 700, routeNote: 'City arterial route along Hill Cart Road', terrainDifficulty: 'Easy Plain' },

  // Siliguri Junction (Tenzing Norgay Stand)
  'Siliguri Junction (Tenzing Norgay Stand)->Darjeeling Town (Chowk Bazaar / Clubside)': { distanceKm: 62, durationHours: 2.5, minFare: 2500, maxFare: 4200, hatchbackFare: 2500, suvFare: 3900, routeNote: 'Hill Cart Road via Sukna Forest & Tindharia', terrainDifficulty: 'Winding Mountain' },
  'Siliguri Junction (Tenzing Norgay Stand)->Kalimpong Motor Stand': { distanceKm: 65, durationHours: 2.4, minFare: 2600, maxFare: 4300, hatchbackFare: 2600, suvFare: 4000, routeNote: 'Coronation Bridge & NH10 Teesta Corridor', terrainDifficulty: 'Moderate Hill' },
  'Siliguri Junction (Tenzing Norgay Stand)->Kurseong Motor Stand': { distanceKm: 36, durationHours: 1.5, minFare: 1900, maxFare: 3500, hatchbackFare: 1900, suvFare: 3200, routeNote: 'Direct Hill Cart Road climb', terrainDifficulty: 'Steep Ascent' },
  'Siliguri Junction (Tenzing Norgay Stand)->Mirik Lake & Simana Border': { distanceKm: 46, durationHours: 1.8, minFare: 2100, maxFare: 3800, hatchbackFare: 2100, suvFare: 3400, routeNote: 'Dudhia River bridge & Mechi Valley route', terrainDifficulty: 'Moderate Hill' },

  // Darjeeling & Ghum
  'Darjeeling Town (Chowk Bazaar / Clubside)->Ghum Junction & Monastery': { distanceKm: 7, durationHours: 0.3, minFare: 400, maxFare: 800, hatchbackFare: 400, suvFare: 700, routeNote: 'Local ridge road via Batasia Loop', terrainDifficulty: 'Moderate Hill' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Kalimpong Motor Stand': { distanceKm: 50, durationHours: 2.2, minFare: 2500, maxFare: 4200, hatchbackFare: 2500, suvFare: 3800, routeNote: 'Peshok Tea Garden viewpoint & Teesta Confluence', terrainDifficulty: 'Winding Mountain' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Kurseong Motor Stand': { distanceKm: 31, durationHours: 1.3, minFare: 1800, maxFare: 3400, hatchbackFare: 1800, suvFare: 3000, routeNote: 'Hill Cart Road via Batasia Loop & Ghum', terrainDifficulty: 'Moderate Hill' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Mirik Lake & Simana Border': { distanceKm: 49, durationHours: 2.1, minFare: 2300, maxFare: 4000, hatchbackFare: 2300, suvFare: 3600, routeNote: 'Indo-Nepal border road via Pashupati Market', terrainDifficulty: 'Winding Mountain' },

  // Kalimpong, Kurseong, Mirik
  'Kalimpong Motor Stand->Kurseong Motor Stand': { distanceKm: 68, durationHours: 2.5, minFare: 2600, maxFare: 4300, hatchbackFare: 2600, suvFare: 3900, routeNote: 'Teesta Valley & Ghum Junction bypass', terrainDifficulty: 'Winding Mountain' },
  'Kalimpong Motor Stand->Mirik Lake & Simana Border': { distanceKm: 88, durationHours: 3.2, minFare: 3200, maxFare: 5000, hatchbackFare: 3200, suvFare: 4600, routeNote: 'Long scenic ridge highway via Peshok', terrainDifficulty: 'Winding Mountain' },
  'Kurseong Motor Stand->Mirik Lake & Simana Border': { distanceKm: 34, durationHours: 1.3, minFare: 1800, maxFare: 3300, hatchbackFare: 1800, suvFare: 3000, routeNote: 'Pine forests & Tea estates scenic road', terrainDifficulty: 'Moderate Hill' },
};

function getRouteInfo(fromLoc: string, toLoc: string): RouteDetail {
  if (fromLoc === toLoc) {
    return {
      distanceKm: 0,
      durationHours: 0,
      minFare: 0,
      maxFare: 0,
      hatchbackFare: 0,
      suvFare: 0,
      routeNote: 'Same pickup and drop location selected',
      terrainDifficulty: 'Easy Plain',
      driverCount: 0,
    };
  }
  const directKey = `${fromLoc}->${toLoc}`;
  const reverseKey = `${toLoc}->${fromLoc}`;
  const hit = ROUTE_DATA[directKey] || ROUTE_DATA[reverseKey];
  if (hit) return { ...hit, driverCount: 4 };
  return {
    distanceKm: 55,
    durationHours: 2.3,
    minFare: 2500,
    maxFare: 4200,
    hatchbackFare: 2500,
    suvFare: 3800,
    routeNote: 'Scenic mountain highway route',
    terrainDifficulty: 'Winding Mountain',
    driverCount: 4,
  };
}

export default function RouteEstimator() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [fromHub, setFromHub] = useState('Bagdogra Airport (IXB)');
  const [toHub, setToHub] = useState('Darjeeling Town (Chowk Bazaar / Clubside)');
  const [vehicleType, setVehicleType] = useState<'hatchback' | 'suv'>('hatchback');
  const [routeInfo, setRouteInfo] = useState<RouteDetail>(() => getRouteInfo('Bagdogra Airport (IXB)', 'Darjeeling Town (Chowk Bazaar / Clubside)'));

  const handleFromChange = (newFrom: string) => {
    setFromHub(newFrom);
    setRouteInfo(getRouteInfo(newFrom, toHub));
  };

  const handleToChange = (newTo: string) => {
    setToHub(newTo);
    setRouteInfo(getRouteInfo(fromHub, newTo));
  };

  useEffect(() => {
    let cancelled = false;
    api
      .get('/routes/estimate', { params: { from: fromHub, to: toHub } })
      .then((r) => {
        if (!cancelled && r.data) {
          setRouteInfo(r.data);
        }
      })
      .catch(() => {
        if (!cancelled) setRouteInfo(getRouteInfo(fromHub, toHub));
      });
    return () => {
      cancelled = true;
    };
  }, [fromHub, toHub]);

  const info = routeInfo;
  const selectedFare = vehicleType === 'suv' ? info.suvFare : info.hatchbackFare;

  const handleSearchDrivers = () => {
    const fromName = fromHub.split(' ')[0];
    const toName = toHub.split(' ')[0];
    nav(`/search?from=${encodeURIComponent(fromName)}&to=${encodeURIComponent(toName)}&type=driver&cab=${vehicleType}`);
  };

  return (
    <div
      data-testid="route-estimator"
      className="relative bg-gradient-to-br from-[#14201A] to-[#1F332A] rounded-3xl p-5 md:p-8 text-white border border-white/15 shadow-2xl border-light"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
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

        {/* Driver availability badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gold/20 border border-gold/40 text-gold text-xs font-extrabold">
          <Zap size={14} className="animate-pulse" />
          <span>{info.driverCount ? `${info.driverCount} Verified Drivers Ready` : 'Drivers Available'}</span>
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
              onChange={(e) => handleFromChange(e.target.value)}
              className="w-full bg-transparent outline-none text-white cursor-pointer truncate"
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
              onChange={(e) => handleToChange(e.target.value)}
              className="w-full bg-transparent outline-none text-white cursor-pointer truncate"
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
          <div className="text-[10px] font-bold text-gold uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1"><ShieldCheck size={13} /> Estimated Fare Range</span>
            <span className="text-[10px] text-white/60 font-semibold flex items-center gap-1">
              <Mountain size={11} /> {info.terrainDifficulty}
            </span>
          </div>
          <div className="font-display font-extrabold text-xl text-white mt-1">
            ₹{info.minFare.toLocaleString('en-IN')} - ₹{info.maxFare.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Interactive Vehicle Selection Chips */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <button
          type="button"
          onClick={() => setVehicleType('hatchback')}
          className={`px-3 py-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
            vehicleType === 'hatchback'
              ? 'bg-white text-ink border-white font-extrabold shadow-md scale-[1.02]'
              : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
          }`}
        >
          <span>Hatchback / Sedan (Dzire)</span>
          <span className="font-bold">₹{info.hatchbackFare.toLocaleString('en-IN')}</span>
        </button>

        <button
          type="button"
          onClick={() => setVehicleType('suv')}
          className={`px-3 py-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
            vehicleType === 'suv'
              ? 'bg-gold text-ink border-gold font-extrabold shadow-md scale-[1.02]'
              : 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
          }`}
        >
          <span>SUV (Innova / Bolero)</span>
          <span className="font-bold">₹{info.suvFare.toLocaleString('en-IN')}</span>
        </button>
      </div>

      <p className="mt-3 text-xs text-white/70 italic flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block flex-shrink-0" />
        {info.routeNote}
      </p>

      {/* Dynamic CTA Button */}
      <button
        type="button"
        onClick={handleSearchDrivers}
        data-testid="estimator-search-drivers"
        className="mt-5 w-full py-3.5 rounded-full bg-pine hover:bg-pine-dark text-white font-extrabold flex items-center justify-center gap-2 btn-hover transition-all"
      >
        <span>
          {selectedFare > 0
            ? `Book ${vehicleType === 'suv' ? 'Mountain SUV' : 'Hatchback Cab'} (₹${selectedFare.toLocaleString('en-IN')})`
            : 'Find Drivers Running This Route'}
        </span>
        <ArrowRight size={18} />
      </button>
    </div>
  );
}
