import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Chip, Chips } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import api from '@/lib/api';
import { PLACES, straightKm } from '@/lib/places';

/** A place a driver picks travellers up from (extras.areas; the server keeps 12, lib/driverMatch.ts). */
export type Area = { name: string; lat: number; lng: number };
export const MAX_AREAS = 12;

/** Known places this close to the driver's base are offered before anything is typed. */
const NEARBY_KM = 45;

type Found = { display_name: string; lat: number | string; lon: number | string };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * The places a driver picks travellers up from: known places near their base to tap, a search for
 * any other town, station or village (the backend's geocoder), and the chosen ones to remove. A ride
 * search from one of these finds the driver first (backend lib/driverMatch.ts). Their base counts
 * already, so none is required. Used by the sign-up wizard (`wizard`: its own chips and search box,
 * as on the place step) and the listing editor (the shared Chip, as AmenityPicker; the editor labels
 * the block itself).
 */
export default function AreasPicker({ areas, onChange, base, testid = 'areas', wizard = false }: {
  areas: Area[];
  onChange: (next: Area[]) => void;
  /** The driver's own pin, for the nearby suggestions. */
  base?: { lat: number; lng: number } | null;
  testid?: string;
  /** In the sign-up wizard: its chip and search styles (HostWizard PlaceStep, ExtrasStep). */
  wizard?: boolean;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Area[]>([]);
  const [looking, setLooking] = useState(false);
  const full = areas.length >= MAX_AREAS;
  const has = (name: string) => areas.some((a) => same(a.name, name));

  // Typed names: the known places straight away, then the geocoder for villages and roads.
  useEffect(() => {
    const s = q.trim();
    if (s.length < 3) { setFound([]); setLooking(false); return undefined; }
    setLooking(true);
    const id = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/geocode/search', { params: { q: s } });
        setFound((data.results || []).slice(0, 6).map((r: Found) => ({
          name: String(r.display_name).split(',').slice(0, 2).join(',').trim(), lat: Number(r.lat), lng: Number(r.lon),
        })).filter((a: Area) => a.name && Number.isFinite(a.lat) && Number.isFinite(a.lng)));
      } catch { setFound([]); } finally { setLooking(false); }
    }, 400);
    return () => window.clearTimeout(id);
  }, [q]);

  const typed = q.trim().toLowerCase();
  const known: Area[] = typed
    ? PLACES.filter((p) => p.name.toLowerCase().includes(typed) || p.keys.some((k) => k.includes(typed)))
      .map((p) => ({ name: p.name, lat: p.lat, lng: p.lng }))
    : base
      ? PLACES.map((p) => ({ name: p.name, lat: p.lat, lng: p.lng, km: straightKm(base, p) }))
        .filter((p) => p.km <= NEARBY_KM).sort((a, b) => a.km - b.km).slice(0, 10)
        .map(({ name, lat, lng }) => ({ name, lat, lng }))
      : [];
  const offers = [...known, ...found.filter((f) => !known.some((k) => same(k.name, f.name)))]
    .filter((a) => !has(a.name)).slice(0, 10);

  const add = (a: Area) => {
    if (full || has(a.name)) return;
    onChange([...areas, { name: a.name.slice(0, 80), lat: Number(a.lat.toFixed(5)), lng: Number(a.lng.toFixed(5)) }]);
    setQ('');
  };

  // One chip, in the wizard's style or the shared one. `on` chips are the chosen areas (tap removes).
  const chip = (a: Area, on: boolean, onClick: () => void, id: string, label?: string) => (wizard ? (
    <button key={`${a.name}${a.lat}`} type="button" className="ag-onboard-pchip" aria-pressed={on} onClick={onClick} aria-label={label} data-testid={id}>
      <Icon name={on ? 'check' : 'plus'} />{a.name}{on && <Icon name="close" />}
    </button>
  ) : (
    <Chip key={`${a.name}${a.lat}`} on={on} onClick={onClick} aria-label={label} data-testid={id}>
      <Icon name={on ? 'pin' : 'plus'} />{a.name}{on && <Icon name="close" />}
    </Chip>
  ));
  const row = (children: React.ReactNode) => (wizard ? <div className="ag-onboard-pchips">{children}</div> : <Chips>{children}</Chips>);
  const search = t('areas.search', 'Find a town, station or village');
  const input = (
    <input type="search" className={wizard ? undefined : 'ag-in'} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off"
      placeholder={search} aria-label={search} data-testid={`${testid}-search`} />
  );

  return (
    <div className="grid gap-3" data-testid={testid}>
      {areas.length > 0 && (
        <div className="grid gap-1.5">
          {/* The editor names the block itself; the wizard's question needs this line under it. */}
          {wizard && <span className="ag-eyebrow">{t('areas.chosen', 'Your pickup areas')}</span>}
          {row(areas.map((a) => chip(a, true, () => onChange(areas.filter((x) => x !== a)), `${testid}-chosen-${a.name}`,
            t('areas.remove', { name: a.name, defaultValue: 'Remove {{name}}' }))))}
        </div>
      )}
      {full ? (
        <p className="ag-small" role="status">{t('areas.full', { max: MAX_AREAS, defaultValue: 'That is the most a listing can have ({{max}}). Remove one to add another.' })}</p>
      ) : (
        <>
          {wizard ? <label className="ag-onboard-search"><Icon name="search" />{input}</label> : input}
          {offers.length > 0 && (
            <div className="grid gap-1.5">
              {!typed && <span className={wizard ? 'ag-eyebrow' : 'ag-small'}>{t('areas.nearby', 'Near your base')}</span>}
              {row(offers.map((a) => chip(a, false, () => add(a), `${testid}-add-${a.name}`)))}
            </div>
          )}
          {looking && <p className="ag-small">{t('common.loading')}</p>}
          {!looking && typed.length >= 3 && offers.length === 0 && <p className="ag-small">{t('ob.wz.tp_none')}</p>}
        </>
      )}
    </div>
  );
}
