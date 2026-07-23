import React from 'react';
import { useTranslation } from 'react-i18next';
import MockPaymentModal from '@/components/MockPaymentModal';
import BookingConfirmation from '@/components/BookingConfirmation';
import { useProviderOnboard } from '@/components/provider/onboard/useProviderOnboard';
import BasicInfoStep from '@/components/provider/onboard/BasicInfoStep';
import DriverForm from '@/components/provider/onboard/DriverForm';
import HomestayForm from '@/components/provider/onboard/HomestayForm';
import CafeShopForm from '@/components/provider/onboard/CafeShopForm';

/**
 * Provider onboarding. Step 1 collects the business basics; step 2 is a
 * type-specific "design your listing" flow. All state and the payment flow
 * live in useProviderOnboard - the step components are layout over it.
 */
export default function ProviderOnboard() {
  const { t } = useTranslation();
  const o = useProviderOnboard();

  const stepScreen =
    o.step === 1 ? <BasicInfoStep o={o} />
    : o.form.business_type === 'driver' ? <DriverForm o={o} />
    : o.form.business_type === 'homestay' ? <HomestayForm o={o} />
    : (o.form.business_type === 'cafe' || o.form.business_type === 'shop') ? <CafeShopForm o={o} />
    : null;

  return (
    <>
      {stepScreen}

      <MockPaymentModal
        open={!!o.payModal}
        onClose={() => o.setPayModal(null)}
        amount={o.payModal?.amount || 0}
        title={t('pay.provider_registration')}
        description={o.payModal?.description || ''}
        onPay={o.finishMockPayment}
        prefill={{ upi: `${(o.form.business_name || 'business').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
      <BookingConfirmation
        open={!!o.confirm?.open}
        onClose={() => { o.setConfirm(null); o.nav('/provider/dashboard'); }}
        mode="provider"
        data={o.confirm?.data}
        onView={() => { o.setConfirm(null); o.nav('/provider/dashboard'); }}
      />
    </>
  );
}
