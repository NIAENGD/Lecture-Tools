import { ArrowUpRight } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import type { GlobalSearchResult } from '@lecturetools/api';

const entityAccent: Record<GlobalSearchResult['entityType'], string> = {
  class: 'from-[#EAF4FF] via-[#EEE4FF] to-[#FFE8FA]',
  module: 'from-[#E4FFFB] via-[#D2FAFF] to-[#EAF5FF]',
  lecture: 'from-[#E4FFF0] via-[#E9FFD8] to-[#FFFDEB]',
  asset: 'from-[#FFE9F0] via-[#FFC9D2] to-[#FFEBE0]',
};

type GlobalSearchResultsProps = {
  listHeightClass: string;
  results: GlobalSearchResult[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (result: GlobalSearchResult) => void;
  setItemRef: (index: number, node: HTMLButtonElement | null) => void;
  trimmedQuery: string;
};

export const GlobalSearchResults = ({
  listHeightClass,
  results,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  setItemRef,
  trimmedQuery,
}: GlobalSearchResultsProps) => {
  const { t } = useTranslation();

  return (
    <div className={clsx('h-full', listHeightClass)}>
      <Virtuoso
        className="h-full"
        data={results}
        overscan={6}
        itemContent={(index, item) => (
          <button
            key={item.id}
            ref={(node) => setItemRef(index, node)}
            type="button"
            role="option"
            aria-selected={activeIndex === index}
            className="group flex w-full items-center justify-between gap-3 border-b border-border-subtle px-4 py-4 text-left last:border-b-0 focus:outline-none focus-visible:bg-surface-subtle/70"
            onMouseEnter={() => onActiveIndexChange(index)}
            onClick={() => onSelect(item)}
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground group-hover:text-foreground">
                {item.title}
              </span>
              {item.subtitle ? (
                <span className="text-xs text-foreground-muted">{item.subtitle}</span>
              ) : null}
            </div>
            <span
              className={clsx(
                'inline-flex items-center gap-2 rounded-full bg-gradient-to-r px-3 py-1 text-[11px] font-medium text-slate-900 shadow-inner',
                entityAccent[item.entityType],
              )}
            >
              {item.badge ?? item.entityType}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </button>
        )}
        components={{
          EmptyPlaceholder: () => (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-foreground-muted">
              {trimmedQuery.length > 1 ? t('layout.searchNoMatches') : t('layout.searchEmptyHint')}
            </div>
          ),
        }}
      />
    </div>
  );
};

export default GlobalSearchResults;
