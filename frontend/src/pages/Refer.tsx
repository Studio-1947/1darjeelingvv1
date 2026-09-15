import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check } from '@phosphor-icons/react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Seo from '@/components/Seo';
import { MobileScreen, Slab, PrimaryButton, Touch } from '@/components/mobile';

/**
 * Mobile-only Refer & Earn page, matching RN's refer.tsx. GET
 * /users/me/referrals is a real, working backend endpoint
 * (backend/src/routes/users.ts:95 - assigns a code lazily, counts real
 * joins) that had no frontend caller anywhere before this. No fake
 * referral list - RN's own screen shows none against a live backend either,
 * since "who joined" isn't data the server exposes.
 */
export default function Refer() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const nav = useNavigate();

  const [code, setCode] = useState('');
  const [joined, setJoined] = useState(0);
  const [rewardDays, setRewardDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login?next=/refer'); return; }
    let cancelled = false;
    api.get('/users/me/referrals')
      .then((r) => {
        if (cancelled) return;
        setCode(r.data.code || '');
        setJoined(r.data.joined || 0);
        setRewardDays(r.data.reward_days || 90);
      })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user, authLoading, nav]);

  const months = Math.round(rewardDays / 30);
  const inviteText = `Join me on aangan — direct bookings with local homestays, jeeps and guides. Use my code ${code} and we both get +${months} months of pass free.`;

  const copy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const shareWhatsApp = () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(inviteText)}`, '_blank');
  };

  if (authLoading || !user) return null;

  return (
    <MobileScreen tone="green" className="lg:hidden min-h-screen flex flex-col pb-[calc(var(--bottom-nav-h)+1rem)]">
      <Seo title={t('mobileRefer.title')} noindex />
      <div className="flex-1 px-6 pt-8">
        <span className="inline-block px-3 py-1 rounded-full bg-[var(--mu-cream)] text-[10px] font-bold tracking-wider text-[var(--mu-green-deep)]">
          {t('mobileRefer.tag')}
        </span>
        <h1 className="mt-3.5 font-[family-name:var(--mu-font-display)] font-black text-[30px] leading-[1.1] text-[var(--mu-cream)] tracking-tight">
          {t('mobileRefer.title')}
        </h1>
        <p className="mt-2 text-[13px] leading-snug text-[var(--mu-text-on-dark-muted)]">
          {t('mobileRefer.body_pre')} <span className="font-bold" style={{ color: 'var(--mu-lime)' }}>{t('mobileRefer.body_bold')}</span> {t('mobileRefer.body_post')}
        </p>

        <div className="mt-4.5 flex items-center gap-3 rounded-[var(--mu-r-card-sm)] px-[18px] py-3.5" style={{ background: 'var(--mu-on-dark-fill)', border: '1.5px dashed var(--mu-lime-glow)' }}>
          {loading ? (
            <span className="text-[12.5px] text-[var(--mu-text-on-dark-muted)]">{t('mobileRefer.loading')}</span>
          ) : code ? (
            <>
              <div className="flex-1">
                <Slab className="text-[var(--mu-sage)]">{t('mobileRefer.your_code')}</Slab>
                <div className="mt-0.5 font-[family-name:var(--mu-font-display)] font-black text-2xl tracking-wide" style={{ color: 'var(--mu-lime)' }}>
                  {code}
                </div>
              </div>
              <Touch onClick={copy} className="px-4 py-2 rounded-[var(--mu-r-chip)]" style={{ background: 'var(--mu-lime)' }}>
                <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--mu-lime-ink)' }}>
                  {copied ? <><Check size={13} weight="bold" /> {t('mobileRefer.copied')}</> : t('mobileRefer.copy')}
                </span>
              </Touch>
            </>
          ) : (
            <span className="text-[12.5px] text-[var(--mu-text-on-dark-muted)]">
              {failed ? t('mobileRefer.unavailable') : t('mobileRefer.loading')}
            </span>
          )}
        </div>

        <div className="mt-3.5 rounded-[20px] px-4 py-3.5" style={{ background: 'var(--mu-bg)' }}>
          <Slab>{t('mobileRefer.your_referrals')} · {joined} {t('mobileRefer.joined_count')}</Slab>
        </div>

        <p className="mt-3.5 text-[11.5px] leading-relaxed text-[var(--mu-text-on-dark-faint)]">
          {t('mobileRefer.provider_note')}
        </p>
      </div>

      <div className="px-6 pb-8 pt-2">
        <PrimaryButton
          onClick={shareWhatsApp}
          disabled={!code}
          className="w-full !bg-[var(--mu-lime)] !text-[var(--mu-lime-ink)]"
        >
          {t('mobileRefer.invite_whatsapp')} →
        </PrimaryButton>
      </div>
    </MobileScreen>
  );
}
