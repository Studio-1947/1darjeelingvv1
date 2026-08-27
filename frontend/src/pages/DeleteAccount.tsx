import React from 'react';
import LegalDocument from '@/components/LegalDocument';

/**
 * Google Play requires a URL, reachable without installing the app, where a user can find out
 * how to delete their account and what happens to their data. The in-app Delete account button
 * satisfies the other half of that policy; this page satisfies the half that has to exist on
 * the open web.
 */
export default function DeleteAccount() {
  return <LegalDocument ns="data_deletion" testId="delete-account-page" />;
}
