import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { Box, Button, ButtonLink } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import { rupees, usePassPrice } from '@/lib/prices';

/**
 * Anyone can plan a trip; only verified people post one in the Feed. A traveller is verified by the
 * ₹1 aangan pass (Verified traveller), a business by its Verified tick (a business account has no
 * traveller pass to buy, so it is pointed at its documents). Shown where a plan would
 * go up, with the way to get verified and, while planning, the choice to keep the plan to yourself.
 */
export default function VerifyToPost({ next, beforeLeave, onKeepPrivate, busy }: {
  /** Where the pass page brings them back to. */
  next: string;
  /** Called before leaving for the pass page (the planner keeps its draft here). */
  beforeLeave?: () => void;
  onKeepPrivate?: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { user } = useAuth();
  const pass = usePassPrice(user);
  const host = user?.role === 'provider';
  return (
    <Box data-testid="plan-verify-gate">
      <p className="ag-eyebrow m-0 flex items-center gap-1.5"><Icon name="badge" />{t('plans.verify_h', 'Only verified people post in the Feed')}</p>
      <p className="ag-small m-0">
        {host
          ? t('plans.verify_host', 'Your plan can go in the Feed once your business has the Verified tick. Send your documents from the Business dashboard.')
          : t('plans.verify_traveller', 'Get the {{price}} Verified traveller pass to post your plan. Everyone can still see, like, comment on and share what is in the Feed.', { price: rupees(pass.total) })}
      </p>
      <div className="flex flex-col gap-2">
        {host ? (
          <ButtonLink to="/provider/dashboard" variant="primary" go onClick={() => beforeLeave?.()} data-testid="plan-verify-tick">{t('plans.verify_tick', 'Get the Verified tick')}</ButtonLink>
        ) : (
          <Button variant="primary" go data-testid="plan-verify-pass"
            onClick={() => { beforeLeave?.(); nav(`/support?next=${encodeURIComponent(next)}`); }}>
            {t('plans.verify_pass', 'Get the pass for {{price}}', { price: rupees(pass.total) })}
          </Button>
        )}
        {onKeepPrivate && (
          <Button onClick={onKeepPrivate} disabled={busy} data-testid="plan-keep-private">
            {t('plans.keep_private', 'Keep it to myself for now')}
          </Button>
        )}
      </div>
    </Box>
  );
}
