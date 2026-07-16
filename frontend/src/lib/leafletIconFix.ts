import L from 'leaflet';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

// Leaflet resolves its default marker images relative to the stylesheet URL,
// which breaks under webpack's hashed asset pipeline — the marker renders as a
// broken-image box. Feed it the bundled URLs instead. Import this module once
// at the app root before any map renders.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });
