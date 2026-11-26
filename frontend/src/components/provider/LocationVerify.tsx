import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, SealCheck } from '@phosphor-icons/react';
import { Button, FieldError, TextField } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { readPhoneLocation, verifyListingLocation, type ListingLocation, type PhoneFix } from '@/lib/kyc';

type Stamp = { verified_at?: string; source?: string; gps_gap_m?: number } | null | undefined;

/**
 * Confirm where ONE listing is (decision 2026-11-26: each listing verifies on its own), by its
 * Google Maps link, the phone's location, or both. Phones are often a few hundred metres off in the
 * hills, so with both the link sets the spot and the phone only confirms the host is there; a phone
 * that disagrees never fails the check (backend lib/locationCheck.ts).
 */
export default function LocationVerify({ listingId, stamp, onVerified }: {
  listingId: string;
  /** The listing's extras.location_verified, when it has one. */
  stamp: Stamp;
  onVerified: (loc: ListingLocation) => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [fix, setFix] = useState<PhoneFix | null>(null);
  const [busy, setBusy] = useState<'gps' | 'verify' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const useMine = async () => {
    setErr(null);
    setBusy('gps');
    try { setFix(await readPhoneLocation()); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const verify = async () => {
    setErr(null);
    setNote(null);
    setBusy('verify');
    try {
      const loc = await verifyListingLocation(listingId, { mapsUrl: url, fix });
      // The phone was far from the link's pin: say the link was used, so the host can check it.
      if (loc.gps_gap_m !== undefined && loc.source === 'google_maps_link') {
        setNote(t('lv.far', { km: (loc.gps_gap_m / 1000).toFixed(1), defaultValue: 'Your phone was {{km}} km from the Google Maps pin, so we used the link. Check the pin is your place.' }));
      }
      setUrl('');
      setFix(null);
      onVerified(loc);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const how = stamp?.source === 'live_capture' ? t('lv.by_phone', 'your phone’s location')
    : stamp?.source === 'maps_link_on_site' ? t('lv.by_both', 'its Google Maps link and your phone')
      : t('lv.by_link', 'its Google Maps link');
  const when = stamp?.verified_at ? new Date(stamp.verified_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return (
    <div className="grid gap-3" data-testid="listing-location">
      {stamp?.verified_at ? (
        <p className="flex items-start gap-2 text-sm text-[var(--ink-strong)]" data-testid="listing-location-verified">
          <SealCheck size={18} weight="fill" className="mt-0.5 flex-none text-[var(--ok)]" aria-hidden="true" />
          <span>{t('lv.verified', { how, when, defaultValue: 'Verified by {{how}} on {{when}}. Verify again if the place moved.' })}</span>
        </p>
      ) : (
        <p className="ag-small">{t('lv.intro', 'Paste this place’s Google Maps link, use your location while you are there, or both. With both, the link sets the exact spot.')}</p>
      )}
      <TextField label={t('lv.link', 'Google Maps link')} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://maps.app.goo.gl/..."
        inputMode="url" hint={t('kyc.mapsLinkHelp')} data-testid="listing-location-url" />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<Icon name="locate" />} onClick={useMine} disabled={!!busy} data-testid="listing-location-gps">
          {busy === 'gps' ? t('kyc.locationChecking') : fix ? t('lv.again', 'Read my location again') : t('lv.mine', 'Use my location')}
        </Button>
        {fix && (
          <span className="ag-small" data-testid="listing-location-fix">
            {t('lv.got', { m: Math.round(fix.accuracy), defaultValue: 'Got your location (within {{m}} m)' })}
          </span>
        )}
      </div>
      <Button variant="primary" size="sm" className="self-start" icon={<MapPin />} onClick={verify}
        disabled={!!busy || (!url.trim() && !fix)} data-testid="listing-location-verify">
        {busy === 'verify' ? t('kyc.locationChecking') : t('lv.verify', 'Verify this place')}
      </Button>
      {note && <p className="ag-small" role="status" data-testid="listing-location-note">{note}</p>}
      <FieldError id="listing-location-error">{err}</FieldError>
    </div>
  );
}
