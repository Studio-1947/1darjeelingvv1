import React from 'react';
import { useTranslation } from 'react-i18next';
import MockPaymentModal from '@/components/MockPaymentModal';
import { useSeo } from '@/components/Seo';
import { useHostWizard } from '@/components/provider/onboard/wizard/useHostWizard';
import HostWizardScreens from '@/components/provider/onboard/wizard/HostWizard';

/**
 * List your business: the Aangan 2.0 one-question-per-screen wizard
 * (type, place, name and number, price or menu, what you give and photos, review, done).
 * State, validation and the backend calls live in useHostWizard.
 */
export default function ProviderOnboard() {
  const { t } = useTranslation();
  useSeo({ title: t('provider.onboard_title') });
  const w = useHostWizard();

  return (
    <>
      <HostWizardScreens w={w} />
      <MockPaymentModal
        open={!!w.payModal}
        onClose={() => w.setPayModal(null)}
        amount={w.payModal?.amount || 0}
        title={t('pay.provider_registration')}
        description={t('ui.useProviderOnboard.registration_description')}
        onPay={w.finishMockPayment}
        prefill={{ upi: `${(w.d.name || 'business').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </>
  );
}
