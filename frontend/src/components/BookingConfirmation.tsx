import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ag/Icon';
import { Box, Button, ButtonA, ButtonLink } from '@/components/ag';
import Sheet from '@/components/listing-detail/Sheet';

/**
 * Booking / provider registration confirmation modal.
 * Shows details for both sides: tourist sees provider contact, provider sees business active.
 */
export default function BookingConfirmation({ open, onClose, mode = 'booking', data = {} as any, onView }: { open: boolean, onClose: () => void, mode?: string, data?: any, onView?: () => void }) {
  const { t } = useTranslation();
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
    <Sheet onClose={onClose} labelledBy="confirm-title" testid="booking-confirmation-modal" closeTestid="confirm-close">
      <div className="ag-done !py-2">
        <span className="big"><Icon name="check" /></span>
        <div className="flex flex-col gap-1">
          <span className="ag-eyebrow">{isBooking ? t('bc.booking_confirmed') : t('bc.youre_live')}</span>
          <h2 id="confirm-title" className="!text-[22px] !leading-7">{isBooking ? t('bc.trip_locked') : t('bc.welcome')}</h2>
        </div>
        <p className="ag-small !text-[var(--ink7)]">
          {isBooking
            ? t('bc.booking_note', {
                type: t(`categories.${listing.type}`, { defaultValue: listing.type || '' }),
                title: listing.title || '',
              })
            : t('bc.provider_note')}
        </p>
      </div>

      {isBooking && (
        <>
          {/* Listing summary */}
          <div className="flex gap-3">
            <div className="w-16 h-16 rounded-[14px] overflow-hidden bg-[var(--creme2)] flex-none">
              {listing.image && <img src={listing.image} alt="" className="w-full h-full object-cover" />}
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="ag-lead truncate">{listing.title}</span>
              <span className="ag-small !text-[13px] inline-flex items-center gap-1"><Icon name="pin" size={14} className="text-[var(--r)]" /> {listing.location}</span>
              {booking.check_in && (
                <span className="ag-small !text-[13px] inline-flex items-center gap-1">
                  <Icon name="t_trip" size={14} className="text-[var(--r)]" /> {booking.check_in}{booking.check_out ? ` → ${booking.check_out}` : ''}
                </span>
              )}
              <span className="ag-small !text-[13px] inline-flex items-center gap-1"><Icon name="person" size={14} className="text-[var(--r)]" /> {t('bc.guests', { count: booking.guests || 1 })}</span>
            </div>
          </div>

          {/* Booking id */}
          <Box flat className="!flex-row !items-center justify-between !py-3 !bg-[var(--surface)]">
            <div className="min-w-0">
              <span className="ag-eyebrow block">{t('bc.booking_id')}</span>
              <span className="tabular-nums text-[13px] text-[var(--ink-strong)]">{(booking.id || '').slice(0, 12)}…</span>
            </div>
            <Button variant="text" onClick={copyId} data-testid="copy-booking-id">{t('saved.copy')}</Button>
          </Box>

          {/* Provider contact */}
          {(provider.business_name || provider.name) && (
            <Box flat className="!bg-[var(--surface)]">
              <div className="flex flex-col gap-0.5">
                <span className="ag-eyebrow">{t('bc.your_host')}</span>
                <span className="ag-lead">{provider.business_name || provider.name}</span>
                {providerPhone && <span className="ag-small">{providerPhone}</span>}
              </div>
              {providerPhone && (
                <div className="ag-row">
                  <ButtonA size="sm" href={`tel:${providerPhone}`} data-testid="confirm-call" icon={<Icon name="phone" />}>{t('bc.call_host')}</ButtonA>
                  {/* WhatsApp keeps its own green. */}
                  <ButtonA size="sm" href={`https://wa.me/${providerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(t('bc.wa_message', { title: listing.title || '', id: booking.id }))}`}
                    target="_blank" rel="noreferrer" data-testid="confirm-wa" icon={<Icon name="wa" />}>
                    {t('contact.whatsapp')}
                  </ButtonA>
                </div>
              )}
            </Box>
          )}
        </>
      )}

      {!isBooking && (
        <>
          <Box flat className="!bg-[var(--surface)] !gap-1">
            <span className="ag-lead !text-[20px]">{data.business_name}</span>
            <span className="ag-small">{[t(`categories.${data.business_type}`, { defaultValue: data.business_type || '' }), data.location].filter(Boolean).join(' · ')}</span>
          </Box>
          <p className="ag-small">
            {t('bc.provider_body', { type: t(`categories.${data.business_type}`, { defaultValue: data.business_type || '' }) })}
          </p>
        </>
      )}

      <div className="ag-stack">
        {onView && (
          <Button variant="primary" go block onClick={onView} data-testid="confirm-view" data-autofocus>
            {isBooking ? t('bc.view_bookings', 'View in My Trips') : t('bc.go_dashboard')}
          </Button>
        )}
        {isBooking && (
          <div className="grid grid-cols-2 gap-2">
            <ButtonLink size="sm" go to="/spots" onClick={onClose} data-testid="confirm-explore-spots" icon={<Icon name="mountain" />}>
              {t('ui.bookingConfirmation.explore_spots')}
            </ButtonLink>
            <ButtonLink size="sm" go to="/drivers" onClick={onClose} data-testid="confirm-find-drivers" icon={<Icon name="car" />}>
              {t('ui.bookingConfirmation.find_drivers')}
            </ButtonLink>
          </div>
        )}
      </div>
    </Sheet>
  );
}
