/** What the server's smart search understood (backend lib/search.ts Interpretation). */
export interface SearchInterpretation {
  type: string | null;
  max_price: number | null;
  cheapest_first?: boolean;
  terms: string[];
  corrected: string | null;
}

/**
 * The understood parts as short phrases: the kind of place (only when the words picked it, not
 * when the page already did), the budget, and the cheapest-first order.
 */
export function describeSearch(
  s: SearchInterpretation,
  fixedType: string | undefined,
  t: (key: string, opts?: any) => string,
): string[] {
  const parts: string[] = [];
  if (s.type && s.type !== fixedType) parts.push(t(`categories.${s.type}`));
  if (s.max_price) parts.push(t('search.under', { price: `\u20b9${s.max_price.toLocaleString('en-IN')}` }));
  if (s.cheapest_first) parts.push(t('search.cheapest_first'));
  return parts;
}
