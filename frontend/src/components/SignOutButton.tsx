import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SignOut } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ag';

/**
 * Log out and Delete account, at the foot of the profile pages (traveller Profile and the
 * business profile). The header has no profile menu, so this is the way out at every width.
 */
export default function SignOutButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className={`flex flex-col items-center gap-3 ${className || ''}`}>
      <Button variant="stop" block center icon={<SignOut />} onClick={() => { logout(); nav('/'); }} data-testid="account-sign-out">
        {t('nav.logout')}
      </Button>
      {/* The Terms (§11) and Contact (§7) say an account can be deleted from the dashboard: this is where. */}
      <Link to="/delete-account" data-testid="account-delete" className="ag-small underline hover:text-[var(--fail)]">
        {t('nav.delete_account')}
      </Link>
    </div>
  );
}
