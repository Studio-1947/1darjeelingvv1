import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api, { payWithRazorpay } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { MapPin, Tag, ArrowLeft } from 'lucide-react';

export default function ListingDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ check_in: '', check_out: '', guests: 1, notes: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get(`/listings/${id}`).then((r) => setItem(r.data.item)).finally(() => setLoading(false));
  }, [id]);

  const bookable = item && (item.type === 'homestay' || item.type === 'driver');

  const doBook = async () => {
    if (!user) { nav('/login?next=' + encodeURIComponent(`/listing/${id}`)); return; }
    setBusy(true); setMsg('');
    try {
      const { data } = await api.post('/bookings', {
        listing_id: item.id,
        listing_type: item.type,
        check_in: form.check_in || null,
        check_out: form.check_out || null,
        guests: Number(form.guests) || 1,
        notes: form.notes,
      });
      await payWithRazorpay({
        flow: 'booking_commission',
        reference_id: data.booking.id,
        description: `₹1 platform fee — ${item.title}`,
        prefill: { contact: user.phone, name: user.name },
      });
      setMsg(t('booking.success'));
      setTimeout(() => nav('/'), 1200);
    } catch (e) {
      setMsg(e?.response?.data?.detail || e.message || 'Failed');
    } finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto max-w-5xl p-10 text-ink-soft">{t('common.loading')}</div>;
  if (!item) return <div className="mx-auto max-w-5xl p-10">Not found.</div>;

  const unit = item.type === 'homestay' ? t('common.per_night') : item.type === 'driver' ? t('common.per_day') : '';

  return (
    <div className="mx-auto max-w-6xl px-5 md:px-8 py-8">
      <button onClick={() => nav(-1)} data-testid="detail-back" className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft mb-4">
        <ArrowLeft size={16} /> {t('common.back')}
      </button>

      <div className="grid lg:grid-cols-5 gap-8">
        <div className="lg:col-span-3">
          <div className="rounded-3xl overflow-hidden bg-mist aspect-[4/3]">
            {item.image && <img src={item.image} alt={item.title} className="w-full h-full object-cover" />}
          </div>
          <div className="mt-6">
            <span className="chip capitalize">{t(`categories.${item.type}`)}</span>
            <h1 className="mt-3 font-display font-extrabold text-3xl md:text-5xl text-ink" data-testid="listing-title">{item.title}</h1>
            <p className="mt-2 text-ink-soft flex items-center gap-1"><MapPin size={14} /> {item.location}</p>
            <p className="mt-5 text-ink leading-relaxed">{item.description}</p>
            {item.tags?.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {item.tags.map((tg) => <span key={tg} className="chip"><Tag size={11} className="mr-1" /> {tg}</span>)}
              </div>
            )}
          </div>
        </div>

        <aside className="lg:col-span-2">
          <div className="mist-panel p-6 md:p-7 sticky top-24">
            {item.price > 0 && (
              <div className="mb-4">
                <div className="text-xs uppercase tracking-widest text-ink-soft">{t('common.starting_from')}</div>
                <div className="font-display font-extrabold text-4xl text-ink">₹{item.price}<span className="text-lg text-ink-soft font-semibold">{unit}</span></div>
              </div>
            )}

            {bookable ? (
              <div className="space-y-3">
                {item.type === 'homestay' && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-semibold text-ink-soft">{t('booking.checkin')}</span>
                      <input type="date" value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })}
                        data-testid="booking-checkin" className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-ink-soft">{t('booking.checkout')}</span>
                      <input type="date" value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })}
                        data-testid="booking-checkout" className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] outline-none" />
                    </label>
                  </div>
                )}
                <label className="block">
                  <span className="text-xs font-semibold text-ink-soft">{t('booking.guests')}</span>
                  <input type="number" min="1" value={form.guests} onChange={(e) => setForm({ ...form, guests: e.target.value })}
                    data-testid="booking-guests" className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-ink-soft">{t('booking.notes')}</span>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    data-testid="booking-notes" rows="3" className="mt-1 w-full px-3 py-2 rounded-xl border border-[var(--line)] outline-none" />
                </label>

                <p className="text-xs text-ink-soft">{t('booking.fee_note')}</p>
                <button onClick={doBook} disabled={busy} data-testid="booking-submit"
                  className="w-full py-3 rounded-full bg-pine text-white font-bold btn-hover disabled:opacity-60">
                  {busy ? t('common.loading') : t('booking.pay_confirm')}
                </button>
                {msg && <p data-testid="booking-msg" className="text-sm text-center mt-2 text-pine font-semibold">{msg}</p>}
              </div>
            ) : (
              <div className="text-sm text-ink-soft">
                {item.type === 'event' || item.type === 'biodiversity' || item.type === 'spot'
                  ? 'This entry is informational. Visit responsibly.'
                  : 'Contact the seller through the location details above.'}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
