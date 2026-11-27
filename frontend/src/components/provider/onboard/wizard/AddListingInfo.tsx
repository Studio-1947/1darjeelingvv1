import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ag';
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
  // Told as three short paragraphs: what the pass is (a yearly platform fee, never a booking
  // charge or a commission), what it costs, and that each listing stands on its own.
  const paras = [
    t('ob.add.p_fee', 'The yearly pass is a platform fee for being listed on aangan. It is not a booking charge: we never charge you per booking and take no commission, so whatever your guests pay stays with you.'),
    t('ob.add.p_cost', {
      count: grace_bookings, big: rupees(big.base), small: rupees(small.base),
      defaultValue: 'A new listing is free until it has had its first {{count}} bookings. After that, its pass is {{big}} a year for a homestay, driver or guide, or {{small}} a year for a cafe or restaurant, plus GST. Local shops are always free.',
    }),
    t('ob.add.p_each', 'Each listing has its own page, its own bookings and its own pass, so your other listings are not affected. If one pass ends, only that listing is hidden.'),
  ];
  return (
    <Sheet onClose={onContinue} labelledBy="wz-add-info-title" testid="wz-add-info" closeTestid="wz-add-info-close">
      <div className="flex flex-col gap-4">
        <SheetHead id="wz-add-info-title" eyebrow={t('ob.add.eye', 'Adding a listing')}
          title={t('ob.add.title', 'Every listing has its own yearly pass')} />
        <div className="ag-onboard-prose">
          {paras.map((p) => <p key={p}>{p}</p>)}
          <p className="hl">{t('ob.add.p_free_pay', 'Nothing to pay now. Pay any time from the listing’s card on your dashboard.')}</p>
        </div>
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
