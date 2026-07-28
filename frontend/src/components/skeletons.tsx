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

/** Matches FeedCard: avatar row, square image, action row, caption, CTA. */
export function FeedCardSkeleton() {
  return (
    <SkeletonBlock
      testid="feed-card-skeleton"
      className="bg-white rounded-3xl border border-[var(--line)] overflow-hidden max-w-xl mx-auto md:mx-0 w-full"
    >
      <div className="flex items-center gap-3 p-3.5">
        <Bar className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-1.5">
          <Bar className="h-3.5 w-1/3" />
          <Bar className="h-2.5 w-1/5" />
        </div>
      </div>
      <Bar className="aspect-square w-full rounded-none" />
      <div className="flex items-center gap-4 px-3.5 pt-3">
        <Bar className="w-5 h-5 rounded-full" />
        <Bar className="w-16 h-4" />
        <Bar className="w-5 h-5 rounded-full ml-auto" />
      </div>
      <div className="px-3.5 py-3 space-y-2">
        <Bar className="h-5 w-3/5" />
        <Bar className="h-3 w-2/5" />
        <Bar className="h-3 w-full" />
        <Bar className="h-3 w-4/5" />
        <Bar className="h-10 w-full rounded-full mt-3.5" />
      </div>
    </SkeletonBlock>
  );
}

/** Matches Category's grid tile: square image plus a pill CTA. */
export function GridTileSkeleton() {
  return (
    <SkeletonBlock
      testid="grid-tile-skeleton"
      className="rounded-xl sm:rounded-2xl bg-white border border-[var(--line)] overflow-hidden"
    >
      <Bar className="aspect-square w-full rounded-none" />
      <div className="p-2 sm:p-3">
        <Bar className="h-8 w-full rounded-full" />
      </div>
    </SkeletonBlock>
  );
}

/** Matches Discover's horizontally scrolled spot tiles. */
export function SpotTileSkeleton() {
  return (
    <SkeletonBlock
      testid="spot-tile-skeleton"
      className="flex-shrink-0 w-[70%] sm:w-[45%] md:w-[30%] rounded-2xl overflow-hidden bg-white border border-[var(--line)]"
    >
      <Bar className="aspect-[4/5] w-full rounded-none" />
    </SkeletonBlock>
  );
}

/** Matches Discover's homestay quick-pick tile. */
export function StayTileSkeleton() {
  return (
    <SkeletonBlock
      testid="stay-tile-skeleton"
      className="rounded-2xl overflow-hidden bg-white border border-[var(--line)]"
    >
      <Bar className="aspect-square w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Bar className="h-4 w-4/5" />
        <Bar className="h-2.5 w-2/5" />
        <Bar className="h-4 w-1/3" />
        <Bar className="h-8 w-full rounded-full mt-3" />
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
  return (
    <SkeletonBlock testid="listing-detail-skeleton" className="pb-28 lg:pb-0">
      <div className="relative h-[calc(100svh-var(--header-h))] w-full bg-mist">
        <div className="absolute inset-x-0 bottom-0 p-4 md:p-8 lg:px-16 lg:pb-20 space-y-4">
          <Bar className="h-6 w-28 rounded-full bg-white/60" />
          <Bar className="h-12 md:h-20 w-4/5 bg-white/60" />
          <Bar className="h-5 w-1/2 bg-white/60" />
        </div>
      </div>
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8 py-16 md:py-24 space-y-4">
        <Bar className="h-3 w-24 mx-auto" />
        <Bar className="h-9 md:h-12 w-3/4 mx-auto" />
        <div className="pt-4 space-y-3">
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-2/3" />
        </div>
      </div>
    </SkeletonBlock>
  );
}

/** `count` copies of a skeleton, for filling a grid while it loads. */
export function repeat(count: number, render: (i: number) => React.ReactNode) {
  return Array.from({ length: count }, (_, i) => render(i));
}
