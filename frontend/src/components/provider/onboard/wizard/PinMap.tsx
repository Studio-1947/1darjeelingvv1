import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import type { Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@/lib/leafletIconFix';

const ZOOM = 17;

/** Recentres when the place is picked again (GPS, a chip, a search result) - not on every pin drag. */
function Recentre({ lat, lng, focus }: { lat: number; lng: number; focus: number }) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    map.flyTo([lat, lng], Math.max(map.getZoom(), ZOOM), { duration: 0.6 });
    // Only `focus` decides when to move the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);
  return null;
}

function TapToPlace({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({ click(e) { onMove(e.latlng.lat, e.latlng.lng); } });
  return null;
}

/**
 * The host's exact spot on a map: drag the pin or tap the map to move it. A GPS fix also shows
 * its accuracy as a faint circle, so a weak fix is obvious and easy to correct.
 * Lazy-loaded by the wizard, so Leaflet only downloads once a place is chosen.
 */
export default function PinMap({ lat, lng, accuracy, focus, onMove }: {
  lat: number; lng: number; accuracy?: number; focus: number; onMove: (lat: number, lng: number) => void;
}) {
  const marker = useRef<LeafletMarker | null>(null);
  return (
    // z-0: its own stacking context, so Leaflet's panes stay under the site header.
    <div className="relative z-0 overflow-hidden rounded-[var(--r-card)] border border-[var(--warmline)]" data-testid="wz-pin-map">
      <MapContainer center={[lat, lng]} zoom={ZOOM} scrollWheelZoom={false} className="h-56 w-full sm:h-64">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Recentre lat={lat} lng={lng} focus={focus} />
        <TapToPlace onMove={onMove} />
        {accuracy != null && accuracy > 0 && (
          <Circle center={[lat, lng]} radius={accuracy} pathOptions={{ className: 'ag-onboard-acc', weight: 1, fillOpacity: 0.1 }} />
        )}
        <Marker position={[lat, lng]} draggable ref={marker}
          eventHandlers={{ dragend: () => { const ll = marker.current?.getLatLng(); if (ll) onMove(ll.lat, ll.lng); } }} />
      </MapContainer>
    </div>
  );
}
