import React, { useState } from 'react';

/** A person's photo; if it is missing or will not load, their initial instead. */
export default function FaceImg({ src, initial, className = '' }: { src?: string; initial: React.ReactNode; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) return <>{initial}</>;
  return <img src={src} alt="" loading="lazy" className={className} onError={() => setBroken(true)} />;
}
