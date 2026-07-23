import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap, Marker as LeafletMarker, LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Search, Loader2, Mountain } from 'lucide-react';
import api from '@/lib/api';

// Default centre: Darjeeling town (same anchor the read-only maps use).
const DARJEELING: [number, number] = [27.041, 88.2627];
const PICK_ZOOM = 16;

// Well-known places across the Darjeeling hills, offered as instant
// suggestions - the geocoder often can't resolve informal addresses, so owners
// can jump to the nearest landmark and drag the pin from there. Coordinates
// are approximate on purpose; the pin is the source of truth.
const LANDMARKS: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Chowrasta / The Mall, Darjeeling', lat: 27.0425, lon: 88.2663 },
  { name: 'Darjeeling Railway Station', lat: 27.0387, lon: 88.26 },
  { name: 'Chowk Bazaar, Darjeeling', lat: 27.0445, lon: 88.2635 },
  { name: 'Observatory Hill (Mahakal Temple)', lat: 27.044, lon: 88.265 },
  { name: 'Darjeeling Gymkhana Club', lat: 27.0442, lon: 88.262 },
  { name: 'Nehru Road (Glenary’s)', lat: 27.0405, lon: 88.2645 },
  { name: 'Padmaja Naidu Zoo & HMI, Jawahar Parbat', lat: 27.048, lon: 88.257 },
  { name: 'Darjeeling Ropeway, Singamari', lat: 27.058, lon: 88.256 },
  { name: 'Happy Valley Tea Estate', lat: 27.055, lon: 88.256 },
  { name: 'Lebong', lat: 27.062, lon: 88.264 },
  { name: 'Tenzing & Gombu Rock, Lebong Cart Road', lat: 27.05, lon: 88.26 },
  { name: 'Lloyd’s Botanical Garden', lat: 27.037, lon: 88.258 },
  { name: 'Dhirdham Temple', lat: 27.037, lon: 88.261 },
  { name: 'Peace Pagoda & Japanese Temple, Jalapahar', lat: 27.0333, lon: 88.2606 },
  { name: 'Lal Kothi, Jalapahar Road', lat: 27.035, lon: 88.263 },
  { name: 'Batasia Loop & War Memorial', lat: 27.0163, lon: 88.2586 },
  { name: 'Ghum Railway Station', lat: 27.0087, lon: 88.253 },
  { name: 'Ghum Monastery (Yiga Choeling)', lat: 27.006, lon: 88.254 },
  { name: 'Jorebunglow', lat: 27.006, lon: 88.26 },
  { name: 'Tiger Hill', lat: 27.0028, lon: 88.267 },
  { name: 'Rock Garden (Barbotey)', lat: 27.0, lon: 88.238 },
  { name: 'Sonada', lat: 26.98, lon: 88.229 },
  { name: 'Sukhiapokhri', lat: 26.994, lon: 88.177 },
  { name: 'Lepchajagat', lat: 27.029, lon: 88.201 },
  { name: 'Takdah', lat: 27.033, lon: 88.36 },
  { name: 'Lamahatta', lat: 27.078, lon: 88.365 },
  { name: 'Kurseong Railway Station', lat: 26.88, lon: 88.279 },
  { name: 'Mirik Lake (Sumendu)', lat: 26.887, lon: 88.187 },
];

interface SearchResult {
  display_name: string;
  lat: number;
  lon: number;
}

interface LocationPickerProps {
  initialLat?: number | null;
  initialLng?: number | null;
  onLocationSelect: (lat: number, lng: number, placeName?: string) => void;
  className?: string;
}

/** Moves the pin to wherever the owner clicks/taps on the map. */
function ClickToPlace({ onPlace }: { onPlace: (ll: LatLng) => void }) {
  useMapEvents({ click(e) { onPlace(e.latlng); } });
  return null;
}

/**
 * Map-based location picker for provider onboarding. Address geocoding is
 * unreliable for informal hill-town addresses, so the geocoder search is only
 * a shortcut to get close - the pin (drag, or tap the map) is the source of
 * truth for the exact coordinates.
 */
