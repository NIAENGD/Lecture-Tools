import { useEffect, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient, getApiBaseUrl } from './apiClient';
import {
  useTaskCartStore,
  type TaskCartItemState,
  type TaskCartItem,
  type TaskCartItemLog,
} from '../state/taskCart';
import { useToastStore } from '../state/toast';

type RunOptions = {
  dryRun?: boolean;
  presetName?: string;
};

type ControlOptions = {
  command: 'pause' | 'resume' | 'cancel';
};

type StreamEvent = {
  itemId?: string;
  state?: TaskCartItemState;
  message?: string;
  level?: 'info' | 'warn' | 'error';
  estMs?: number;
  prereqs?: string[];
  batchState?: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
};

export const useTaskCartEngine = (options: { subscribe?: boolean } = {}) => {
  const subscribe = options.subscribe ?? true;
  const baseUrl = getApiBaseUrl();
  const pushToast = useToastStore((state) => state.pushToast);
  const {
    items,
    parallelism,
    onCompletion,
    running,
    toggleRunning,
    setParallelism,
    setOnCompletion,
    appendItemLog,
    updateItemState,
    setActiveBatch,
    activeBatchId,
    hydrateFromBatch,
    reorder,
    savePreset,
    deletePreset,
    loadPreset,
    setItems,
    removeItem,
  } = useTaskCartStore();

  const hasApi = Boolean(baseUrl);

  const runMutation = useMutation({
    mutationKey: ['task-cart', 'run'],
    mutationFn: async (options: RunOptions) => {
      if (!items.length) {
        throw new Error('Add at least one task to run.');
      }
      if (!hasApi) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return { id: 'local-batch', accepted: items.length, status: options.dryRun ? 'paused' : 'running' } as const;
      }
      const payload = {
        parallelism,
        onCompletion,
        tasks: items.map((item) => ({
          id: item.id,
          action: item.action,
          lectureId: item.lectureId ?? item.id,
          options: item.params,
        })),
        dryRun: options.dryRun,
        presetName: options.presetName,
      };
      return apiClient.tasks.enqueueBatch(payload);
    },
    onSuccess: (response, variables) => {
      if (variables?.dryRun) {
        pushToast({
          title: 'Dry run successful',
          description: `${response.accepted} tasks validated with no execution.`,
        });
        return;
      }
      toggleRunning(true);
      setActiveBatch(response.id);
      pushToast({
        title: 'Cart running',
        description: `${response.accepted} tasks queued for execution.`,
      });
      if (!hasApi) {
        simulateLocalProgress(items, updateItemState, appendItemLog, toggleRunning, setActiveBatch);
      }
    },
    onError: (error: any) => {
      toggleRunning(false);
      pushToast({
        title: 'Cart failed to run',
        description: error?.message ?? 'Unknown error while scheduling tasks.',
        tone: 'error',
      });
    },
  });

  const controlMutation = useMutation({
    mutationKey: ['task-cart', 'control'],
    mutationFn: async ({ command }: ControlOptions) => {
      if (!activeBatchId) {
        throw new Error('No active batch to control.');
      }
      if (!hasApi) {
        return { id: activeBatchId, accepted: items.length, status: command === 'pause' ? 'paused' : 'running' } as const;
      }
      return apiClient.tasks.updateBatch(activeBatchId, { command });
    },
    onSuccess: (response, variables) => {
      if (variables.command === 'pause') {
        toggleRunning(false);
        pushToast({ title: 'Batch paused', description: 'Execution paused; resume when ready.' });
      } else if (variables.command === 'resume') {
        toggleRunning(true);
        pushToast({ title: 'Batch resumed', description: 'Tasks are running again.' });
      } else {
        toggleRunning(false);
        setActiveBatch(undefined);
        pushToast({ title: 'Batch cancelled', description: 'Pending tasks were cancelled.' });
      }
      if (!hasApi) {
        hydrateFromBatch(response.id, items.map((item) => ({ id: item.id, state: variables.command === 'pause' ? 'paused' : 'idle' })));
      }
    },
    onError: (error: any) => {
      pushToast({
        title: 'Cart control failed',
        description: error?.message ?? 'Unable to update batch state.',
        tone: 'error',
      });
    },
  });

  const reorderMutation = useMutation({
    mutationKey: ['task-cart', 'reorder'],
    mutationFn: async (order: string[]) => {
      if (!activeBatchId || !hasApi) return null;
      return apiClient.tasks.reorderBatch(activeBatchId, order);
    },
  });

  const syncLogsMutation = useMutation({
    mutationKey: ['task-cart', 'logs'],
    mutationFn: async (batchId: string) => {
      if (!hasApi) return [] as const;
      const response = await apiClient.tasks.fetchBatchLogs(batchId);
      response.entries.forEach((entry) => {
        appendItemLog(entry.itemId, {
          id: entry.id,
          timestamp: entry.timestamp,
          level: entry.level ?? 'info',
          message: entry.message,
        });
        if (entry.state) {
          updateItemState(entry.itemId, entry.state as TaskCartItemState);
        }
      });
      return response.entries;
    },
  });

  useEffect(() => {
    if (!subscribe || !activeBatchId || !hasApi) return;
    syncLogsMutation.mutate(activeBatchId);
    const source = new EventSource(`${baseUrl}/api/tasks/batch/${activeBatchId}/stream`);
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as StreamEvent;
        if (parsed.itemId) {
          if (parsed.message) {
            appendItemLog(parsed.itemId, {
              message: parsed.message,
              level: parsed.level ?? 'info',
            });
          }
          if (parsed.state) {
            updateItemState(parsed.itemId, parsed.state);
          }
        }
        if (parsed.batchState === 'completed') {
          toggleRunning(false);
          setActiveBatch(undefined);
          pushToast({ title: 'Batch complete', description: 'All queued tasks finished successfully.' });
        }
        if (parsed.estMs && parsed.itemId) {
          hydrateFromBatch(activeBatchId, [{ id: parsed.itemId, estMs: parsed.estMs } as Partial<TaskCartItem> & { id: string }]);
        }
      } catch (error) {
        console.error('Failed to parse cart stream payload', error);
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [subscribe, activeBatchId, hasApi, appendItemLog, updateItemState, toggleRunning, setActiveBatch, baseUrl, pushToast, hydrateFromBatch, syncLogsMutation]);

  const orderIds = useMemo(() => items.map((item) => item.id), [items]);

  useEffect(() => {
    if (!subscribe || !activeBatchId || !hasApi) return;
    reorderMutation.mutate(orderIds);
  }, [subscribe, orderIds, reorderMutation, hasApi, activeBatchId]);

  return {
    items,
    running,
    parallelism,
    onCompletion,
    activeBatchId,
    run: (options?: RunOptions) => runMutation.mutate(options ?? {}),
    dryRun: () => runMutation.mutate({ dryRun: true }),
    pause: () => controlMutation.mutate({ command: 'pause' }),
    resume: () => controlMutation.mutate({ command: 'resume' }),
    cancel: () => controlMutation.mutate({ command: 'cancel' }),
    setParallelism,
    setOnCompletion,
    setItems,
    removeItem,
    savePreset,
    deletePreset,
    loadPreset,
    reorder,
    appendItemLog,
    updateItemState,
    toggleRunning,
    runPending: runMutation.isPending,
    controlPending: controlMutation.isPending,
    reorderPending: reorderMutation.isPending,
  };
};

const simulateLocalProgress = (
  items: TaskCartItem[],
  updateItemState: (id: string, state: TaskCartItemState) => void,
  appendItemLog: (
    id: string,
    log: Omit<TaskCartItemLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string },
  ) => void,
  toggleRunning: (running: boolean) => void,
  setActiveBatch: (batchId?: string) => void,
) => {
  items.forEach((item, index) => {
    setTimeout(() => {
      updateItemState(item.id, 'running');
      appendItemLog(item.id, { message: 'Processing locally (demo mode)...', level: 'info' });
      setTimeout(() => {
        updateItemState(item.id, 'success');
        appendItemLog(item.id, { message: 'Completed locally', level: 'info' });
        if (index === items.length - 1) {
          toggleRunning(false);
          setActiveBatch(undefined);
        }
      }, Math.min(3000, item.estMs ?? 1200));
    }, index * 500);
  });
};
