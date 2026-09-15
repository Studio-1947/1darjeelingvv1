import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useSeo } from '@/components/Seo';
import { getMyProfile } from '@/lib/kyc';
import type { KycProfile } from '@/lib/kyc';
import KycSection from '@/components/provider/dashboard/KycSection';
import VerifiedBadge from '@/components/provider/VerifiedBadge';
import { MobileScreen, Monogram, Touch, MobileSheet } from '@/components/mobile';

/**
 * Mobile-only provider Account screen, matching RN's account.tsx: identity,
 * plan status (real provider.status, no invented renewal date - RN's own
 * fake renewal date is one of the fabrications this port drops, see the
 * Phase 6 plan), and rows into the real destinations already built elsewhere
 * (Refer reuses the existing role-agnostic /refer page; Verification opens
 * the same KycSection.tsx the dashboard teaser uses; My Listings/Legal are
 * existing pages). "Switch to tourist" is client-side only - this app has no
 * separate mode flag, so it's just a nav back to tourist Home.
 */
export default function ProviderAccount() {
  const { t } = useTranslation();
  useSeo({ title: t('mobileProviderAccount.title'), noindex: true });
  const { user, loading: authLoading, logout } = useAuth();
  const nav = useNavigate();

  const [provider, setProvider] = useState<any>(null);
  const [kycProfile, setKycProfile] = useState<KycProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [kycOpen, setKycOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login?next=/provider/account'); return; }
    let cancelled = false;
    Promise.all([
      api.get('/providers/me'),
      getMyProfile().catch(() => null),
    ]).then(([p, kyc]) => {
      if (cancelled) return;
      setProvider(p.data.provider);
      setKycProfile(kyc);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, authLoading, nav]);

  if (authLoading || loading || !user) {
    return <div className="lg:hidden p-10 text-center text-sm text-[var(--mu-text-muted)] mobile-ui">{t('common.loading')}</div>;
  }
  if (!provider) return null;

  const active = provider.status === 'active';
  const verified = active && kycProfile?.kyc_status === 'verified';

  return (
    <MobileScreen tone="light" className="lg:hidden min-h-screen flex flex-col pb-[calc(var(--bottom-nav-h)+1rem)]">
      <div className="flex-1 px-[var(--mu-gutter)] pt-7">
        <div className="flex items-center gap-3.5">
          <Monogram label={provider.business_name || '?'} className="w-[62px] h-[62px] text-2xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="font-[family-name:var(--mu-font-display)] font-black text-xl text-[var(--mu-ink)] truncate">
              {provider.business_name}
            </div>
            <div className="text-xs text-[var(--mu-text-muted)]">{provider.contact_phone}</div>
            {verified && <div className="mt-1"><VerifiedBadge size="sm" /></div>}
          </div>
        </div>

        <div className="mt-3.5 rounded-[var(--mu-r-card)] px-[17px] py-3.5" style={{ background: 'var(--mu-ink)' }}>
          <span className="font-[family-name:var(--mu-font-mono)] text-[10px] font-semibold uppercase tracking-wide text-[var(--mu-sage)]">
            {t('mobileProviderAccount.plan')}
          </span>
          <div className="mt-1 font-[family-name:var(--mu-font-display)] font-black text-base" style={{ color: 'var(--mu-lime)' }}>
            {active ? t('provider.active') : t('provider.pending')}
          </div>
        </div>

        <div className="mt-2.5 rounded-[var(--mu-r-card)] border border-[var(--mu-border)] bg-[var(--mu-surface)] overflow-hidden">
          <Touch onClick={() => nav('/refer')} className="w-full flex items-center px-4 py-3 border-b border-[var(--mu-border)] text-left">
            <span className="flex-1 text-sm font-semibold text-[var(--mu-ink)]">{t('mobileProviderAccount.row_refer')}</span>
            <span className="text-xs text-[var(--mu-text-faint)]">›</span>
          </Touch>
          <Touch onClick={() => setKycOpen(true)} className="w-full flex items-center px-4 py-3 border-b border-[var(--mu-border)] text-left">
            <span className="flex-1 text-sm font-semibold text-[var(--mu-ink)]">{t('mobileProviderAccount.row_verification')}</span>
            <span className="text-xs text-[var(--mu-text-faint)]">
              {kycProfile ? `${Math.round(kycProfile.completion_percent || 0)}% ›` : '›'}
            </span>
          </Touch>
          <Touch onClick={() => nav('/my-listings')} className="w-full flex items-center px-4 py-3 border-b border-[var(--mu-border)] text-left">
            <span className="flex-1 text-sm font-semibold text-[var(--mu-ink)]">{t('mobileProviderAccount.row_listings')}</span>
            <span className="text-xs text-[var(--mu-text-faint)]">›</span>
          </Touch>
          <Touch onClick={() => nav('/terms')} className="w-full flex items-center px-4 py-3 text-left">
            <span className="flex-1 text-sm font-semibold text-[var(--mu-ink)]">{t('mobileProviderAccount.row_legal')}</span>
            <span className="text-xs text-[var(--mu-text-faint)]">›</span>
          </Touch>
        </div>

        <div className="mt-6 pb-2 space-y-3.5">
          <Touch onClick={() => nav('/')} className="w-full text-center text-sm font-bold" style={{ color: 'var(--mu-green)' }}>
            {t('mobileProviderAccount.switch_to_tourist')}
          </Touch>
          <Touch onClick={() => { logout(); nav('/'); }} className="w-full text-center text-xs text-[var(--mu-text-faint)]">
            {t('mobileProfile.sign_out')}
          </Touch>
        </div>
      </div>

      <MobileSheet open={kycOpen} onClose={() => setKycOpen(false)} title={t('mobileProviderAccount.row_verification')}>
        <KycSection onProfileChange={setKycProfile} />
      </MobileSheet>
    </MobileScreen>
  );
}
