import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSeo } from '@/components/Seo';
import { useHostWizard } from '@/components/provider/onboard/wizard/useHostWizard';
import HostWizardScreens from '@/components/provider/onboard/wizard/HostWizard';

/**
 * List your business: the Aangan 2.0 one-question-per-screen wizard
 * (type, place, name and number, price or menu, what you give and photos, review, done).
 * State, validation and the backend calls live in useHostWizard. Nothing is paid here: the
 * listing goes up on its free start and the yearly pass is offered on the dashboard.
 */
export default function ProviderOnboard() {
  const { t } = useTranslation();
  useSeo({ title: t('provider.onboard_title') });
  const w = useHostWizard();

  return <HostWizardScreens w={w} />;
}
