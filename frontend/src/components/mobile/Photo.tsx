import React from 'react';
import SmartImg from '@/components/SmartImg';

/**
 * Listing photo for the mobile port, mirroring RN's Photo.tsx + Placeholder.tsx.
 * Wraps the existing SmartImg (already does the same branded-placeholder /
 * fail-over behavior RN's Placeholder provides) rather than reimplementing it.
 */
export default function MobilePhoto({
  src,
  alt = '',
  radius = 'var(--mu-r-tile)',
  className = '',
}: {
  src?: string;
  alt?: string;
  radius?: string;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden bg-[var(--mu-ph-a)] ${className}`}
      style={{ borderRadius: radius }}
    >
      <SmartImg src={src} alt={alt} className="w-full h-full object-cover" />
    </div>
  );
}
