import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Copy, ShareNetwork } from '@phosphor-icons/react';
import api from '@/lib/api';
import { HOST_TYPES, hostJoinLink, type HostType } from '@/lib/hostQuickFill';

// i18n keys under ui.inviteHostLink.type; t() is called at render.
const TYPE_LABEL: Record<HostType, string> = {
  homestay: 'ui.inviteHostLink.type.homestay',
  driver: 'ui.inviteHostLink.type.driver',
  guide: 'ui.inviteHostLink.type.guide',
  cafe: 'ui.inviteHostLink.type.cafe',
  shop: 'ui.inviteHostLink.type.shop',
};

/**
 * "Invite a host": the shortcut link to host sign-up with the business type picked and the
 * viewer's invite code filled in. Field staff send it on WhatsApp or print it as a QR code.
 */
export default function InviteHostLink({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [type, setType] = useState<HostType>('homestay');

  useEffect(() => {
    let live = true;
    api.get('/users/me/referrals').then(({ data }) => live && setCode(data.code || '')).catch(() => {});
    return () => { live = false; };
  }, []);

  const link = hostJoinLink(window.location.origin, { type, ref: code });

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success(t('ui.inviteHostLink.link_copied')); } catch { /* blocked */ }
  };
  const share = async () => {
    const text = t('ui.inviteHostLink.share_text', { type: t(TYPE_LABEL[type]).toLowerCase(), link });
    try {
      if (navigator.share) await navigator.share({ title: 'aangan', text, url: link });
      else { await navigator.clipboard.writeText(text); toast.success(t('ui.inviteHostLink.invite_copied')); }
    } catch { /* closed */ }
  };

  return (
    <div className={`rounded-3xl p-5 bg-white border border-[var(--line)] ${className}`} data-testid="invite-host">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-soft"><ShareNetwork size={14} /> {t('ui.inviteHostLink.title')}</div>
      <p className="mt-2 text-sm text-ink-soft">{t('ui.inviteHostLink.body')}</p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('ui.inviteHostLink.business_type')}>
        {HOST_TYPES.map((tp) => (
          <button key={tp} type="button" role="radio" aria-checked={type === tp} onClick={() => setType(tp)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${type === tp ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-[var(--line)]'}`}>
            {t(TYPE_LABEL[tp])}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate px-2.5 py-2 rounded-lg bg-mist text-xs font-semibold text-ink" data-testid="invite-host-link">{link}</code>
        <button type="button" onClick={copy} aria-label={t('ui.inviteHostLink.copy_link')} className="w-10 h-10 rounded-full grid place-items-center border border-[var(--line)] hover:bg-mist"><Copy size={16} /></button>
        <button type="button" onClick={share} className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-[#1F6656] text-white text-xs font-bold btn-hover" data-testid="invite-host-share">{t('ui.inviteHostLink.share')}</button>
      </div>
    </div>
  );
}
