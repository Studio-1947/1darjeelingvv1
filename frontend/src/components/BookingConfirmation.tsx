import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MapPin, Calendar, Users, Phone, MessageCircle, ArrowRight, X, Copy, ExternalLink } from 'lucide-react';

/**
 * Booking / provider registration confirmation modal.
 * Shows details for both sides: tourist sees provider contact, provider sees business active.
 */
export default function BookingConfirmation({ open, onClose, mode = 'booking', data = {} as any, onView }: { open: boolean, onClose: () => void, mode?: string, data?: any, onView?: () => void }) {
  if (!open) return null;

  const isBooking = mode === 'booking';
  const booking = data || {};
  const listing = booking.listing || {};
  const provider = booking.provider || {};
  const providerPhone = provider.contact_phone || provider.phone || '';

  const copyId = async () => {
    try { await navigator.clipboard.writeText(data.id || ''); } catch (e) { console.warn('copy failed', e); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog" aria-modal="true" data-testid="booking-confirmation-modal">
      <div className="bg-white w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl overflow-hidden animate-fade-up max-h-[90svh] flex flex-col">
        {/* Success header */}
        <div className="relative bg-gradient-to-br from-pine to-pine-dark text-white px-5 pt-6 pb-8 flex-shrink-0">
          <button onClick={onClose} data-testid="confirm-close" className="absolute top-4 right-4 p-1.5 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur">
            <X size={16} />
          </button>
          <div className="w-14 h-14 rounded-full bg-white/20 grid place-items-center backdrop-blur mb-3">
            <CheckCircle2 size={30} className="text-white" />
          </div>
          <div className="text-[11px] uppercase tracking-widest opacity-90 font-bold">{isBooking ? 'Booking confirmed' : 'You’re live!'}</div>
          <h2 className="mt-1 font-display font-extrabold text-3xl leading-tight">
            {isBooking ? `Trip locked in` : `Welcome to 1 Darjeeling`}
          </h2>
          <p className="mt-1 text-sm text-white/90">
            {isBooking
              ? `Your ${listing.type || 'booking'} at ${listing.title || 'the property'} is confirmed. The host has been notified.`
              : `Your business is now listed and searchable by travellers.`}
          </p>
        </div>

        {/* Body */}
        <div className="p-5 md:p-6 space-y-4 overflow-y-auto">
          {isBooking && (
            <>
              {/* Listing summary */}
              <div className="flex gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-mist flex-shrink-0">
                  {listing.image && <img src={listing.image} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-ink line-clamp-1">{listing.title}</div>
                  <div className="text-xs text-ink-soft flex items-center gap-1 mt-0.5"><MapPin size={11} /> {listing.location}</div>
                  {booking.check_in && (
                    <div className="text-xs text-ink-soft flex items-center gap-1 mt-0.5">
                      <Calendar size={11} /> {booking.check_in}{booking.check_out ? ` → ${booking.check_out}` : ''}
                    </div>
                  )}
                  <div className="text-xs text-ink-soft flex items-center gap-1 mt-0.5"><Users size={11} /> {booking.guests || 1} guest(s)</div>
                </div>
              </div>

              {/* Booking id */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-mist">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-soft font-bold">Booking ID</div>
                  <div className="font-mono text-xs text-ink mt-0.5">{(booking.id || '').slice(0, 12)}…</div>
                </div>
                <button onClick={copyId} data-testid="copy-booking-id" className="text-xs font-bold text-pine inline-flex items-center gap-1"><Copy size={12} /> Copy</button>
              </div>

              {/* Provider contact */}
              {(provider.business_name || provider.name) && (
                <div className="p-3 rounded-xl border border-[var(--line)]">
                  <div className="text-[10px] uppercase tracking-widest text-ink-soft font-bold">Your host</div>
                  <div className="mt-1 font-display font-bold text-ink">{provider.business_name || provider.name}</div>
                  {providerPhone && <div className="text-xs text-ink-soft">{providerPhone}</div>}
                  {providerPhone && (
                    <div className="mt-2 flex gap-2">
                      <a href={`tel:${providerPhone}`} data-testid="confirm-call"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-pine text-white font-bold text-xs btn-hover">
                        <Phone size={12} /> Call host
                      </a>
                      <a href={`https://wa.me/${providerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi! I just booked ${listing.title || 'your listing'} on 1 Darjeeling. Booking ID: ${booking.id}`)}`}
                        target="_blank" rel="noreferrer" data-testid="confirm-wa"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#25D366] text-white font-bold text-xs btn-hover">
                        <MessageCircle size={12} /> WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {!isBooking && (
            <>
              <div className="p-4 rounded-2xl bg-mist">
                <div className="font-display font-extrabold text-2xl text-ink">{data.business_name}</div>
                <div className="text-sm text-ink-soft capitalize">{data.business_type} · {data.location}</div>
              </div>
              <p className="text-sm text-ink-soft">
                Tourists can now discover you in the {data.business_type || 'listings'} category. You&apos;ll receive bookings in your dashboard.
              </p>
            </>
          )}

          {/* CTA row */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            {onView && (
              <button onClick={onView} data-testid="confirm-view"
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full bg-flag text-white font-extrabold btn-hover">
                {isBooking ? 'View my bookings' : 'Go to dashboard'} <ArrowRight size={16} />
              </button>
            )}
            {isBooking && listing.id && (
              <Link to={`/listing/${listing.id}`} data-testid="confirm-view-listing"
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-full bg-white border border-[var(--line)] text-ink font-bold btn-hover">
                View listing <ExternalLink size={14} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
