import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Sheet, { SheetHead } from '@/components/listing-detail/Sheet';
import { Button, FieldError, Option, TextArea } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { formatTripDates } from '@/lib/dates';

/** Why a traveller cancels, and why a host cancels or declines (server lib/bookingDetails.ts, prototype cancel.js). */
export const GUEST_REASONS = ['plans_changed', 'found_other', 'price_details', 'host_not_responding', 'weather_road', 'other'] as const;
export const HOST_REASONS = ['fully_booked', 'not_available', 'family_health', 'weather_road', 'other'] as const;

const REASON_EN: Record<string, string> = {
  plans_changed: 'My plans changed',
  found_other: 'Found another place or ride',
  price_details: 'Price or details not right',
  host_not_responding: 'Host is not responding',
  weather_road: 'Weather or road problem',
  other: 'Something else',
  fully_booked: 'Fully booked for these dates',
  not_available: 'Car or home not available',
  family_health: 'Family or health reason',
  no_show: 'The guest did not come',
  not_confirmed: 'Not confirmed in time',
};

export const reasonLabel = (t: TFunction, code?: string | null) =>
  code ? String(t(`cancel.r.${code}`, REASON_EN[code] || code)) : '';

/** "Reason: My plans changed · the note" (prototype cxText). */
export function reasonLine(t: TFunction, reason?: string | null, note?: string | null) {
  const r = reasonLabel(t, reason);
  if (!r && !note) return '';
  return `${t('cancel.reason', 'Reason')}: ${[r, note].filter(Boolean).join(' · ')}`;
}

/** Under 24 hours before the trip starts (server isLateCancel, prototype isLate). */
export function isLate(b: { check_in?: string | null; pickup_time?: string | null }, now = new Date()) {
  if (!b.check_in) return false;
  const time = b.pickup_time && /^\d{2}:\d{2}$/.test(b.pickup_time) ? b.pickup_time : '00:00';
  const start = Date.parse(`${b.check_in.slice(0, 10)}T${time}:00+05:30`);
  return !Number.isNaN(start) && start - now.getTime() < 86_400_000;
}

export type CancelMode = 'guest_withdraw' | 'guest_cancel' | 'guest_request' | 'host_decline' | 'host_cancel';

/**
 * The cancel sheet (prototype cancel.js cxSheet): pick a reason, add a note, read what happens
 * next, then cancel, decline or send the request. `onSubmit` does the call; its error shows here.
 */
export default function CancelSheet({ booking: b, mode, onSubmit, onClose, submitTestId, infoTestId }: {
  booking: any;
  mode: CancelMode;
  /** The screens' own test ids for the go button and the "what happens" line. */
  submitTestId?: string;
  infoTestId?: string;
  onSubmit: (reason: string, note: string) => Promise<void>;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const host = mode === 'host_decline' || mode === 'host_cancel';
  const reasons = host ? HOST_REASONS : GUEST_REASONS;
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const late = (mode === 'guest_request' || mode === 'guest_cancel') && isLate(b);

  const title = mode === 'host_decline' ? t('cancel.h_decline', 'Why are you declining?')
    : mode === 'host_cancel' ? t('cancel.h_host', 'Why are you cancelling this booking?')
    : t('cancel.h_guest', 'Why are you cancelling?');
  const info = mode === 'host_decline' ? t('cancel.i_decline', 'The traveller will see your reason and can book someone else.')
    : mode === 'host_cancel' ? t('cancel.i_host', 'The traveller will be told your reason.')
    : mode === 'guest_withdraw' ? t('cancel.i_pre', 'The host has not said yes yet, so your request is simply withdrawn. Nothing is charged.')
    : mode === 'guest_cancel' ? t('cancel.i_accepted', 'Nothing is paid yet, so this cancels at once at no charge. The host will be told.')
    : t('cancel.i_post', 'The host has already kept this for you. They will be asked to accept the cancellation. Talk to them first if you can.');
  const go = mode === 'host_decline' ? t('cancel.do_decline', 'Decline request')
    : mode === 'guest_request' ? t('cancel.do_send', 'Send cancellation request')
    : t('ui.trips.cx_go', 'Cancel booking');

  const submit = async () => {
    if (!reason) { setErr(t('cancel.pick', 'Please choose a reason.')); return; }
    setErr('');
    setBusy(true);
    try {
      await onSubmit(reason, note.trim());
    } catch (e: any) {
      setErr(e?.response?.data?.detail || e?.message || t('cancel.failed', 'That did not work. Try again.'));
      setBusy(false);
    }
  };

  const name = b.listing?.title || b.listing_title;
  return (
    <Sheet onClose={onClose} labelledBy="cx-title" testid={`cancel-sheet-${b.id}`} closeTestid="cancel-sheet-close">
      <SheetHead id="cx-title" title={title}>
        <p className="ag-small m-0">{name}{b.check_in ? ` · ${formatTripDates(b.check_in, b.check_out, i18n.language)}` : ''}</p>
      </SheetHead>
      <div className="ag-pick ag-cx-reasons" role="group" aria-label={title}>
        {reasons.map((r) => (
          <Option key={r} on={reason === r} title={reasonLabel(t, r)} data-testid={`cancel-reason-${r}`}
            onClick={() => { setReason(r); setErr(''); }} />
        ))}
      </div>
      <TextArea id={`cx-note-${b.id}`} label={t('cancel.note', 'Add a note (optional)')} rows={2} maxLength={200}
        value={note} onChange={(e) => setNote(e.target.value)} data-testid="cancel-note" />
      <p className={`ag-cx-info${late ? ' warn' : ''}`} data-testid={infoTestId || 'cancel-info'}>
        <Icon name={late ? 'bell' : 'check'} />
        <span>
          {info}
          {late && <><br /><b>{t('cancel.late', 'This is within 24 hours of the date, so it counts as a late cancellation. Hosts can see it.')}</b></>}
        </span>
      </p>
      <FieldError id="cx-err">{err}</FieldError>
      <div className="ag-cx-btns">
        <Button variant="stop" onClick={submit} disabled={busy} data-testid={submitTestId || 'cancel-submit'}>{busy ? t('common.loading') : go}</Button>
        <Button onClick={onClose} disabled={busy} data-testid="cancel-keep">{t('ui.trips.cx_keep', 'Keep booking')}</Button>
      </div>
    </Sheet>
  );
}
