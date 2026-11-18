import React from 'react';

/**
 * Loading placeholders that mirror the real components' geometry.
 *
 * Each one keeps the same box model as what replaces it, so content doesn't
 * jump when the fetch lands. `bg-mist` rather than a grey tint keeps them in
 * the app's palette; the pulse is a single animation on the wrapper so a page
 * of them stays in step instead of shimmering out of phase.
 */

/** One grey block. Everything below is composed from these. */
export function Bar({ className = '' }: { className?: string }) {
  return <div className={`bg-mist rounded-md ${className}`} aria-hidden="true" />;
}

/** Wrapper that pulses its children and hides them from assistive tech. */
export function SkeletonBlock({ className = '', children, testid }: {
  className?: string;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <div className={`animate-pulse ${className}`} aria-hidden="true" data-testid={testid}>
      {children}
    </div>
  );
}

/** Screen-reader announcement to pair with a visual skeleton. */
export function LoadingStatus({ label }: { label: string }) {
  return <span role="status" aria-live="polite" className="sr-only">{label}</span>;
}

/** Matches the 104px list card (search across every category, list view). */
export function ListRowSkeleton() {
  return (
    <SkeletonBlock testid="list-row-skeleton" className="ag-card grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3.5 p-2.5">
      <Bar className="aspect-square w-[104px] rounded-[14px]" />
      <div className="space-y-2">
        <Bar className="h-4 w-4/5" />
        <Bar className="h-3 w-3/5" />
        <Bar className="h-4 w-1/3" />
      </div>
    </SkeletonBlock>
  );
}

/** Matches the stay card: photo, name, place, price, button (Category's grid and Home's rows). */
export function GridTileSkeleton() {
  return (
    <SkeletonBlock testid="grid-tile-skeleton" className="ag-card">
      <Bar className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-3.5">
        <Bar className="h-4 w-4/5" />
        <Bar className="h-3 w-3/5" />
        <Bar className="h-4 w-1/3" />
        <Bar className="mt-3 h-11 w-full rounded-full" />
      </div>
    </SkeletonBlock>
  );
}

/** Matches the tall spot card (Home's Offbeat Places and Nature). */
export function SpotTileSkeleton() {
  return (
    <SkeletonBlock testid="spot-tile-skeleton" className="overflow-hidden rounded-[var(--r-card)] border border-[var(--warmline)]">
      <Bar className="aspect-[3/4] w-full rounded-none" />
    </SkeletonBlock>
  );
}

/** Matches Home's homestay cards. */
export function StayTileSkeleton() {
  return (
    <SkeletonBlock testid="stay-tile-skeleton" className="ag-card">
      <Bar className="aspect-[4/3] w-full rounded-none" />
      <div className="space-y-2 p-3.5">
        <Bar className="h-4 w-4/5" />
        <Bar className="h-3 w-2/5" />
        <Bar className="h-4 w-1/3" />
        <Bar className="mt-3 h-11 w-full rounded-full" />
      </div>
    </SkeletonBlock>
  );
}

/** Matches a posted review row. */
export function ReviewSkeleton() {
  return (
    <SkeletonBlock testid="review-skeleton" className="rounded-2xl border border-[var(--line)] p-4 md:p-5 bg-white">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Bar className="w-9 h-9 rounded-full" />
          <div className="space-y-1.5">
            <Bar className="h-3.5 w-24" />
            <Bar className="h-2.5 w-16" />
          </div>
        </div>
        <Bar className="h-4 w-20" />
      </div>
      <Bar className="h-3 w-full mt-3" />
      <Bar className="h-3 w-3/4 mt-2" />
    </SkeletonBlock>
  );
}

/**
 * Matches the listing detail page: full-bleed hero followed by a text section.
 * The hero uses the same height expression as DetailHero so the fold doesn't
 * shift when the real content arrives.
 */
export function ListingDetailSkeleton() {
  // The listing page's shape (prototype item view): the 16:10 photo, the strip of 150px photos,
  // then the name, place and tags, the price, the button row and the About box.
  return (
    <SkeletonBlock testid="listing-detail-skeleton" className="ag-wrap">
      <div className="ag-main">
        <Bar className="w-full aspect-[16/10] rounded-[20px]" />
        <div className="flex gap-2 overflow-hidden">
          {repeat(3, (i) => <Bar key={i} className="w-[150px] aspect-[4/3] flex-none rounded-[12px]" />)}
        </div>
        <div className="space-y-2">
          <Bar className="h-8 w-3/4" />
          <Bar className="h-5 w-1/2" />
          <Bar className="h-6 w-28" />
        </div>
        <Bar className="h-6 w-2/5" />
        <div className="flex gap-2">
          <Bar className="h-11 w-24 rounded-full" />
          <Bar className="h-11 w-28 rounded-full" />
          <Bar className="h-11 w-11 rounded-full" />
          <Bar className="h-11 w-11 rounded-full" />
        </div>
        <Bar className="h-40 w-full rounded-[var(--r-card)]" />
      </div>
    </SkeletonBlock>
  );
}

/** `count` copies of a skeleton, for filling a grid while it loads. */
export function repeat(count: number, render: (i: number) => React.ReactNode) {
  return Array.from({ length: count }, (_, i) => render(i));
}
