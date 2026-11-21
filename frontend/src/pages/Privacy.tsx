import React from 'react';
import { useTranslation } from 'react-i18next';
import { Trash } from '@phosphor-icons/react';
import LegalDocument from '@/components/LegalDocument';
import { Box, ButtonLink, MenuIcon } from '@/components/ag';

/** The privacy policy, with how to delete your account at the end (it used to sit in the footer). */
export default function Privacy() {
  const { t } = useTranslation();
  return (
    <LegalDocument ns="privacy" testId="privacy-page">
      <Box as="section" data-testid="privacy-delete-account">
        <div className="flex items-start gap-3">
          <MenuIcon><Trash /></MenuIcon>
          <div className="min-w-0">
            <h2>{t('nav.delete_account')}</h2>
            <p className="ag-small m-0">{t('footer.delete_account_note')}</p>
          </div>
        </div>
        <ButtonLink to="/delete-account" variant="stop" size="sm" go className="self-start">{t('nav.delete_account')}</ButtonLink>
      </Box>
    </LegalDocument>
  );
}
