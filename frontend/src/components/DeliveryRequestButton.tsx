import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Minus, Plus, CircleNotch as Loader2, Check } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSwitchPrompt } from '@/components/TravellerOnly';
import { Button, IconButton, TextArea, TextField } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import Sheet, { SheetHead } from '@/components/listing-detail/Sheet';

/**
 * Board, Restaurant / Cafe: "Asking for home delivery". Pick items from the menu (or a shop's
 * goods), say where, and the place answers in the app. Only shown where home delivery is on.
 */
export default function DeliveryRequestButton({ listing }: { listing: any }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  // Business mode (a host's own site page opens there too): ask to switch before the form, not after.
  const switchFirst = useSwitchPrompt();
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
    if (switchFirst('book')) return;
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
      <Button size="sm" go onClick={start} data-testid="delivery-request-open" icon={<Icon name="bag" />}>
        {t('ui.deliveryRequestButton.open_cta')}
      </Button>
      {open && (
        <Sheet onClose={() => setOpen(false)} labelledBy="delivery-title" testid="delivery-request">
          <SheetHead id="delivery-title" eyebrow={t('ui.deliveryRequestButton.dialog_label')} title={t('ui.deliveryRequestButton.title', { title: listing.title })} />
          {sent ? (
            <div className="ag-done !py-2" data-testid="delivery-request-sent">
              <span className="big"><Check weight="bold" aria-hidden="true" /></span>
              <p className="ag-lead">{t('ui.deliveryRequestButton.sent_title')}</p>
              <p className="ag-small">{t('ui.deliveryRequestButton.sent_body', { title: listing.title })}</p>
              <Button go onClick={() => { setOpen(false); nav('/my-trips'); }} data-autofocus>{t('ui.deliveryRequestButton.see_requests')}</Button>
            </div>
          ) : (
            <>
              {menu.length ? (
                <ul className="flex flex-col">
                  {menu.map((m) => (
                    <li key={m.name} className="flex items-center gap-3 py-2 border-b border-[var(--warmline)] last:border-b-0">
                      <span className="flex-1 min-w-0 text-[15px] text-[var(--ink-strong)]">
                        {m.name}{m.price ? <span className="ag-small"> · ₹{m.price}</span> : null}
                      </span>
                      <span className="inline-flex items-center gap-2">
                        <IconButton small tint label={t('ui.deliveryRequestButton.fewer', { name: m.name })} onClick={() => step(m.name, -1)}><Minus /></IconButton>
                        <span className="w-6 text-center font-medium tabular-nums">{qty[m.name] || 0}</span>
                        <IconButton small tint label={t('ui.deliveryRequestButton.more', { name: m.name })} onClick={() => step(m.name, 1)} data-testid={`delivery-plus-${m.name}`}><Plus /></IconButton>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <>
                  <p className="ag-small">{t('ui.deliveryRequestButton.no_menu')}</p>
                  <TextField aria-label={t('ui.deliveryRequestButton.what_ph')} placeholder={t('ui.deliveryRequestButton.what_ph')}
                    onChange={(e) => setQty(e.target.value.trim() ? { [e.target.value.trim()]: 1 } : {})} />
                </>
              )}
              <TextArea label={t('ui.deliveryRequestButton.deliver_to')} value={address} onChange={(e) => setAddress(e.target.value)} rows={2} maxLength={300}
                placeholder={t('ui.deliveryRequestButton.address_ph')} data-testid="delivery-address" className="[&_textarea]:!min-h-[88px]" />
              <TextField label={t('ui.deliveryRequestButton.phone_label')} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder={user?.phone || ''} />
              <TextField label={t('ui.deliveryRequestButton.note_label')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder={t('ui.deliveryRequestButton.note_ph')} />
              {total > 0 && <p className="ag-lead">{t('ui.deliveryRequestButton.about_total', { amount: total.toLocaleString('en-IN') })}</p>}
              <Button variant="primary" block center onClick={send} disabled={busy} data-testid="delivery-request-send"
                icon={busy ? <Loader2 className="animate-spin" /> : undefined}>
                {t('ui.deliveryRequestButton.send')}
              </Button>
            </>
          )}
        </Sheet>
      )}
    </>
  );
}
