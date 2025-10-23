import { useMemo, useState, useRef, useEffect } from 'react';
import { HardDrive, Trash2, DownloadCloud, Folder, PlusCircle } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { useQuery } from '@tanstack/react-query';
import { apiClient, getApiBaseUrl } from '../../lib/apiClient';
import { useTaskCartStore } from '../../state/taskCart';
import { useToastStore } from '../../state/toast';
import clsx from 'clsx';
import { loadMockStorage, type MockStorageDirectory } from '../../lib/mockData';

type StorageEntry = MockStorageDirectory;
type StorageOverviewCard = {
  id: string;
  label: string;
  gigabytes: number;
  mastered: number;
  purgeCandidates: number;
};

type StorageFallback = {
  entries: StorageOverviewCard[];
  directories: StorageEntry[];
};

const useStorageQuery = (fallback: StorageFallback) => {
  const enabled = Boolean(getApiBaseUrl());
  return useQuery({
    queryKey: ['storage-overview'],
    enabled,
    queryFn: async () => {
      if (!enabled) {
        return fallback;
      }
      const overview = await apiClient.storage.getUsage();
      return {
        entries: overview.entries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          gigabytes: entry.gigabytes,
          mastered: entry.mastered,
          purgeCandidates: entry.purgeCandidates,
        })),
        directories: fallback.directories,
      };
    },
    initialData: fallback,
  });
};

