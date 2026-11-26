import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ag';
import { Icon } from '@/components/ag/Icon';
import Sheet, { SheetHead } from '@/components/listing-detail/Sheet';
import { rupees, useHostPlanPrice } from '@/lib/prices';
import { useHostSignupInfo } from '@/components/provider/onboard/QuickFill';

/**
 * Opened each time the add-a-listing wizard opens, before a host who is already listed adds another:
 * every listing pays its own yearly pass (owner decision 2026-11-25, backend lib/listingPlan.ts),
 * with its own free start. Prices come
 * from the server; nothing is charged here (the pass is paid from that listing's card on the dashboard).
 */
export default function AddListingInfo({ onContinue, onLeave }: { onContinue: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  const big = useHostPlanPrice('homestay');
  const small = useHostPlanPrice('cafe');
  const { grace_bookings } = useHostSignupInfo();
  const points = [
    t('ob.add.p_own', 'Each listing has its own page, its own bookings and its own membership card.'),
    t('ob.add.p_free', { count: grace_bookings, defaultValue: 'Every new listing starts free: its first {{count}} bookings cost nothing.' }),
    t('ob.add.p_price', {
      big: rupees(big.base), small: rupees(small.base),
      defaultValue: 'After that, it needs its own yearly pass: {{big}}/year for a homestay, driver or guide, {{small}}/year for a cafe or restaurant. GST is added when you pay.',
    }),
    t('ob.add.p_shop', 'Local shops are always free.'),
    t('ob.add.p_apart', 'Your other listings are not affected. If one pass ends, only that listing is hidden.'),
  ];
  return (
    <Sheet onClose={onContinue} labelledBy="wz-add-info-title" testid="wz-add-info" closeTestid="wz-add-info-close">
      <div className="flex flex-col gap-4">
        <SheetHead id="wz-add-info-title" eyebrow={t('ob.add.eye', 'Adding a listing')}
          title={t('ob.add.title', 'Every listing has its own yearly pass')} />
        <ul className="ag-onboard-fees">
          {points.map((p) => <li key={p}><Icon name="check" /><span>{p}</span></li>)}
          <li className="hl"><span>{t('ob.add.p_free_pay', 'Nothing to pay now. Pay any time from the listing’s card on your dashboard.')}</span></li>
        </ul>
        <Button variant="primary" go block onClick={onContinue} data-autofocus data-testid="wz-add-info-ok">
          {t('ob.add.ok', 'Got it, add a listing')}
        </Button>
        <Button variant="text" className="self-center" onClick={onLeave} data-testid="wz-add-info-leave">
          {t('ob.add.leave', 'Not now')}
        </Button>
      </div>
    </Sheet>
  );
}
