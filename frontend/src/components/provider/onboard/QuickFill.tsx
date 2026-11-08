import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { WhatsappLogo } from '@phosphor-icons/react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  DESCRIPTION_CHIPS,
  PRICE_SUGGESTIONS,
  chipOn,
  helpWhatsAppLink,
  isHostType,
  toggleDescriptionChip,
  type HostType,
} from '@/lib/hostQuickFill';

/**
 * Tap-to-fill pieces of the quick host sign-up, for hosts who find typing hard. The app has the
 * same ones (src/provider/form/QuickFill.tsx); both read src/lib/hostQuickFill.ts.
 */

const chipClass = (on: boolean) =>
  `px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
    on ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-[var(--line)]'
  }`;

/** Phrases that write the description for the host. Typed words are kept. */
export function DescriptionChips({ type, text, place, onChange }: {
  type: string;
  text: string;
  place?: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  if (!isHostType(type)) return null;
  return (
    <div data-testid="description-chips">
      <span className="text-xs font-semibold text-ink-soft block mb-2">{t('ob.quick.tap_to_describe')}</span>
      <div className="flex flex-wrap gap-1.5">
        {DESCRIPTION_CHIPS[type].map((chip) => {
          const on = chipOn(text, chip);
          return (
            <button key={chip} type="button" aria-pressed={on} className={chipClass(on)}
              onClick={() => onChange(toggleDescriptionChip(text, chip, type, place))}>
              {chip}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Common prices as one-tap choices. */
export function PriceChips({ type, value, onPick }: { type: string; value?: string; onPick: (v: string) => void }) {
  const { t } = useTranslation();
  if (!isHostType(type)) return null;
  return (
    <div className="mt-3" data-testid="price-chips">
      <span className="text-xs font-semibold text-ink-soft block mb-2">{t('ob.quick.tap_price')}</span>
      <div className="flex flex-wrap gap-1.5">
        {PRICE_SUGGESTIONS[type].map((p) => {
          const on = String(p) === String(value || '').trim();
          return (
            <button key={p} type="button" aria-pressed={on} className={chipClass(on)} onClick={() => onPick(String(p))}>
              ₹{p.toLocaleString('en-IN')}
            </button>
          );
        })}
      </div>
    </div>
  );
}

let signupInfo: Promise<{ support_phone: string | null; grace_bookings: number }> | null = null;

/** The help number and the free bookings, read once per page load (GET /app/host-signup). */
export function useHostSignupInfo() {
  const [info, setInfo] = useState<{ support_phone: string | null; grace_bookings: number }>({ support_phone: null, grace_bookings: 3 });
  useEffect(() => {
    let live = true;
    signupInfo ??= api.get('/app/host-signup').then((r) => r.data).catch(() => {
      signupInfo = null;
      return { support_phone: null, grace_bookings: 3 };
    });
    signupInfo.then((d) => { if (live && d) setInfo(d); });
    return () => { live = false; };
  }, []);
  return info;
}

/** "Need help? WhatsApp us": opens a chat with the team, message written. Hidden without a number. */
export function HelpWhatsApp({ type, className = '' }: { type?: string; className?: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { support_phone } = useHostSignupInfo();
  const link = helpWhatsAppLink(support_phone, {
    type: isHostType(type) ? (type as HostType) : null,
    name: user?.name,
    phone: user?.phone,
  });
  if (!link) return null;
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" data-testid="host-help-whatsapp"
      className={`inline-flex items-center justify-center gap-2 rounded-full border border-[#25D366] text-[#128C4A] bg-white font-bold text-sm px-4 py-2.5 btn-hover ${className}`}>
      <WhatsappLogo size={18} weight="fill" className="text-[#25D366]" />
      {t('ob.quick.help')}
    </a>
  );
}
