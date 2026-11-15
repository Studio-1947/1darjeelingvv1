import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash, UserPlus, Crown, Clock } from '@phosphor-icons/react';
import api from '@/lib/api';
import { Box, Button, FieldError, IconButton, TextField } from '@/components/ag';

/**
 * The board's "Multiple Owners": who runs this business. The main owner adds a co-owner by phone
 * number; that person signs in with their own WhatsApp code and runs the same business. Only the
 * main owner adds or removes owners (and pays for the plan); a co-owner can leave. Backed by
 * GET/POST/DELETE /providers/me/owners. The app has the same section (src/provider/OwnersCard.tsx).
 */

type Owner = { id: string; name: string | null; phone: string; joined: boolean; role: 'owner' | 'co_owner'; you?: boolean };

/** "+919800033344" → "+91 98000 33344", the way people read Indian mobile numbers. */
const NBSP = '\u00a0'; // keeps the number on one line
const prettyPhone = (p: string) => (/^\+91\d{10}$/.test(p) ? `+91${NBSP}${p.slice(3, 8)}${NBSP}${p.slice(8)}` : p);

export default function OwnersSection({ onLeft }: { onLeft?: () => void }) {
  const { t } = useTranslation();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [access, setAccess] = useState<'owner' | 'co_owner'>('owner');
  const [max, setMax] = useState(5);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Which row is asking "Remove?" (or 'leave'), confirmed inline rather than with a browser pop-up.
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    api.get('/providers/me/owners')
      .then((r) => { setOwners(r.data.owners || []); setAccess(r.data.access); setMax(r.data.max_co_owners || 5); })
      .catch(() => setOwners([]));
  }, []);

  const coOwners = owners.filter((o) => o.role === 'co_owner');
  const isMain = access === 'owner';

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/providers/me/owners', { phone: phone.trim(), name: name.trim() });
      setOwners(data.owners);
      setPhone('');
      setName('');
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('owners.add_failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (o: Owner) => {
    const self = !isMain;
    setConfirming(null);
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.delete(`/providers/me/owners/${o.id}`);
      if (self) { onLeft?.(); return; }
      setOwners(data.owners);
    } catch (err: any) {
      setError(err?.response?.data?.detail || t('owners.remove_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box as="section" data-testid="profile-owners">
      <div>
        <h2>{t('owners.title')}</h2>
        <p className="ag-small">{isMain ? t('owners.note_owner') : t('owners.note_co_owner')}</p>
      </div>

      <ul className="grid gap-2">
        {owners.map((o) => (
          <li key={o.id} className="flex items-center gap-3 rounded-[18px] border border-[var(--warmline)] bg-[var(--surface)] p-3" data-testid="owner-row">
            <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-[var(--r-tint)] font-medium text-[var(--r)]">
              {(o.name || '?').trim().charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate font-medium text-[var(--ink-strong)]">{o.name || o.phone}{o.you ? ` · ${t('owners.you')}` : ''}</b>
              <span className="ag-small flex items-center gap-1.5">
                {o.role === 'owner' ? <><Crown size={14} className="text-[var(--r)]" /> {t('owners.main_owner')}</>
                  : o.joined ? t('owners.co_owner') : <><Clock size={14} /> {t('owners.invited', { phone: prettyPhone(o.phone) })}</>}
              </span>
            </span>
            {o.role === 'co_owner' && isMain && confirming !== o.id && (
              <IconButton label={t('owners.remove')} onClick={() => setConfirming(o.id)} disabled={busy} data-testid="owner-remove">
                <Trash />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {confirming && confirming !== 'leave' && (
        <div className="ag-row" data-testid="owner-remove-confirm">
          <span className="text-sm text-[var(--ink-strong)]">{t('owners.remove_q')}</span>
          <Button variant="stop" size="sm" disabled={busy} onClick={() => { const o = owners.find((x) => x.id === confirming); if (o) remove(o); }}>{t('owners.remove_yes')}</Button>
          <Button size="sm" onClick={() => setConfirming(null)}>{t('owners.cancel')}</Button>
        </div>
      )}

      {isMain ? (
        coOwners.length < max ? (
          <form onSubmit={add} className="grid gap-2 sm:grid-cols-2" data-testid="owner-add">
            <TextField value={name} onChange={(e) => setName(e.target.value)} placeholder={t('owners.name_ph')} aria-label={t('owners.name_ph')} />
            <TextField value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('owners.phone_ph')} aria-label={t('owners.phone_ph')} inputMode="tel" data-testid="owner-phone" />
            <Button type="submit" size="sm" icon={<UserPlus />} className="self-start" disabled={busy || !phone.trim()} data-testid="owner-add-btn">
              {t('owners.add')}
            </Button>
          </form>
        ) : (
          <p className="ag-small">{t('owners.full', { count: max })}</p>
        )
      ) : (
        confirming === 'leave' ? (
          <Box tone="blush" flat data-testid="owner-leave-confirm">
            <p className="text-sm text-[var(--ink-strong)]">{t('owners.leave_confirm')}</p>
            <div className="ag-row">
              <Button variant="stop" size="sm" disabled={busy} onClick={() => { const me = owners.find((o) => o.you); if (me) remove(me); }}>{t('owners.leave')}</Button>
              <Button size="sm" onClick={() => setConfirming(null)}>{t('owners.cancel')}</Button>
            </div>
          </Box>
        ) : (
          <Button variant="stop" size="sm" className="self-start" disabled={busy} data-testid="owner-leave" onClick={() => setConfirming('leave')}>
            {t('owners.leave')}
          </Button>
        )
      )}
      {isMain && <p className="ag-small">{t('owners.how_it_works')}</p>}
      <FieldError id="owner-error">{error}</FieldError>
    </Box>
  );
}
