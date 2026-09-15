import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass as Search, Check, Minus, Plus } from '@phosphor-icons/react';
import { todayStr, addDays, parseDate } from '@/lib/dates';
import { writeTrip } from '@/lib/tripParams';
import { PrimaryButton, Touch } from './ui';
import Slab from './Slab';
import MobileSheet from './Sheet';

// RN's exact fixed destination list (1-Darjeeling-Mobile-App/src/data/search.ts DESTINATIONS) -
// deliberately not the web's richer free-text/live-suggestion destination search, per the
// "port RN exactly" decision for this widget.
const DESTINATIONS = ['Darjeeling', 'Ghoom', 'Kurseong', 'Lebong', 'Jalapahar', 'Tiger Hill'];

const MAX_PARTY = 20;
const MAX_ROOMS = 10;

function nightsBetween(checkIn: string, checkOut: string): number {
  const a = parseDate(checkIn);
  const b = parseDate(checkOut);
  if (!a || !b) return 1;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

function nextFriday(): number {
  const day = new Date().getDay();
  return (5 - day + 7) % 7 || 7;
}

/** "2 adults · 1 child · 1 room" - matches RN's GuestPicker.tsx partyLabel exactly. */
function partyLabel(adults: number, children: number, rooms: number): string {
  const bits = [`${adults} adult${adults > 1 ? 's' : ''}`];
  if (children > 0) bits.push(`${children} child${children > 1 ? 'ren' : ''}`);
  bits.push(`${rooms} room${rooms > 1 ? 's' : ''}`);
  return bits.join(' · ');
}

type Field = 'dest' | 'dates' | 'guests' | null;

export type MobileSearchQuery = {
  dest: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
};

/**
 * Search widget, structurally matching RN's SearchWidget.tsx. Destination and
 * guests fields port RN's structure (fixed preset list; adults/children/rooms
 * steppers) exactly. The dates field uses native <input type="date"> controls
 * - the same control BookingWidget.tsx already uses - rather than RN's
 * bespoke calendar-grid picker; see the Phase 2 plan for why.
 *
 * `variant="bar"` is RN's compact results-page summary (used by
 * mobile/StaysScreen.tsx): a one-line destination/dates/guests summary that
 * expands in place into the full field set on tap, rather than a sheet -
 * matching RN's own toggle behavior.
 *
 * Without `onSearch`, submitting navigates straight to `/homestays` (Home's
 * usage, Phase 2). With `onSearch`, submitting calls it instead of
 * navigating - StaysScreen uses this to update the current page's query
 * in place.
 */
export default function MobileSearchWidget({
  variant = 'full',
  initial,
  onSearch,
}: {
  variant?: 'full' | 'bar';
  initial?: Partial<MobileSearchQuery>;
  onSearch?: (query: MobileSearchQuery) => void;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();

  const defaultCheckIn = addDays(todayStr(), 7);
  const [dest, setDest] = useState(initial?.dest ?? 'Darjeeling');
  const [checkIn, setCheckIn] = useState(initial?.checkIn || defaultCheckIn);
  const [checkOut, setCheckOut] = useState(initial?.checkOut || addDays(defaultCheckIn, 2));
  const [adults, setAdults] = useState(initial?.adults ?? 2);
  const [children, setChildren] = useState(initial?.children ?? 0);
  const [rooms, setRooms] = useState(initial?.rooms ?? 1);
  const [open, setOpen] = useState<Field>(null);
  // Bar variant: compact summary by default, expands to the full field set in
  // place on tap - matches RN's SearchWidget toggling `barOpen`, not a sheet.
  const [barOpen, setBarOpen] = useState(false);

  const nights = nightsBetween(checkIn, checkOut);
  const close = () => setOpen(null);

  const submit = () => {
    close();
    setBarOpen(false);
    if (onSearch) {
      onSearch({ dest, checkIn, checkOut, adults, children, rooms });
      return;
    }
    // rooms is UI-only: neither the booking model (Trip, in tripParams.ts) nor
    // the backend has a room-count concept, so it is never sent - carrying it
    // further would silently do nothing, which this codebase avoids.
    const params = writeTrip(new URLSearchParams({ q: dest }), {
      checkIn,
      checkOut,
      guests: adults + children,
    });
    nav(`/homestays?${params.toString()}`);
  };

  const fieldCls =
    'text-left px-3.5 py-2.5 rounded-[var(--mu-r-card-xs)] active:bg-[var(--mu-canvas)]';

  const stepper = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min: number,
    max: number,
  ) => (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm font-semibold text-[var(--mu-ink)]">{label}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={t('mobileHome.guests_less')}
          className="w-8 h-8 rounded-full border border-[var(--mu-border-strong)] flex items-center justify-center text-[var(--mu-ink)] disabled:opacity-30 active:scale-95"
        >
          <Minus size={14} />
        </button>
        <span className="w-5 text-center text-sm font-bold text-[var(--mu-ink)]">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={t('mobileHome.guests_more')}
          className="w-8 h-8 rounded-full border border-[var(--mu-border-strong)] flex items-center justify-center text-[var(--mu-ink)] disabled:opacity-30 active:scale-95"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );

  if (variant === 'bar' && !barOpen) {
    return (
      <div className="mobile-ui">
        <Touch
          onClick={() => setBarOpen(true)}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-[var(--mu-r-chip)] border border-[var(--mu-border)] bg-[var(--mu-surface)]"
          style={{ boxShadow: 'var(--mu-shadow-search)' }}
        >
          <Search size={15} className="text-[var(--mu-ink)] flex-shrink-0" />
          <div className="flex-1 min-w-0 text-left">
            <div className="text-[13.5px] font-bold text-[var(--mu-ink)] truncate">{dest}</div>
            <div className="text-[11.5px] text-[var(--mu-text-faint)] truncate">
              {checkIn} – {checkOut} · {partyLabel(adults, children, rooms)}
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-[var(--mu-r-chip)] border border-[var(--mu-green)] flex-shrink-0">
            <span className="text-xs font-bold text-[var(--mu-green)]">{t('mobileHome.search_edit')}</span>
          </span>
        </Touch>
      </div>
    );
  }

  return (
    <div className="mobile-ui">
      <div
        className="bg-[var(--mu-surface)] border border-[var(--mu-border)] rounded-[var(--mu-r-card)] p-1.5"
        style={{ boxShadow: 'var(--mu-shadow-card)' }}
      >
        <Touch onClick={() => setOpen('dest')} className={`w-full ${fieldCls}`}>
          <Slab>{t('mobileHome.search_where')}</Slab>
          <div className="mt-0.5 text-[15px] font-bold text-[var(--mu-ink)] truncate">{dest}</div>
        </Touch>

        <div className="h-px bg-[var(--mu-border)] mx-3" />

        <Touch onClick={() => setOpen('dates')} className={`w-full ${fieldCls}`}>
          <Slab>{t('mobileHome.search_when')}</Slab>
          <div className="mt-0.5 text-[15px] font-bold text-[var(--mu-ink)] truncate">
            {checkIn} – {checkOut}
          </div>
          <div className="text-xs text-[var(--mu-text-faint)]">
            {nights} {nights === 1 ? t('mobileHome.night') : t('mobileHome.nights')}
          </div>
        </Touch>

        <div className="h-px bg-[var(--mu-border)] mx-3" />

        <Touch onClick={() => setOpen('guests')} className={`w-full ${fieldCls}`}>
          <Slab>{t('mobileHome.search_who')}</Slab>
          <div className="mt-0.5 text-[15px] font-bold text-[var(--mu-ink)] truncate">
            {partyLabel(adults, children, rooms)}
          </div>
        </Touch>

        <PrimaryButton onClick={submit} className="w-full mt-1.5">
          <Search size={16} /> {t('mobileHome.search_cta')}
        </PrimaryButton>
      </div>

      <MobileSheet open={open === 'dest'} onClose={close} title={t('mobileHome.search_where')}>
        <div className="space-y-2">
          {DESTINATIONS.map((d) => {
            const active = d === dest;
            return (
              <Touch
                key={d}
                onClick={() => {
                  setDest(d);
                  close();
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-[var(--mu-r-card-xs)] border ${
                  active
                    ? 'border-[var(--mu-green)] bg-[var(--mu-green-tint)]'
                    : 'border-[var(--mu-border)] bg-[var(--mu-surface)]'
                }`}
              >
                <span className="flex-1 text-left text-sm font-semibold text-[var(--mu-ink)]">{d}</span>
                {active && <Check size={16} weight="bold" className="text-[var(--mu-green)]" />}
              </Touch>
            );
          })}
        </div>
      </MobileSheet>

      <MobileSheet
        open={open === 'dates'}
        onClose={close}
        title={t('mobileHome.search_when')}
        footer={
          <PrimaryButton onClick={close} className="w-full">
            {t('mobileHome.search_dates_done')} · {nights}{' '}
            {nights === 1 ? t('mobileHome.night') : t('mobileHome.nights')}
          </PrimaryButton>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <Slab>{t('booking.checkin')}</Slab>
            <input
              type="date"
              value={checkIn}
              min={todayStr()}
              onChange={(e) => {
                const v = e.target.value;
                setCheckIn(v);
                if (checkOut <= v) setCheckOut(addDays(v, 1));
              }}
              className="mt-1 w-full px-3 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] text-sm text-[var(--mu-ink)] outline-none"
            />
          </label>
          <label className="block">
            <Slab>{t('booking.checkout')}</Slab>
            <input
              type="date"
              value={checkOut}
              min={addDays(checkIn, 1)}
              onChange={(e) => setCheckOut(e.target.value)}
              className="mt-1 w-full px-3 py-2.5 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] text-sm text-[var(--mu-ink)] outline-none"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { label: t('mobileHome.tonight'), start: 0, len: 1 },
            { label: t('mobileHome.date_preset_weekend'), start: nextFriday(), len: 2 },
            { label: `3 ${t('mobileHome.nights')}`, start: 7, len: 3 },
          ].map((preset) => (
            <Touch
              key={preset.label}
              onClick={() => {
                const start = addDays(todayStr(), preset.start);
                setCheckIn(start);
                setCheckOut(addDays(start, preset.len));
              }}
              className="px-3.5 py-2 rounded-[var(--mu-r-chip)] border border-[var(--mu-green-tint-border)] bg-[var(--mu-green-tint)]"
            >
              <span className="text-xs font-semibold text-[var(--mu-green-deep)]">{preset.label}</span>
            </Touch>
          ))}
        </div>
      </MobileSheet>

      <MobileSheet
        open={open === 'guests'}
        onClose={close}
        title={t('mobileHome.search_who')}
        footer={
          <PrimaryButton onClick={close} className="w-full">
            {t('mobileHome.search_guests_done')}
          </PrimaryButton>
        }
      >
        <div className="divide-y divide-[var(--mu-border)]">
          {stepper(t('mobileHome.adults'), adults, setAdults, 1, MAX_PARTY)}
          {stepper(t('mobileHome.children'), children, setChildren, 0, MAX_PARTY)}
          {stepper(t('mobileHome.rooms'), rooms, setRooms, 1, MAX_ROOMS)}
        </div>
      </MobileSheet>
    </div>
  );
}
