import React, { useState } from 'react';

/**
 * <img> that swaps to a verified fallback if the primary source fails to load.
 * Keyword-based Unsplash URLs can 404/503; this guarantees no broken-image box.
 */
export default function SmartImg({
  src, fallback, alt = '', className = '', ...rest
}: { src: string, fallback: string, alt?: string, className?: string } & React.ImgHTMLAttributes<HTMLImageElement>) {
  const [current, setCurrent] = useState(src);
  return (
    <img
      src={current}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => { if (current !== fallback) setCurrent(fallback); }}
      {...rest}
    />
  );
}
