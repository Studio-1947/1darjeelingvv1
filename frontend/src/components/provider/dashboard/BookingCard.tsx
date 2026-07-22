import React from 'react';
import { Phone, MessageCircle } from 'lucide-react';
import { StatusPill } from './widgets';

/** One booking in the provider's list: guest, dates, and contact actions. */
export default function BookingCard({ b }: { b: any }) {
  return (
    <article
      key={b.id}
      data-testid={`booking-${b.id}`}
      className="bg-white rounded-2xl border border-[var(--line)] p-4 md:p-5 flex gap-4"
    >
      <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-mist flex-shrink-0">
        {b.listing?.image && <img src={b.listing.image} alt="" className="w-full h-full object-cover" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-display font-bold text-ink text-base leading-tight line-clamp-1">{b.listing?.title || b.listing_title}</div>
            <div className="text-xs text-ink-soft mt-0.5">{b.customer?.name || 'Tourist'} · {b.customer?.phone}</div>
          </div>
          <StatusPill status={b.status} />
        </div>
        <div className="mt-2 text-xs text-ink-soft space-y-0.5">
          {b.check_in && <div>Check-in: <b className="text-ink">{b.check_in}</b>{b.check_out && <> → <b className="text-ink">{b.check_out}</b></>}</div>}
          <div>Guests: <b className="text-ink">{b.guests}</b> · Placed: {new Date(b.created_at).toLocaleDateString()}</div>
          {b.notes && <div className="italic">“{b.notes}”</div>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={`tel:${b.customer?.phone || ''}`}
            data-testid={`booking-call-${b.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pine text-white font-bold text-xs btn-hover"
          >
            <Phone size={12} /> Call
          </a>
          <a
            href={`https://wa.me/${(b.customer?.phone || '').replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${b.customer?.name || ''}, this is regarding your booking for ${b.listing?.title || ''} on 1 Darjeeling.`)}`}
            target="_blank"
            rel="noreferrer"
            data-testid={`booking-wa-${b.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366] text-white font-bold text-xs btn-hover"
          >
            <MessageCircle size={12} /> WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}
