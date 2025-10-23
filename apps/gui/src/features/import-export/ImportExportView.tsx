import { useState } from 'react';
import { UploadCloud, DownloadCloud, AlertTriangle, Clock } from 'lucide-react';
import { useToastStore } from '../../state/toast';
import { apiClient, getApiBaseUrl } from '../../lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';

const assetOptions = ['metadata.json', 'Transcripts', 'Slides', 'Audio'];
const conflictFallback = [
  { id: 'conf-1', path: '/classes/neuro401/module3', resolution: 'Merge' },
  { id: 'conf-2', path: '/classes/neuro401/module4', resolution: 'Replace' },
];

export const ImportExportView = () => {
  const pushToast = useToastStore((state) => state.pushToast);
  const [exportScope, setExportScope] = useState<'selection' | 'class' | 'all'>('selection');
  const [exportAssets, setExportAssets] = useState(() => new Set(assetOptions));
  const [flatten, setFlatten] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [mergeStrategy, setMergeStrategy] = useState<'merge' | 'replace'>('merge');
  const [wipeStorage, setWipeStorage] = useState(false);
  const [dryRun, setDryRun] = useState(false);
  const { data: conflicts } = useConflictQuery(dryRun);

  const toggleAsset = (asset: string) => {
    setExportAssets((prev) => {
      const next = new Set(prev);
      if (next.has(asset)) {
        next.delete(asset);
      } else {
        next.add(asset);
      }
      return next;
    });
  };

  const buildExport = () => {
    setExportProgress(0);
    const timer = window.setInterval(() => {
      setExportProgress((prev) => {
        const next = Math.min(100, (prev ?? 0) + 20);
        if (next === 100) {
          window.clearInterval(timer);
          pushToast({ title: 'Export ready', description: 'Archive available for download.' });
        }
        return next;
      });
    }, 500);
  };

  const runDryRun = () => {
    setDryRun(true);
    pushToast({ title: 'Dry run started', description: 'Scanning archive for conflicts.' });
  };

  return (
    <div className="flex h-full w-full gap-4">
      <section className="flex w-1/2 flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Export</h2>
          <button
            className="rounded-full border border-border-subtle px-3 py-1 text-xs"
            onClick={buildExport}
          >
            Build ZIP
          </button>
        </header>
        <div className="space-y-3 text-sm text-foreground">
          <label className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-base/70 p-4">
            <span className="text-xs text-foreground-muted">Scope</span>
            <select
              value={exportScope}
              onChange={(event) => setExportScope(event.target.value as typeof exportScope)}
              className="h-12 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm"
            >
              <option value="selection">Current Selection</option>
              <option value="class">Class</option>
              <option value="all">Everything</option>
            </select>
          </label>
          <div className="rounded-2xl border border-border-subtle bg-surface-base/70 p-4 text-xs">
            <p className="font-semibold text-foreground">Assets Included</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {assetOptions.map((item) => (
                <label key={item} className="flex items-center gap-2">
                  <input type="checkbox" checked={exportAssets.has(item)} onChange={() => toggleAsset(item)} />
                  <span>{item}</span>
                </label>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={flatten} onChange={() => setFlatten((value) => !value)} />
              <span>Flatten structure</span>
            </label>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-base/70 p-4 text-xs text-foreground-muted">
            <DownloadCloud className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            <span>
              {exportProgress === null
                ? 'Result: Single ZIP with preserved hierarchy.'
                : `Building… ${exportProgress}%`}
            </span>
          </div>
        </div>
      </section>
      <section className="flex w-1/2 flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Import</h2>
          <div className="flex gap-2 text-xs">
            <button className="rounded-full border border-border-subtle px-3 py-1" onClick={runDryRun}>
              Dry Run
            </button>
            <button className="rounded-full border border-border-subtle px-3 py-1" onClick={() => pushToast({ title: 'Import committed', description: 'Archive merged successfully.' })}>
              Commit
            </button>
          </div>
        </header>
        <div className="space-y-3 text-sm text-foreground">
          <label className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-base/70 p-4">
            <span className="text-xs text-foreground-muted">Upload Archive</span>
            <button className="flex h-12 items-center justify-center gap-2 rounded-lg border border-border-subtle">
              <UploadCloud className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Choose file
            </button>
          </label>
          <div className="rounded-2xl border border-border-subtle bg-surface-base/70 p-4 text-xs">
            <p className="font-semibold text-foreground">Merge Strategy</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {['merge', 'replace'].map((action) => (
                <button
                  key={action}
                  type="button"
                  onClick={() => setMergeStrategy(action as typeof mergeStrategy)}
                  className={clsx(
                    'h-12 rounded-lg border border-border-subtle',
                    mergeStrategy === action ? 'border-focus shadow-focus' : 'hover:border-border-strong',
                  )}
                >
                  {action === 'merge' ? 'Merge' : 'Replace'}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2">
              <input type="checkbox" checked={wipeStorage} onChange={() => setWipeStorage((value) => !value)} />
              <span>Wipe Storage before import</span>
            </label>
          </div>
          <div className="rounded-2xl border border-border-subtle bg-surface-base/70 p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground">Conflicts</span>
              <span className="flex items-center gap-2 text-foreground-muted">
                <Clock className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                {dryRun ? 'Dry run results' : 'Run dry run to inspect'}
              </span>
            </div>
            <ul className="mt-3 space-y-2">
              {(conflicts ?? conflictFallback).map((conflict) => (
                <li key={conflict.id} className="flex items-center justify-between rounded-lg border border-border-subtle px-3 py-2">
                  <div className="flex items-center gap-2 text-xs">
                    <AlertTriangle className="h-4 w-4 text-brand-warning" strokeWidth={1.5} aria-hidden />
                    <span className="font-mono text-foreground">{conflict.path}</span>
                  </div>
                  <button className="rounded-full border border-border-subtle px-3 py-1 text-xs">
                    {conflict.resolution}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
};

const useConflictQuery = (enabled: boolean) => {
  const active = enabled && Boolean(getApiBaseUrl());
  return useQuery({
    queryKey: ['import-conflicts'],
    enabled: active,
    queryFn: async () => {
      await apiClient.storage.getUsage();
      return conflictFallback;
    },
  });
};
