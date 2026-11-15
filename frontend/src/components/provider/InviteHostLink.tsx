import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Copy, ShareNetwork } from '@phosphor-icons/react';
import api from '@/lib/api';
import { HOST_TYPES, hostJoinLink, type HostType } from '@/lib/hostQuickFill';
import { Box, Button, Chip, Chips, IconButton, MenuIcon } from '@/components/ag';

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
    <Box as="section" className={className} data-testid="invite-host">
      <div className="flex items-start gap-3">
        <MenuIcon><ShareNetwork /></MenuIcon>
        <div className="min-w-0">
          <h2>{t('ui.inviteHostLink.title')}</h2>
          <p className="ag-small">{t('ui.inviteHostLink.body')}</p>
        </div>
      </div>
      <Chips role="radiogroup" aria-label={t('ui.inviteHostLink.business_type')}>
        {HOST_TYPES.map((tp) => (
          <Chip key={tp} role="radio" aria-checked={type === tp} className={type === tp ? 'on' : undefined} onClick={() => setType(tp)}>
            {t(TYPE_LABEL[tp])}
          </Chip>
        ))}
      </Chips>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-full bg-[var(--surface)] border border-[var(--warmline)] px-4 py-2.5 text-sm text-[var(--ink-strong)]" data-testid="invite-host-link">{link}</code>
        <IconButton label={t('ui.inviteHostLink.copy_link')} onClick={copy}><Copy /></IconButton>
      </div>
      <Button size="sm" icon={<ShareNetwork />} className="self-start" onClick={share} data-testid="invite-host-share">{t('ui.inviteHostLink.share')}</Button>
    </Box>
  );
}
