import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Car, Clock, ShieldCheck, Mountains as Mountain, Info } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Box, Button, Option, SelectField, Status } from '@/components/ag';

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
  'Siliguri Junction (Tenzing Norgay Stand)->Ghum Junction & Monastery': { distanceKm: 55, durationHours: 2.3, minFare: 2400, maxFare: 4000, hatchbackFare: 2400, suvFare: 3700, routeNote: 'Hill Cart Road climb to Ghum Monastery (2,258m)', terrainDifficulty: 'Winding Mountain' },
  'Siliguri Junction (Tenzing Norgay Stand)->Kalimpong Motor Stand': { distanceKm: 65, durationHours: 2.4, minFare: 2600, maxFare: 4300, hatchbackFare: 2600, suvFare: 4000, routeNote: 'Coronation Bridge & NH10 Teesta Corridor', terrainDifficulty: 'Moderate Hill' },
  'Siliguri Junction (Tenzing Norgay Stand)->Kurseong Motor Stand': { distanceKm: 36, durationHours: 1.5, minFare: 1900, maxFare: 3500, hatchbackFare: 1900, suvFare: 3200, routeNote: 'Direct Hill Cart Road climb', terrainDifficulty: 'Steep Ascent' },
  'Siliguri Junction (Tenzing Norgay Stand)->Mirik Lake & Simana Border': { distanceKm: 46, durationHours: 1.8, minFare: 2100, maxFare: 3800, hatchbackFare: 2100, suvFare: 3400, routeNote: 'Dudhia River bridge & Mechi Valley route', terrainDifficulty: 'Moderate Hill' },

  // Darjeeling & Ghum
  'Darjeeling Town (Chowk Bazaar / Clubside)->Ghum Junction & Monastery': { distanceKm: 7, durationHours: 0.3, minFare: 400, maxFare: 800, hatchbackFare: 400, suvFare: 700, routeNote: 'Local ridge road via Batasia Loop', terrainDifficulty: 'Moderate Hill' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Kalimpong Motor Stand': { distanceKm: 50, durationHours: 2.2, minFare: 2500, maxFare: 4200, hatchbackFare: 2500, suvFare: 3800, routeNote: 'Peshok Tea Garden viewpoint & Teesta Confluence', terrainDifficulty: 'Winding Mountain' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Kurseong Motor Stand': { distanceKm: 31, durationHours: 1.3, minFare: 1800, maxFare: 3400, hatchbackFare: 1800, suvFare: 3000, routeNote: 'Hill Cart Road via Batasia Loop & Ghum', terrainDifficulty: 'Moderate Hill' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Mirik Lake & Simana Border': { distanceKm: 49, durationHours: 2.1, minFare: 2300, maxFare: 4000, hatchbackFare: 2300, suvFare: 3600, routeNote: 'Indo-Nepal border road via Pashupati Market', terrainDifficulty: 'Winding Mountain' },
  'Ghum Junction & Monastery->Kalimpong Motor Stand': { distanceKm: 52, durationHours: 2.1, minFare: 2400, maxFare: 4100, hatchbackFare: 2400, suvFare: 3700, routeNote: 'Peshok Road via 6th Mile & Teesta Bridge', terrainDifficulty: 'Winding Mountain' },
  'Ghum Junction & Monastery->Kurseong Motor Stand': { distanceKm: 24, durationHours: 1.0, minFare: 1400, maxFare: 2600, hatchbackFare: 1400, suvFare: 2400, routeNote: 'Highland ridge road via Sonada & Hope Town', terrainDifficulty: 'Moderate Hill' },
  'Ghum Junction & Monastery->Mirik Lake & Simana Border': { distanceKm: 42, durationHours: 1.8, minFare: 2000, maxFare: 3600, hatchbackFare: 2000, suvFare: 3300, routeNote: 'Scenic pine forest highway via Jorepokhri & Simana', terrainDifficulty: 'Winding Mountain' },

  // Kalimpong, Kurseong, Mirik
  'Kalimpong Motor Stand->Kurseong Motor Stand': { distanceKm: 68, durationHours: 2.5, minFare: 2600, maxFare: 4300, hatchbackFare: 2600, suvFare: 3900, routeNote: 'Teesta Valley & Ghum Junction bypass', terrainDifficulty: 'Winding Mountain' },
  'Kalimpong Motor Stand->Mirik Lake & Simana Border': { distanceKm: 88, durationHours: 3.2, minFare: 3200, maxFare: 5000, hatchbackFare: 3200, suvFare: 4600, routeNote: 'Long scenic ridge highway via Peshok', terrainDifficulty: 'Winding Mountain' },
  'Kurseong Motor Stand->Mirik Lake & Simana Border': { distanceKm: 34, durationHours: 1.3, minFare: 1800, maxFare: 3300, hatchbackFare: 1800, suvFare: 3000, routeNote: 'Pine forests & Tea estates scenic road', terrainDifficulty: 'Moderate Hill' },
};

// Route notes and terrain names are shown to the traveller, so each English text maps to a
// translation key. The server's /routes/estimate answer carries the same English notes.
const NOTE_KEYS: Record<string, string> = {
  'Scenic climb via Rohini Road & Ghum Hill Pass': 'ui.routeEstimator.notes.bagdogra_darjeeling',
  'Direct climb to highest railway elevation (2,258m)': 'ui.routeEstimator.notes.bagdogra_ghum',
  'River Teesta highway via Sevoke Coronation Bridge': 'ui.routeEstimator.notes.bagdogra_kalimpong',
  'Direct climb via Pankhabari / Rohini Road': 'ui.routeEstimator.notes.bagdogra_kurseong',
  'Smooth Tea Garden highway via Dudhia & Mirik Lake': 'ui.routeEstimator.notes.bagdogra_mirik',
  'Bypass Highway via Fulbari / Mahananda': 'ui.routeEstimator.notes.bagdogra_njp',
  'City Corridor via Matigara & Hill Cart Road': 'ui.routeEstimator.notes.bagdogra_siliguri',
  'Parallels historic DHR Toy Train tracks via Sonada': 'ui.routeEstimator.notes.njp_darjeeling',
  'Hill Cart Road climb via Kurseong & Sonada': 'ui.routeEstimator.notes.njp_ghum',
  'Teesta Valley highway via Sevoke Forest Sanctuary': 'ui.routeEstimator.notes.njp_kalimpong',
  'Giddapahar Pine forest bypass': 'ui.routeEstimator.notes.njp_kurseong',
  'Tea estate route via Simana Viewpoint': 'ui.routeEstimator.notes.njp_mirik',
  'City arterial route along Hill Cart Road': 'ui.routeEstimator.notes.njp_siliguri',
  'Hill Cart Road via Sukna Forest & Tindharia': 'ui.routeEstimator.notes.siliguri_darjeeling',
  'Hill Cart Road climb to Ghum Monastery (2,258m)': 'ui.routeEstimator.notes.siliguri_ghum',
  'Coronation Bridge & NH10 Teesta Corridor': 'ui.routeEstimator.notes.siliguri_kalimpong',
  'Direct Hill Cart Road climb': 'ui.routeEstimator.notes.siliguri_kurseong',
  'Dudhia River bridge & Mechi Valley route': 'ui.routeEstimator.notes.siliguri_mirik',
  'Local ridge road via Batasia Loop': 'ui.routeEstimator.notes.darjeeling_ghum',
  'Peshok Tea Garden viewpoint & Teesta Confluence': 'ui.routeEstimator.notes.darjeeling_kalimpong',
  'Hill Cart Road via Batasia Loop & Ghum': 'ui.routeEstimator.notes.darjeeling_kurseong',
  'Indo-Nepal border road via Pashupati Market': 'ui.routeEstimator.notes.darjeeling_mirik',
  'Peshok Road via 6th Mile & Teesta Bridge': 'ui.routeEstimator.notes.ghum_kalimpong',
  'Highland ridge road via Sonada & Hope Town': 'ui.routeEstimator.notes.ghum_kurseong',
  'Scenic pine forest highway via Jorepokhri & Simana': 'ui.routeEstimator.notes.ghum_mirik',
  'Teesta Valley & Ghum Junction bypass': 'ui.routeEstimator.notes.kalimpong_kurseong',
  'Long scenic ridge highway via Peshok': 'ui.routeEstimator.notes.kalimpong_mirik',
  'Pine forests & Tea estates scenic road': 'ui.routeEstimator.notes.kurseong_mirik',
  'Same pickup and drop location selected': 'ui.routeEstimator.notes.same_location',
  'Scenic mountain highway route': 'ui.routeEstimator.notes.default',
};

const TERRAIN_KEYS: Record<string, string> = {
  'Easy Plain': 'ui.routeEstimator.terrain.easy_plain',
  'Moderate Hill': 'ui.routeEstimator.terrain.moderate_hill',
  'Winding Mountain': 'ui.routeEstimator.terrain.winding_mountain',
  'Steep Ascent': 'ui.routeEstimator.terrain.steep_ascent',
};

function normalizeHub(s: string): string {
  const lower = s.toLowerCase();
  if (lower.includes('bagdogra')) return 'bagdogra';
  if (lower.includes('njp')) return 'njp';
  if (lower.includes('siliguri')) return 'siliguri';
  if (lower.includes('darjeeling')) return 'darjeeling';
  if (lower.includes('ghum')) return 'ghum';
  if (lower.includes('kalimpong')) return 'kalimpong';
  if (lower.includes('kurseong')) return 'kurseong';
  if (lower.includes('mirik')) return 'mirik';
  return lower;
}

function getRouteInfo(fromLoc: string, toLoc: string): RouteDetail {
  const normF = normalizeHub(fromLoc);
  const normT = normalizeHub(toLoc);

  if (normF === normT) {
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

  const matchedKey = Object.keys(ROUTE_DATA).find((k) => {
    const [kF, kT] = k.split('->');
    const normKF = normalizeHub(kF);
    const normKT = normalizeHub(kT);
    return (normKF === normF && normKT === normT) || (normKF === normT && normKT === normF);
  });

  const hit = matchedKey ? ROUTE_DATA[matchedKey] : null;
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
    // Always instantly set synchronous route detail for immediate responsiveness
    const localInfo = getRouteInfo(fromHub, toHub);
    setRouteInfo(localInfo);

    api
      .get('/routes/estimate', { params: { from: fromHub, to: toHub } })
      .then((r) => {
        if (!cancelled && r.data && typeof r.data.distanceKm === 'number') {
          setRouteInfo(r.data);
        }
      })
      .catch(() => {
        if (!cancelled) setRouteInfo(localInfo);
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
    <Box data-testid="route-estimator">
      <div className="flex items-start gap-3">
        <span className="ag-micon" aria-hidden="true"><Car /></span>
        <div className="min-w-0 flex-1">
          <span className="ag-eyebrow block">{t('estimator.tag', 'TRANSIT & REFERENCE FARES')}</span>
          <h3>{t('estimator.title', 'Darjeeling Route & Driver Fare Guide')}</h3>
        </div>
      </div>
      <Status tone="info" className="self-start">
        {info.driverCount ? t('ui.routeEstimator.drivers_available_n', { n: info.driverCount }) : t('ui.routeEstimator.drivers_available')}
      </Status>

      <SelectField label={t('estimator.from', 'Pickup Location')} value={fromHub} onChange={(e) => handleFromChange(e.target.value)}>
        {HUBS.map((h) => <option key={h} value={h}>{h}</option>)}
      </SelectField>
      <SelectField label={t('estimator.to', 'Drop Destination')} value={toHub} onChange={(e) => handleToChange(e.target.value)}>
        {HUBS.map((h) => <option key={h} value={h}>{h}</option>)}
      </SelectField>

      <dl className="m-0 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-[var(--warmline)] bg-[var(--surface)] p-3">
          <dt className="ag-small">{t('ui.routeEstimator.distance')}</dt>
          <dd className="ag-price m-0">{info.distanceKm} <span className="unit">{t('ui.routeEstimator.unit_km')}</span></dd>
        </div>
        <div className="rounded-2xl border border-[var(--warmline)] bg-[var(--surface)] p-3">
          <dt className="ag-small flex items-center gap-1"><Clock size={14} className="text-[var(--r)]" aria-hidden="true" /> {t('ui.routeEstimator.travel_time')}</dt>
          <dd className="ag-price m-0">{info.durationHours} <span className="unit">{t('ui.routeEstimator.unit_hrs')}</span></dd>
        </div>
        <div className="col-span-2 rounded-2xl border border-[var(--warmline)] bg-[var(--surface)] p-3">
          <dt className="ag-small flex flex-wrap items-center justify-between gap-x-3">
            <span className="flex items-center gap-1"><ShieldCheck size={14} className="text-[var(--r)]" aria-hidden="true" /> {t('ui.routeEstimator.fare_range')}</span>
            <span className="flex items-center gap-1"><Mountain size={14} aria-hidden="true" /> {TERRAIN_KEYS[info.terrainDifficulty] ? t(TERRAIN_KEYS[info.terrainDifficulty]) : info.terrainDifficulty}</span>
          </dt>
          <dd className="ag-price m-0">₹{info.minFare.toLocaleString('en-IN')} - ₹{info.maxFare.toLocaleString('en-IN')}</dd>
        </div>
      </dl>

      <div className="ag-pick">
        <Option on={vehicleType === 'hatchback'} onClick={() => setVehicleType('hatchback')}
          title={t('ui.routeEstimator.hatchback')} sub={t('ui.routeEstimator.ref_fare', { amount: info.hatchbackFare.toLocaleString('en-IN') })} />
        <Option on={vehicleType === 'suv'} onClick={() => setVehicleType('suv')}
          title={t('ui.routeEstimator.suv')} sub={t('ui.routeEstimator.ref_fare', { amount: info.suvFare.toLocaleString('en-IN') })} />
      </div>

      <p className="ag-small m-0">{NOTE_KEYS[info.routeNote] ? t(NOTE_KEYS[info.routeNote]) : info.routeNote}</p>
      <p className="ag-small m-0 flex items-start gap-2">
        <Info size={18} className="mt-0.5 flex-none text-[var(--r)]" aria-hidden="true" />
        <span><b className="font-medium text-[var(--ink-strong)]">{t('ui.routeEstimator.notice_title')}</b> {t('ui.routeEstimator.notice_body')}</span>
      </p>

      <Button go block onClick={handleSearchDrivers} data-testid="estimator-search-drivers">
        {selectedFare > 0
          ? t('ui.routeEstimator.find_drivers_fare', { amount: selectedFare.toLocaleString('en-IN') })
          : t('ui.routeEstimator.find_drivers')}
      </Button>
    </Box>
  );
}
