import React from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt } from '@phosphor-icons/react';
import { Option, TextField } from '@/components/ag';
import { gstDraftError, normaliseGstin, type GstDraft } from '@/lib/gstin';

/**
 * The optional GST step before a host pays for their plan: a GST-registered business gives its
 * GSTIN and legal name, and the plan is invoiced to it (so they can claim the GST back). Saved on
 * the business, so the next renewal starts filled in. `showErrors` turns on once Pay is pressed.
 */
export default function GstDetails({ value, onChange, showErrors }: {
  value: GstDraft;
  onChange: (next: GstDraft) => void;
  showErrors?: boolean;
}) {
  const { t } = useTranslation();
  const problem = showErrors ? gstDraftError(value) : null;
  return (
    <div className="flex flex-col gap-3" data-testid="gst-details">
      <Option on={value.on} icon={<Receipt size={22} aria-hidden="true" />}
        title={t('gst.have', 'My business is GST-registered')}
        sub={t('gst.have_sub', 'Add your GSTIN to get a GST invoice for this payment. Optional.')}
        onClick={() => onChange({ ...value, on: !value.on })} data-testid="gst-toggle" />
      {value.on && (
        <>
          <TextField label={t('gst.gstin', 'GSTIN')} value={value.gstin} maxLength={18}
            autoCapitalize="characters" autoComplete="off" spellCheck={false} inputMode="text"
            placeholder="19ABCDE1234F1Z5"
            onChange={(e) => onChange({ ...value, gstin: normaliseGstin(e.target.value).slice(0, 15) })}
            error={problem === 'gstin' ? t('gst.gstin_bad', 'Check the 15-character GSTIN on your GST certificate.') : undefined}
            errorId="gst-gstin-error" data-testid="gst-gstin" />
          <TextField label={t('gst.legal_name', 'Legal name on the GST certificate')} value={value.legalName} maxLength={120}
            autoComplete="organization"
            onChange={(e) => onChange({ ...value, legalName: e.target.value })}
            error={problem === 'name' ? t('gst.legal_name_bad', 'Enter the legal name registered with this GSTIN.') : undefined}
            errorId="gst-name-error" data-testid="gst-legal-name" />
          <p className="ag-small m-0">{t('gst.saved_note', 'Saved for your next renewal too. Turn this off if you are not GST-registered.')}</p>
        </>
      )}
    </div>
  );
}
