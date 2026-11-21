import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import type { Map as LeafletMap, Marker as LeafletMarker, LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@/lib/leafletIconFix';
import { MapPin, MagnifyingGlass as Search, CircleNotch as Loader2, Mountains as Mountain, NavigationArrow } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Button } from '@/components/ag';
import { LANDMARKS, nearestAreaLabel } from '@/lib/hostQuickFill';

// Default centre: Darjeeling town (same anchor the read-only maps use).
const DARJEELING: [number, number] = [27.041, 88.2627];
const PICK_ZOOM = 16;

// Well-known places across the Darjeeling hills, offered as instant
// suggestions - the geocoder often can't resolve informal addresses, so owners
// can jump to the nearest landmark and drag the pin from there. Coordinates
// are approximate on purpose; the pin is the source of truth. Shared with the
// app (lib/hostQuickFill.ts), which also names "I am here now" from it.

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

  // "I am here now": the phone's own position, named after the nearest known place. Easiest for a
  // host standing at their own door; no typing and no map.
  const [locating, setLocating] = useState(false);
  const [hereMsg, setHereMsg] = useState('');
  const useHere = () => {
    setHereMsg('');
    if (!navigator.geolocation) { setHereMsg(t('ob.quick.no_gps')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const { latitude, longitude } = p.coords;
        const name = nearestAreaLabel(latitude, longitude);
        if (!name) { setHereMsg(t('ob.quick.outside')); return; }
        pickedRef.current = true;
        setQuery(name);
        place(latitude, longitude, true, name);
      },
      () => { setLocating(false); setHereMsg(t('ob.quick.no_gps')); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  const pickResult = (r: SearchResult) => {
    pickedRef.current = true;
    setQuery(r.display_name);
    setResults([]);
    setOpen(false);
    place(r.lat, r.lon, true, r.display_name);
  };

  return (
    <div className={className}>
      <Button block center onClick={useHere} disabled={locating} data-testid="location-here" className="mb-2"
        icon={locating ? <Loader2 className="animate-spin" /> : <NavigationArrow weight="fill" />}>
        {locating ? t('ob.quick.locating') : t('ob.quick.here_now')}
      </Button>
      {hereMsg && <p className="ag-err mb-2" role="alert" data-testid="location-here-msg">{hereMsg}</p>}

      {/* Address search (approximate - the pin is what gets saved) */}
      <div className="relative">
        <div className="relative">
          <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)]" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={t('locationPicker.search_placeholder')}
            data-testid="location-search"
            aria-label={t('locationPicker.search_placeholder')}
            className="ag-in !pl-12 !pr-12"
          />
          {searching && <Loader2 size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-[var(--ink-muted)] animate-spin" />}
        </div>
        {open && (landmarkMatches.length > 0 || results.length > 0) && (
          <ul className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-[18px] border border-[var(--hairline)] bg-[var(--surface)] shadow-lg">
            {landmarkMatches.length > 0 && (
              <li className="ag-eyebrow px-4 pt-3 pb-1">
                {t('locationPicker.popular')}
              </li>
            )}
            {landmarkMatches.map((l, i) => (
              <li key={l.name}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.preventDefault()}
                  onClick={() => pickResult({ display_name: l.name, lat: l.lat, lon: l.lon })}
                  data-testid={`location-landmark-${i}`}
                  className="w-full flex items-start gap-2 px-4 py-2.5 text-left text-sm text-[var(--ink-strong)] hover:bg-[var(--soft)]">
                  <Mountain size={16} className="text-[var(--r)] flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{l.name}</span>
                </button>
              </li>
            ))}
            {results.length > 0 && (
              <li className="ag-eyebrow px-4 pt-3 pb-1 border-t border-[var(--hairline)]">
                {t('locationPicker.results')}
              </li>
            )}
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lon},${i}`}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onTouchStart={(e) => e.preventDefault()}
                  onClick={() => pickResult(r)} data-testid={`location-result-${i}`}
                  className="w-full flex items-start gap-2 px-4 py-2.5 text-left text-sm text-[var(--ink-strong)] hover:bg-[var(--soft)]">
                  <MapPin size={16} className="text-[var(--r)] flex-shrink-0 mt-0.5" />
                  <span className="line-clamp-2">{r.display_name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {searchMsg && landmarkMatches.length === 0 && <p className="ag-small mt-1">{searchMsg}</p>}
      </div>

      {/* Map - z-0 stacking context so Leaflet's controls stay under the site header */}
      <div className="relative z-0 mt-3 rounded-[var(--r-card)] border border-[var(--warmline)] overflow-hidden">
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
        <span className="text-[var(--ink-muted)]">{t('locationPicker.hint')}</span>
        <span data-testid="location-readout" className="flex-shrink-0 tabular-nums font-medium text-[var(--r)]">
          {pos[0].toFixed(5)}, {pos[1].toFixed(5)}
        </span>
      </div>
    </div>
  );
}
