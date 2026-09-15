import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Phone, ChatCircle as MessageCircle } from '@phosphor-icons/react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { MobileScreen, Monogram, Touch } from '@/components/mobile';

/**
 * Mobile-only provider Chats screen, matching RN's chats.tsx exactly,
 * including its explicit real-data-only precedent: there is no messaging
 * backend, so the contact list is derived client-side from the same
 * GET /bookings/provider data the dashboard already fetches, grouped by
 * guest phone (most recent booking per phone), rather than any fabricated
 * inbox.
 */
export default function ProviderChats() {
  const { t } = useTranslation();
  useSeo({ title: t('mobileProviderChats.title'), noindex: true });
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login?next=/provider/chats'); return; }
    let cancelled = false;
    api.get('/bookings/provider').then((r) => {
      if (cancelled) return;
      const items: any[] = r.data.items || [];
      const byPhone = new Map<string, any>();
      for (const b of items) {
        const phone = b.customer?.phone;
        if (!phone) continue;
        const existing = byPhone.get(phone);
        if (!existing || new Date(b.created_at) > new Date(existing.created_at)) {
          byPhone.set(phone, b);
        }
      }
      const sorted = Array.from(byPhone.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setContacts(sorted);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, authLoading, nav]);

  if (authLoading || !user) return null;

  return (
    <MobileScreen tone="light" className="lg:hidden min-h-screen pb-[calc(var(--bottom-nav-h)+1rem)]">
      <div className="px-[var(--mu-gutter)] pt-7">
        <h1 className="font-[family-name:var(--mu-font-display)] font-black text-2xl text-[var(--mu-ink)] tracking-tight">
          {t('mobileProviderChats.title')}
        </h1>

        {loading ? (
          <p className="mt-6 text-sm text-[var(--mu-text-muted)]">{t('common.loading')}</p>
        ) : contacts.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--mu-text-muted)]">{t('mobileProviderChats.empty')}</p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {contacts.map((b) => (
              <div key={b.customer.phone} className="flex items-center gap-3 rounded-[var(--mu-r-card-xs)] border border-[var(--mu-border)] bg-[var(--mu-surface)] px-4 py-3">
                <Monogram label={b.customer?.name || '?'} className="w-11 h-11 text-base flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-[var(--mu-ink)] truncate">{b.customer?.name || t('pd.guest_fallback')}</div>
                  <div className="text-xs text-[var(--mu-text-muted)] truncate">{b.listing?.title || b.listing_title}</div>
                </div>
                <a
                  href={`tel:${b.customer.phone}`}
                  className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0"
                  style={{ background: 'var(--mu-green)' }}
                  aria-label={t('mobileProviderChats.call')}
                >
                  <Phone size={15} weight="bold" className="text-[var(--mu-cream)]" />
                </a>
                <a
                  href={`https://wa.me/${b.customer.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                    t('pd.wa_guest_message', { name: b.customer?.name || '', listing: b.listing?.title || '' }),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0"
                  style={{ background: '#25D366' }}
                  aria-label={t('mobileProviderChats.whatsapp')}
                >
                  <MessageCircle size={15} weight="bold" className="text-white" />
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </MobileScreen>
  );
}
