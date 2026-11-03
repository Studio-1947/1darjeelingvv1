import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash, UserPlus, Crown, Clock } from '@phosphor-icons/react';
import api from '@/lib/api';

/**
 * The board's "Multiple Owners": who runs this business. The main owner adds a co-owner by phone
 * number; that person signs in with their own WhatsApp code and runs the same business. Only the
 * main owner adds or removes owners (and pays for the plan); a co-owner can leave. Backed by
 * GET/POST/DELETE /providers/me/owners. The app has the same section (src/provider/OwnersCard.tsx).
 */

type Owner = { id: string; name: string | null; phone: string; joined: boolean; role: 'owner' | 'co_owner'; you?: boolean };

const input = 'w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] bg-white outline-none text-sm text-ink';

export default function OwnersSection({ onLeft }: { onLeft?: () => void }) {
  const { t } = useTranslation();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [access, setAccess] = useState<'owner' | 'co_owner'>('owner');
  const [max, setMax] = useState(5);
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!window.confirm(self ? t('owners.leave_confirm') : t('owners.remove_confirm', { name: o.name || o.phone }))) return;
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
    <section className="mist-panel p-5 md:p-7" data-testid="profile-owners">
      <h2 className="font-display font-extrabold text-xl md:text-2xl text-ink">{t('owners.title')}</h2>
      <p className="mt-1 text-sm text-ink-soft">{isMain ? t('owners.note_owner') : t('owners.note_co_owner')}</p>

      <ul className="mt-5 space-y-2">
        {owners.map((o) => (
          <li key={o.id} className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--line)] bg-white" data-testid="owner-row">
            <span className="w-10 h-10 rounded-full bg-pine/10 text-pine grid place-items-center font-bold flex-shrink-0">
              {(o.name || '?').trim().charAt(0).toUpperCase()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-bold text-ink truncate">{o.name || o.phone}{o.you ? ` · ${t('owners.you')}` : ''}</span>
              <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                {o.role === 'owner' ? <><Crown size={13} className="text-pine" /> {t('owners.main_owner')}</>
                  : o.joined ? t('owners.co_owner') : <><Clock size={13} /> {t('owners.invited', { phone: o.phone })}</>}
              </span>
            </span>
            {o.role === 'co_owner' && isMain && (
              <button type="button" onClick={() => remove(o)} disabled={busy} aria-label={t('owners.remove')}
                className="w-10 h-10 rounded-full grid place-items-center text-ink-soft hover:bg-mist">
                <Trash size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isMain ? (
        coOwners.length < max ? (
          <form onSubmit={add} className="mt-4 grid sm:grid-cols-[1fr_1fr_auto] gap-2" data-testid="owner-add">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('owners.name_ph')} className={input} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('owners.phone_ph')} inputMode="tel" className={input} data-testid="owner-phone" />
            <button type="submit" disabled={busy || !phone.trim()} data-testid="owner-add-btn"
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-full bg-[#1F6656] text-white text-sm font-bold btn-hover disabled:opacity-60">
              {t('owners.add')} <UserPlus size={16} />
            </button>
          </form>
        ) : (
          <p className="mt-4 text-xs text-ink-soft">{t('owners.full', { count: max })}</p>
        )
      ) : (
        <button type="button" disabled={busy} data-testid="owner-leave"
          onClick={() => { const me = owners.find((o) => o.you); if (me) remove(me); }}
          className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[var(--line)] bg-white text-sm font-bold text-flag btn-hover">
          {t('owners.leave')}
        </button>
      )}
      {isMain && <p className="mt-2 text-xs text-ink-soft">{t('owners.how_it_works')}</p>}
      {error && <p className="mt-2 text-sm font-semibold text-flag" data-testid="owner-error">{error}</p>}
    </section>
  );
}