export default function LocationPicker({ initialLat, initialLng, onLocationSelect, className = '' }: LocationPickerProps) {
  const { t } = useTranslation();
  const hasInitial = typeof initialLat === 'number' && typeof initialLng === 'number';
  const [pos, setPos] = useState<[number, number]>(hasInitial ? [initialLat!, initialLng!] : DARJEELING);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [open, setOpen] = useState(false);

  // Curated landmarks matching the typed text; all of them while it's empty,
  // so focusing the field immediately offers places to jump to.
  const landmarkMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return LANDMARKS;
    return LANDMARKS.filter((l) => l.name.toLowerCase().includes(q));
  }, [query]);

  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  // Suppresses the debounced search when we set the input text ourselves
  // after a result is picked - otherwise the dropdown immediately reopens.
  const pickedRef = useRef(false);

  const place = (lat: number, lng: number, recenter = false, placeName?: string) => {
    setPos([lat, lng]);
    onLocationSelect(lat, lng, placeName);
    if (recenter) mapRef.current?.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), PICK_ZOOM));
  };

  // Debounced geocoder search, proxied through the backend.
  useEffect(() => {
    if (pickedRef.current) { pickedRef.current = false; return; }
    const q = query.trim();
    setSearchMsg('');
    if (q.length < 3) { setResults([]); setSearching(false); return; }

    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/geocode/search', { params: { q } });
        setResults(data.results || []);
        if (!data.results?.length) setSearchMsg(t('locationPicker.no_results'));
      } catch {
        setResults([]);
        setSearchMsg(t('locationPicker.search_failed'));
      } finally {
        setSearching(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [query, t]);

  const pickResult = (r: SearchResult) => {
    pickedRef.current = true;
    setQuery(r.display_name);
    setResults([]);
    setOpen(false);
    place(r.lat, r.lon, true, r.display_name);
  };

  return (
    <div className={className}>
      {/* Address search (approximate - the pin is what gets saved) */}
      <div className="relative">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={t('locationPicker.search_placeholder')}
            data-testid="location-search"
            className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm"
          />
          {searching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft animate-spin" />}
        </div>
        {open && (landmarkMatches.length > 0 || results.length > 0) && (
          <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-xl border border-[var(--line)] bg-white shadow-lg">
            {landmarkMatches.length > 0 && (
              <li className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-ink-soft">
                {t('locationPicker.popular')}
              </li>
            )}
            {landmarkMatches.map((l, i) => (
              <li key={l.name}>
                <button type="button" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickResult({ display_name: l.name, lat: l.lat, lon: l.lon })}
                  data-testid={`location-landmark-${i}`}
                  className="w-full flex items-start gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-mist">
                  <Mountain size={14} className="text-pine flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{l.name}</span>
                </button>
              </li>
            ))}
            {results.length > 0 && (
              <li className="px-3 pt-2.5 pb-1 text-[10px] font-bold uppercase tracking-widest text-ink-soft border-t border-[var(--line)]">
                {t('locationPicker.results')}
              </li>
            )}
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lon},${i}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickResult(r)} data-testid={`location-result-${i}`}
                  className="w-full flex items-start gap-2 px-3 py-2.5 text-left text-sm text-ink hover:bg-mist">
                  <MapPin size={14} className="text-pine flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchMsg && landmarkMatches.length === 0 && <p className="mt-1 text-xs text-ink-soft">{searchMsg}</p>}
      </div>

      {/* Map - z-0 stacking context so Leaflet's controls stay under the site header */}
      <div className="relative z-0 mt-3 rounded-2xl border border-[var(--line)] overflow-hidden">
        <MapContainer
          ref={mapRef}
          center={pos}
          zoom={hasInitial ? PICK_ZOOM : 13}
          scrollWheelZoom={false}
          className="w-full h-64 md:h-80"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPlace={(ll) => place(ll.lat, ll.lng)} />
          <Marker
            position={pos}
            draggable
            ref={markerRef}
            eventHandlers={{
              dragend: () => {
                const ll = markerRef.current?.getLatLng();
                if (ll) place(ll.lat, ll.lng);
              },
            }}
          />
        </MapContainer>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-ink-soft">{t('locationPicker.hint')}</span>
        <span data-testid="location-readout" className="flex-shrink-0 font-mono font-semibold text-pine">
          {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
        </span>
      </div>
    </div>
  );
}
