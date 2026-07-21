import React from 'react';
import { BadgeCheck } from 'lucide-react';

/** Shown when a provider's kyc_status is 'verified'. */
export default function VerifiedBadge({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const px = size === 'md' ? 16 : 13;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-pine/10 text-pine font-bold px-2 py-0.5 text-[11px]"
      title="KYC verified by 1 Darjeeling"
    >
      <BadgeCheck size={px} /> Verified
    </span>
  );
}
