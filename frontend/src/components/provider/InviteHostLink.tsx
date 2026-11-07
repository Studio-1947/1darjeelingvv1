import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, ShareNetwork } from '@phosphor-icons/react';
import api from '@/lib/api';
import { HOST_TYPES, hostJoinLink, type HostType } from '@/lib/hostQuickFill';

const TYPE_LABEL: Record<HostType, string> = {
  homestay: 'Homestay',
  driver: 'Driver',
  guide: 'Guide',
  cafe: 'Cafe',
  shop: 'Shop',
};

/**
 * "Invite a host": the shortcut link to host sign-up with the business type picked and the
 * viewer's invite code filled in. Field staff send it on WhatsApp or print it as a QR code.
 */
export default function InviteHostLink({ className = '' }: { className?: string }) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<HostType>('homestay');

  useEffect(() => {
    let live = true;
    api.get('/users/me/referrals').then(({ data }) => live && setCode(data.code || '')).catch(() => {});
    return () => { live = false; };
  }, []);

  const link = hostJoinLink(window.location.origin, { type, ref: code });

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast.success('Link copied'); } catch { /* blocked */ }
  };
  const share = async () => {
    const text = `List your ${TYPE_LABEL[type].toLowerCase()} on aangan for free: ${link}`;
    try {
      if (navigator.share) await navigator.share({ title: 'aangan', text, url: link });
      else { await navigator.clipboard.writeText(text); toast.success('Invite copied'); }
    } catch { /* closed */ }
  };

  return (
    <div className={`rounded-3xl p-5 bg-white border border-[var(--line)] ${className}`} data-testid="invite-host">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink-soft"><ShareNetwork size={14} /> Invite a host</div>
      <p className="mt-2 text-sm text-ink-soft">Know a homestay, driver or cafe? Send them this link. It opens a short sign-up with their business type already picked.</p>
      <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Business type">
        {HOST_TYPES.map((tp) => (
          <button key={tp} type="button" role="radio" aria-checked={type === tp} onClick={() => setType(tp)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${type === tp ? 'bg-pine text-white border-pine' : 'bg-white text-ink-soft border-[var(--line)]'}`}>
            {TYPE_LABEL[tp]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate px-2.5 py-2 rounded-lg bg-mist text-xs font-semibold text-ink" data-testid="invite-host-link">{link}</code>
        <button type="button" onClick={copy} aria-label="Copy link" className="w-10 h-10 rounded-full grid place-items-center border border-[var(--line)] hover:bg-mist"><Copy size={16} /></button>
        <button type="button" onClick={share} className="inline-flex items-center gap-1 h-10 px-4 rounded-full bg-[#1F6656] text-white text-xs font-bold btn-hover" data-testid="invite-host-share">Share</button>
      </div>
    </div>
  );
}
