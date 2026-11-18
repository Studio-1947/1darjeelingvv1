import React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/ag/Icon';
import { describeSearch, type SearchInterpretation } from '@/lib/searchText';
import { Button, Status } from '@/components/ag';

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
    <div className="ag-row" data-testid="search-understood">
      {parts.length > 0 && (
        <Status tone="info">
          <Icon name="search" className="!h-3.5 !w-3.5" /> {parts.join(' · ')}
        </Status>
      )}
      {search.corrected && (
        <span className="ag-small inline-flex flex-wrap items-center gap-1">
          {t('search.did_you_mean')}
          <Button variant="text" onClick={() => onUse(search.corrected as string)} data-testid="search-did-you-mean"
            className="underline underline-offset-2">{search.corrected}</Button>
        </span>
      )}
    </div>
  );
}