export const StorageView = () => {
  const fallback = useMemo(() => loadMockStorage(), []);
  const { data } = useStorageQuery(fallback);
  const addCartItem = useTaskCartStore((state) => state.addItem);
  const pushToast = useToastStore((state) => state.pushToast);
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null);
  const [selectedDirectories, setSelectedDirectories] = useState<Set<string>>(new Set());
  const purgeHoldRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const purgeUndoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoActive, setUndoActive] = useState(false);

  const directories = useMemo(() => {
    if (!selectedFilter) return data?.directories ?? fallback.directories;
    const target = selectedFilter.toLowerCase();
    return (data?.directories ?? fallback.directories).filter((entry) => {
      const scope = (entry as Partial<StorageEntry>).scopeId ?? entry.path;
      return scope.toLowerCase().includes(target);
    });
  }, [data?.directories, fallback.directories, selectedFilter]);

  const toggleDirectory = (id: string) => {
    setSelectedDirectories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const bulkAddToCart = () => {
    const count = selectedDirectories.size || directories.length;
    addCartItem({
      title: `Bulk export (${count} items)`,
      action: 'Export',
      estMs: Math.max(6, count * 2) * 60_000,
      params: { selected: Array.from(selectedDirectories.values()) },
      prereqs: ['Storage selection'],
    });
    pushToast({ title: 'Added to cart', description: `${count} storage items staged.` });
  };

  const cancelHold = () => {
    if (purgeHoldRef.current) {
      clearTimeout(purgeHoldRef.current);
      purgeHoldRef.current = null;
    }
  };

  const undoPurge = () => {
    if (purgeUndoRef.current) {
      clearTimeout(purgeUndoRef.current);
      purgeUndoRef.current = null;
    }
    setUndoActive(false);
    pushToast({ title: 'Purge undone', description: 'No files were removed.' });
  };

  const triggerPurge = () => {
    cancelHold();
    setUndoActive(true);
    pushToast({ title: 'Purge armed', description: 'Processed audio will be removed in 10s unless undone.' });
    if (purgeUndoRef.current) {
      clearTimeout(purgeUndoRef.current);
    }
    purgeUndoRef.current = setTimeout(() => {
      setUndoActive(false);
      pushToast({ title: 'Purge committed', description: 'Processed audio removed from storage.' });
    }, 10_000);
  };

  const beginHold = () => {
    cancelHold();
    purgeHoldRef.current = setTimeout(triggerPurge, 800);
  };

  useEffect(() => () => {
    cancelHold();
    if (purgeUndoRef.current) {
      clearTimeout(purgeUndoRef.current);
      purgeUndoRef.current = null;
    }
  });

  return (
    <div className="flex h-full w-full gap-4">
      <section className="w-1/3 space-y-3 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center gap-3">
          <HardDrive className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-foreground">Storage Overview</h2>
            <p className="text-xs text-foreground-muted">Tap a card to focus the directory browser.</p>
          </div>
        </header>
        <div className="space-y-3">
          {(data?.entries ?? fallback.entries).map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setSelectedFilter((current) => (current === card.id ? null : card.id))}
              className={clsx(
                'flex w-full flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-base/70 p-4 text-left text-sm text-foreground transition-colors',
                selectedFilter === card.id ? 'border-focus shadow-focus' : 'hover:border-border-strong',
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-lg font-semibold">{card.label}</p>
                <span className="text-xs text-foreground-muted">{card.gigabytes.toFixed(1)} GB</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-foreground-muted">
                <span>Mastered: {card.mastered}</span>
                <span>Purge candidates: {card.purgeCandidates}</span>
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border-subtle px-4 py-2 text-xs text-foreground"
            onMouseDown={beginHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={beginHold}
            onTouchEnd={cancelHold}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Purge Processed Audio
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border-subtle px-4 py-2 text-xs text-foreground"
            onClick={bulkAddToCart}
          >
            <PlusCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Add to Cart
          </button>
        </div>
      </section>
      <section className="flex w-2/3 flex-col gap-3 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Storage Browser</h2>
          <div className="flex gap-2 text-xs">
            <button
              className="rounded-full border border-border-subtle px-3 py-1"
              onClick={() => setSelectedDirectories(new Set(directories.map((entry) => entry.id)))}
            >
              Select All
            </button>
            <button
              className="rounded-full border border-border-subtle px-3 py-1"
              onClick={() => setSelectedDirectories(new Set())}
            >
              Clear
            </button>
            <button className="rounded-full border border-border-subtle px-3 py-1" onClick={bulkAddToCart}>
              Add to Cart
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-surface-base/70">
          <Virtuoso
            className="h-full"
            data={directories}
            overscan={16}
            itemContent={(index, directory) => (
              <DirectoryRow
                key={directory.id}
                entry={directory}
                checked={selectedDirectories.has(directory.id)}
                onToggle={() => toggleDirectory(directory.id)}
                onDownload={() => pushToast({ title: 'Download scheduled', description: directory.path })}
                onDelete={() => pushToast({ title: 'Delete queued', description: directory.path })}
              />
            )}
          />
        </div>
        <div className="flex items-center justify-end gap-2 text-xs text-foreground-muted">
          <DownloadCloud className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          <span>Exports include folder hierarchy and metadata.json.</span>
        </div>
      </section>
      {undoActive ? (
        <div className="fixed bottom-6 right-6 flex items-center gap-3 rounded-full border border-border-subtle bg-surface-overlay/90 px-4 py-2 text-xs text-foreground shadow-panel">
          <span>Purge executing in 10s…</span>
          <button type="button" className="rounded-full border border-border-subtle px-3 py-1" onClick={undoPurge}>
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
};

type DirectoryRowProps = {
  entry: StorageEntry;
  checked: boolean;
  onToggle: () => void;
  onDownload: () => void;
  onDelete: () => void;
};

const DirectoryRow = ({ entry, checked, onToggle, onDownload, onDelete }: DirectoryRowProps) => (
  <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3 text-sm text-foreground last:border-b-0">
    <div className="flex items-center gap-3">
      <input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Select ${entry.path}`} />
      <div className="flex flex-col">
        <span className="font-mono text-xs">{entry.path}</span>
        <span className="text-xs text-foreground-muted">{entry.size}</span>
      </div>
    </div>
    <div className="flex items-center gap-2 text-xs">
      <button className="flex items-center gap-1 rounded-full border border-border-subtle px-3 py-1" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Delete
      </button>
      <button className="flex items-center gap-1 rounded-full border border-border-subtle px-3 py-1" onClick={onDownload}>
        <Folder className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> ZIP
      </button>
    </div>
  </div>
);
