import { Search, Loader2 } from 'lucide-react';
import { lazy, Suspense, useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useDebouncedValue } from '../lib/useDebouncedValue';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBaseUrl } from '../lib/apiClient';
import type { GlobalSearchResult } from '@lecturetools/api';
import { useNavigate } from '@tanstack/react-router';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { loadMockSearchResults } from '../lib/mockData';

const entityRoute: Record<GlobalSearchResult['entityType'], string> = {
  class: '/catalog',
  module: '/catalog',
  lecture: '/catalog',
  asset: '/storage',
};

const GlobalSearchResults = lazy(() => import('./GlobalSearchResults'));

export const GlobalSearch = () => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef(new Map<number, HTMLButtonElement>());
  const navigate = useNavigate({ from: '/' });
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const debounced = useDebouncedValue(query, 220);
  const trimmed = debounced.trim();

  const { data, isFetching } = useQuery({
    queryKey: ['global-search', trimmed],
    enabled: trimmed.length > 1,
    queryFn: async () => {
      const baseUrl = getApiBaseUrl();
      if (!baseUrl) {
        return { results: loadMockSearchResults(trimmed) };
      }

      return apiClient.search.global(trimmed);
    },
    placeholderData: () =>
      queryClient.getQueryData<{ results: GlobalSearchResult[] }>(['global-search', trimmed]) ?? {
        results: loadMockSearchResults(trimmed),
      },
  });

  const results = useMemo(() => {
    if (!trimmed && !open) {
      return [] as GlobalSearchResult[];
    }
    return data?.results ?? [];
  }, [data?.results, open, trimmed]);

  const listHeightClass = useMemo(() => {
    if (results.length >= 6) return 'h-[360px]';
    if (results.length >= 4) return 'h-[256px]';
    if (results.length === 0) return 'h-[180px]';
    return 'h-[192px]';
  }, [results.length]);

  useEffect(() => {
    if (activeIndex > results.length - 1) {
      setActiveIndex(results.length ? results.length - 1 : 0);
    }
  }, [results.length, activeIndex]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!open) return;
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
        return;
      }

      if (event.key === 'ArrowDown' && results.length) {
        event.preventDefault();
        setActiveIndex((index) => Math.min(results.length - 1, index + 1));
      } else if (event.key === 'ArrowUp' && results.length) {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
      } else if (event.key === 'Tab') {
        const focusables: HTMLElement[] = [];
        if (inputRef.current) {
          focusables.push(inputRef.current);
        }
        const sortedRefs = Array.from(itemRefs.current.entries())
          .sort(([a], [b]) => a - b)
          .map(([, node]) => node)
          .filter(Boolean) as HTMLButtonElement[];
        focusables.push(...sortedRefs);
        if (!focusables.length) return;
        const currentIndex = focusables.indexOf(document.activeElement as HTMLElement);
        let nextIndex = currentIndex;
        if (event.shiftKey) {
          nextIndex = currentIndex <= 0 ? focusables.length - 1 : currentIndex - 1;
        } else {
          nextIndex = currentIndex === focusables.length - 1 ? 0 : currentIndex + 1;
        }
        event.preventDefault();
        focusables[nextIndex]?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, results.length]);

  useEffect(() => {
    if (!open) return;
    const node = itemRefs.current.get(activeIndex);
    if (node) {
      node.focus();
    }
  }, [activeIndex, open]);

  const handleResultSelect = useCallback(
    (result: GlobalSearchResult) => {
      setOpen(false);
      const target = entityRoute[result.entityType];
      navigate({ to: target, search: (prev) => ({ ...prev, focusId: result.id }) }).catch(() => undefined);
    },
    [navigate],
  );

  const setItemRef = useCallback((index: number, node: HTMLButtonElement | null) => {
    if (!node) {
      itemRefs.current.delete(index);
      return;
    }
    itemRefs.current.set(index, node);
  }, []);

  return (
    <div className="relative flex-1" onFocus={() => setOpen(true)}>
      <label className="sr-only" htmlFor="global-search">
        {t('layout.searchLabel')}
      </label>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-muted" />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('layout.searchPlaceholder')}
        className="h-12 w-full rounded-xl border border-border-subtle bg-surface-base pl-10 pr-10 text-sm text-foreground outline-none transition-shadow focus:border-focus focus:shadow-focus"
        autoComplete="off"
      />
      <div className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2 text-foreground-muted">
        {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        <kbd
          aria-label={t('layout.commandHint')}
          className="rounded border border-border-subtle bg-surface-subtle px-1.5 py-0.5 text-[10px] uppercase"
        >
          ⌘K
        </kbd>
      </div>
      <div
        className={clsx(
          'pointer-events-auto absolute left-0 right-0 top-[calc(100%+8px)] z-[100] rounded-2xl border border-border-strong bg-surface-overlay/95 shadow-panel backdrop-blur-panel transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        role="listbox"
        aria-hidden={!open}
      >
        {open ? (
          <Suspense
            fallback={
              <div className={clsx('h-full', listHeightClass)}>
                <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-foreground-muted">
                  {trimmed.length > 1 ? t('layout.searchNoMatches') : t('layout.searchEmptyHint')}
                </div>
              </div>
            }
          >
            <GlobalSearchResults
              listHeightClass={listHeightClass}
              results={results}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              onSelect={handleResultSelect}
              setItemRef={setItemRef}
              trimmedQuery={trimmed}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  );
};
