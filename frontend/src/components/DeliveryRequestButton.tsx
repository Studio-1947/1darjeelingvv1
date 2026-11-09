import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Package, Plus, X, CircleNotch as Loader2, Check } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

/**
 * Board, Restaurant / Cafe: "Asking for home delivery". Pick items from the menu (or a shop's
 * goods), say where, and the place answers in the app. Only shown where home delivery is on.
 */
export default function DeliveryRequestButton({ listing }: { listing: any }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const menu: { name: string; price?: number }[] = useMemo(() => {
    const e = listing?.extras || {};
    const list = e.menu || e.goods || e.meals || [];
    return (Array.isArray(list) ? list : []).filter((m: any) => m?.name).map((m: any) => ({ name: m.name, price: Number(m.price) || undefined }));
  }, [listing]);

  if (!listing?.extras?.home_delivery) return null;
  const picked = Object.entries(qty).filter(([, n]) => n > 0);
  const total = picked.reduce((a, [name, n]) => a + (menu.find((m) => m.name === name)?.price || 0) * n, 0);

  const start = () => {
    if (!user) { nav(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
    setOpen(true);
  };
  const send = async () => {
    if (!picked.length) { toast.error(menu.length ? t('ui.deliveryRequestButton.pick_item') : t('ui.deliveryRequestButton.write_what')); return; }
    if (address.trim().length < 8) { toast.error(t('ui.deliveryRequestButton.address_error')); return; }
    setBusy(true);
    try {
      await api.post('/deliveries', {
        listing_id: listing.id,
        items: picked.map(([name, n]) => ({ name, qty: n, price: menu.find((m) => m.name === name)?.price })),
        address: address.trim(), phone: phone.trim() || undefined, note: note.trim(),
      });
      setSent(true);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || t('ui.deliveryRequestButton.send_error'));
    } finally {
      setBusy(false);
    }
  };
  const step = (name: string, d: number) => setQty((q) => ({ ...q, [name]: Math.max(0, Math.min(50, (q[name] || 0) + d)) }));

  return (
    <>
      <button type="button" onClick={start} data-testid="delivery-request-open"
        className="inline-flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#1F6656] text-white font-bold text-[13px] btn-hover">
        <Package size={15} /> {t('ui.deliveryRequestButton.open_cta')}
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={t('ui.deliveryRequestButton.dialog_label')} data-testid="delivery-request">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full sm:max-w-lg max-h-[90dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-extrabold text-xl text-ink">{t('ui.deliveryRequestButton.title', { title: listing.title })}</h2>
              <button onClick={() => setOpen(false)} aria-label={t('common.close')} className="w-9 h-9 grid place-items-center rounded-full hover:bg-mist"><X size={18} /></button>
            </div>
            {sent ? (
              <div className="py-6 text-center" data-testid="delivery-request-sent">
                <span className="mx-auto w-12 h-12 rounded-full bg-pine/10 text-pine grid place-items-center"><Check size={24} weight="bold" /></span>
                <p className="mt-3 font-bold text-ink">{t('ui.deliveryRequestButton.sent_title')}</p>
                <p className="text-sm text-ink-soft mt-1">{t('ui.deliveryRequestButton.sent_body', { title: listing.title })}</p>
                <button onClick={() => { setOpen(false); nav('/my-trips'); }} className="mt-4 inline-flex h-10 px-5 items-center rounded-full bg-[#1F6656] text-white font-bold text-sm">{t('ui.deliveryRequestButton.see_requests')}</button>
              </div>
            ) : (
              <>
                {menu.length ? (
                  <ul className="mt-3 divide-y divide-[var(--line)]">
                    {menu.map((m) => (
                      <li key={m.name} className="flex items-center gap-3 py-2">
                        <span className="flex-1 min-w-0 text-sm text-ink">{m.name}{m.price ? <span className="text-ink-soft"> · ₹{m.price}</span> : null}</span>
                        <button type="button" onClick={() => step(m.name, -1)} aria-label={t('ui.deliveryRequestButton.fewer', { name: m.name })} className="w-8 h-8 rounded-full border border-[var(--line)] grid place-items-center"><Minus size={13} /></button>
                        <span className="w-6 text-center font-bold tabular-nums">{qty[m.name] || 0}</span>
                        <button type="button" onClick={() => step(m.name, 1)} aria-label={t('ui.deliveryRequestButton.more', { name: m.name })} data-testid={`delivery-plus-${m.name}`} className="w-8 h-8 rounded-full border border-[var(--line)] grid place-items-center"><Plus size={13} /></button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-ink-soft">{t('ui.deliveryRequestButton.no_menu')}</p>
                )}
                {!menu.length && (
                  <input onChange={(e) => setQty(e.target.value.trim() ? { [e.target.value.trim()]: 1 } : {})} placeholder={t('ui.deliveryRequestButton.what_ph')}
                    className="mt-2 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-sm outline-none focus:border-pine" />
                )}
                <label className="block mt-4 text-xs font-bold uppercase tracking-wider text-ink-soft">{t('ui.deliveryRequestButton.deliver_to')}</label>
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={300} placeholder={t('ui.deliveryRequestButton.address_ph')} data-testid="delivery-address"
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-sm outline-none focus:border-pine" />
                <label className="block mt-3 text-xs font-bold uppercase tracking-wider text-ink-soft">{t('ui.deliveryRequestButton.phone_label')}</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder={user?.phone || ''}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-sm outline-none focus:border-pine" />
                <label className="block mt-3 text-xs font-bold uppercase tracking-wider text-ink-soft">{t('ui.deliveryRequestButton.note_label')}</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t('ui.deliveryRequestButton.note_ph')}
                  className="mt-1 w-full px-3.5 py-2.5 rounded-xl border border-[var(--line)] text-sm outline-none focus:border-pine" />
                {total > 0 && <p className="mt-3 text-sm text-ink">{t('ui.deliveryRequestButton.about_total', { amount: total.toLocaleString('en-IN') })}</p>}
                <button type="button" onClick={send} disabled={busy} data-testid="delivery-request-send"
                  className="mt-4 w-full inline-flex items-center justify-center gap-2 h-[50px] rounded-full bg-[#1F6656] text-white font-bold text-[15px] disabled:opacity-60">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : null} {t('ui.deliveryRequestButton.send')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
