import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import { del, get, set } from 'idb-keyval';

export type CartParallelism = 'auto' | 1 | 2 | 4;

export type TaskCartItemState = 'idle' | 'queued' | 'running' | 'success' | 'error' | 'paused';

export type TaskCartItemLogLevel = 'info' | 'warn' | 'error';

export type TaskCartItemLog = {
  id: string;
  timestamp: string;
  level: TaskCartItemLogLevel;
  message: string;
};

export type TaskCartItem = {
  id: string;
  title: string;
  action: string;
  lectureId?: string;
  params: Record<string, unknown>;
  estMs: number;
  prereqs?: string[];
  state: TaskCartItemState;
  logs: TaskCartItemLog[];
};

export type TaskCartPreset = {
  id: string;
  name: string;
  createdAt: string;
  items: TaskCartItem[];
  parallelism: CartParallelism;
  onCompletion: TaskCartState['onCompletion'];
};

export type CartCompletionMode = 'notify' | 'shutdown' | 'nothing';

type TaskCartState = {
  items: TaskCartItem[];
  presets: TaskCartPreset[];
  parallelism: CartParallelism;
  onCompletion: CartCompletionMode;
  running: boolean;
  activeBatchId?: string;
  lastRunAt?: string;
  addItem: (item: Omit<TaskCartItem, 'id' | 'state' | 'logs'> & { id?: string; state?: TaskCartItemState }) => string;
  setItems: (items: TaskCartItem[]) => void;
  removeItem: (id: string) => void;
  updateItemState: (id: string, state: TaskCartItemState) => void;
  appendItemLog: (id: string, log: Omit<TaskCartItemLog, 'id' | 'timestamp'> & { id?: string; timestamp?: string }) => void;
  clearLogs: (id: string) => void;
  toggleRunning: (running: boolean) => void;
  setParallelism: (parallelism: CartParallelism) => void;
  setOnCompletion: (mode: TaskCartState['onCompletion']) => void;
  reorder: (fromIndex: number, toIndex: number) => TaskCartItem[];
  clear: () => void;
  savePreset: (name: string) => TaskCartPreset;
  deletePreset: (presetId: string) => void;
  loadPreset: (presetId: string) => void;
  hydrateFromBatch: (batchId: string, updates: Array<Partial<TaskCartItem> & { id: string }>) => void;
  setActiveBatch: (batchId?: string) => void;
};

type StorageShape = Pick<
  TaskCartState,
  'items' | 'parallelism' | 'onCompletion' | 'presets' | 'lastRunAt' | 'activeBatchId'
>;

const idbStorage: StateStorage = {
  getItem: async (name: string) => {
    const value = await get<string | undefined>(name);
    return value ?? null;
  },
  setItem: async (name: string, value: string) => {
    await set(name, value);
  },
  removeItem: async (name: string) => {
    await del(name);
  },
};

export const useTaskCartStore = create<TaskCartState>()(
  persist(
    (set, get) => ({
      items: [],
      presets: [],
      parallelism: 'auto',
      onCompletion: 'notify',
      running: false,
      activeBatchId: undefined,
      lastRunAt: undefined,
      addItem: ({ id = nanoid(), state = 'idle', ...item }) => {
        const newItem: TaskCartItem = {
          id,
          title: item.title,
          action: item.action,
          lectureId: item.lectureId,
          params: item.params ?? {},
          estMs: item.estMs,
          prereqs: item.prereqs ?? [],
          state,
          logs: [],
        };
        set((state) => ({ items: [...state.items, newItem] }));
        return id;
      },
      setItems: (items) => set({ items }),
      removeItem: (id) => set((state) => ({ items: state.items.filter((item) => item.id !== id) })),
      updateItemState: (id, stateValue) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  state: stateValue,
                }
              : item,
          ),
        })),
      appendItemLog: (id, log) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  logs: [
                    ...item.logs,
                    {
                      id: log.id ?? nanoid(),
                      timestamp: log.timestamp ?? new Date().toISOString(),
                      level: log.level ?? 'info',
                      message: log.message,
                    },
                  ].slice(-50),
                }
              : item,
          ),
        })),
      clearLogs: (id) =>
        set((state) => ({
          items: state.items.map((item) => (item.id === id ? { ...item, logs: [] } : item)),
        })),
      toggleRunning: (running) => set({ running }),
      setParallelism: (parallelism) => set({ parallelism }),
      setOnCompletion: (onCompletion) => set({ onCompletion }),
      reorder: (fromIndex, toIndex) => {
        set((state) => {
          const updated = [...state.items];
          const [moved] = updated.splice(fromIndex, 1);
          updated.splice(toIndex, 0, moved);
          return { items: updated };
        });
        return get().items;
      },
      clear: () => set({ items: [], activeBatchId: undefined, running: false }),
      savePreset: (name) => {
        const preset: TaskCartPreset = {
          id: nanoid(),
          name,
          createdAt: new Date().toISOString(),
          items: get().items,
          parallelism: get().parallelism,
          onCompletion: get().onCompletion,
        };
        set((state) => ({ presets: [...state.presets, preset] }));
        return preset;
      },
      deletePreset: (presetId) =>
        set((state) => ({ presets: state.presets.filter((preset) => preset.id !== presetId) })),
      loadPreset: (presetId) => {
        const preset = get().presets.find((entry) => entry.id === presetId);
        if (!preset) return;
        set({
          items: preset.items.map((item) => ({ ...item, id: nanoid(), state: 'idle', logs: [] })),
          parallelism: preset.parallelism,
          onCompletion: preset.onCompletion,
          activeBatchId: undefined,
          running: false,
        });
      },
      hydrateFromBatch: (_batchId, updates) => {
        set((state) => ({
          items: state.items.map((item) => {
            const update = updates.find((entry) => entry.id === item.id);
            if (!update) return item;
            return {
              ...item,
              ...update,
              logs: update.logs ?? item.logs,
              state: (update.state as TaskCartItemState | undefined) ?? item.state,
            };
          }),
        }));
      },
      setActiveBatch: (batchId) =>
        set({
          activeBatchId: batchId,
          lastRunAt: batchId ? new Date().toISOString() : get().lastRunAt,
        }),
    }),
    {
      name: 'lecture-tools-task-cart',
      version: 2,
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        items: state.items,
        parallelism: state.parallelism,
        onCompletion: state.onCompletion,
        presets: state.presets,
        lastRunAt: state.lastRunAt,
        activeBatchId: state.activeBatchId,
      }),
      migrate: (persistedState, version) => {
        if (!persistedState) return persistedState;
        if (version < 2) {
          return {
            ...persistedState,
            items:
              (persistedState as any).items?.map((item: any) => ({
                id: item.id ?? nanoid(),
                title: item.title,
                action: item.action,
                lectureId: item.lectureId,
                params: item.params ?? {},
                estMs: (item.estimatedMinutes ?? 1) * 60_000,
                prereqs: item.prerequisites ?? [],
                state: item.status ?? 'idle',
                logs: [],
              })) ?? [],
            presets: [],
            activeBatchId: undefined,
            parallelism: 'auto',
            onCompletion: 'notify',
          } satisfies StorageShape;
        }
        return persistedState;
      },
    },
  ),
);

export const selectTaskCartItems = (state: TaskCartState) => state.items;
export const selectTaskCartPresets = (state: TaskCartState) => state.presets;
