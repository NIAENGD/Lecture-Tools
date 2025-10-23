import { useCallback, useEffect, useRef, useState } from 'react';
import * as Comlink from 'comlink';
import type {
  BulkUploadWorker,
  BulkUploadDescriptor,
  BulkUploadOptions,
  BulkUploadPlan,
} from '../workers/bulkUpload.worker';

type AnalyzeStatus = 'idle' | 'analyzing' | 'ready' | 'error';

export const useBulkUploadAnalyzer = () => {
  const workerRef = useRef<Worker | null>(null);
  const proxyRef = useRef<Comlink.Remote<BulkUploadWorker> | null>(null);
  const lastRequestRef = useRef<{
    descriptors: BulkUploadDescriptor[];
    options: BulkUploadOptions;
  } | null>(null);
  const [plan, setPlan] = useState<BulkUploadPlan | null>(null);
  const [status, setStatus] = useState<AnalyzeStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const destroyWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    proxyRef.current = null;
  }, []);

  const ensureWorker = useCallback(async () => {
    if (proxyRef.current) return proxyRef.current;
    const { default: WorkerCtor } = await import('../workers/bulkUpload.worker?worker');
    const instance = new WorkerCtor();
    workerRef.current = instance;
    proxyRef.current = Comlink.wrap<BulkUploadWorker>(instance);
    return proxyRef.current;
  }, []);

  const analyze = useCallback(
    async (files: FileList | File[], options: BulkUploadOptions) => {
      const worker = await ensureWorker();
      setStatus('analyzing');
      setError(null);
      setProgress(0);
      const descriptors: BulkUploadDescriptor[] = Array.from(files).map((file) => ({
        name: file.name,
        relativePath: 'webkitRelativePath' in file && file.webkitRelativePath ? file.webkitRelativePath : file.name,
        size: file.size,
        type: file.type,
      }));
      lastRequestRef.current = { descriptors, options };
      try {
        const result = await worker.analyze(
          descriptors,
          options,
          Comlink.proxy((value: number) => setProgress(value)),
        );
        setPlan(result);
        setStatus('ready');
        return result;
      } catch (caught: any) {
        setError(caught?.message ?? 'Failed to analyze bulk upload');
        setStatus('error');
        destroyWorker();
        throw caught;
      }
    },
    [destroyWorker, ensureWorker],
  );

  const retry = useCallback(async () => {
    if (!lastRequestRef.current) {
      throw new Error('No previous bulk upload request to retry.');
    }
    const worker = await ensureWorker();
    setStatus('analyzing');
    setError(null);
    setProgress(0);
    try {
      const result = await worker.analyze(
        lastRequestRef.current.descriptors,
        lastRequestRef.current.options,
        Comlink.proxy((value: number) => setProgress(value)),
      );
      setPlan(result);
      setStatus('ready');
      return result;
    } catch (caught: any) {
      setError(caught?.message ?? 'Failed to analyze bulk upload');
      setStatus('error');
      destroyWorker();
      throw caught;
    }
  }, [destroyWorker, ensureWorker]);

  const reset = useCallback(() => {
    setPlan(null);
    setStatus('idle');
    setProgress(0);
    setError(null);
    lastRequestRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      destroyWorker();
    };
  }, [destroyWorker]);

  return { analyze, retry, plan, status, progress, error, reset } as const;
};
