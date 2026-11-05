import React from 'react';
import { useTranslation } from 'react-i18next';
import { MagicWand } from '@phosphor-icons/react';
import { describeSearch, type SearchInterpretation } from '@/lib/searchText';

export type { SearchInterpretation };

/**
 * Under the result count: what the search understood ("Homestays · under ₹2,000 · cheapest
 * first") and, when a word was misspelled, "Did you mean ..." to search the corrected words.
 */
export default function SearchUnderstood({ search, fixedType, onUse }: {
  search: SearchInterpretation;
  fixedType?: string;
  onUse: (text: string) => void;
}) {
  const { t } = useTranslation();
  const parts = describeSearch(search, fixedType, t);
  if (!parts.length && !search.corrected) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" data-testid="search-understood">
      {parts.length > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 font-semibold text-pine">
          <MagicWand size={13} weight="bold" /> {parts.join(' · ')}
        </span>
      )}
      {search.corrected && (
        <span className="text-ink-soft">
          {t('search.did_you_mean')}{' '}
          <button type="button" onClick={() => onUse(search.corrected as string)} data-testid="search-did-you-mean"
            className="font-bold text-flag underline underline-offset-2">{search.corrected}</button>
        </span>
      )}
    </div>
  );
}
