import { useState, useMemo, useEffect } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { type TaskCartItem } from '../../state/taskCart';
import { useTimelineStore } from '../../state/timeline';
import { useToastStore } from '../../state/toast';
import { apiClient, getApiBaseUrl } from '../../lib/apiClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { Pause, Play, RefreshCcw, History, ListTodo, GripVertical } from 'lucide-react';
import { useTaskCartEngine } from '../../lib/useTaskCartEngine';
import type { TaskProgress as TaskProgressModel } from '@lecturetools/api';
import { loadMockTaskProgress } from '../../lib/mockData';

const statusFilters = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'failed', label: 'Failed' },
  { id: 'completed', label: 'Completed' },
];

type TaskProgress = TaskProgressModel;

export const TasksView = () => {
  const pushToast = useToastStore((state) => state.pushToast);
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [filter, setFilter] = useState<'all' | 'running' | 'failed' | 'completed'>('all');
  const timelineEvents = useTimelineStore((state) => state.events);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const fallbackTasks = useMemo(() => loadMockTaskProgress(), []);
  const { data } = useTasksQuery(fallbackTasks);
  const [tab, setTab] = useState<'live' | 'cart'>('live');
  const cart = useTaskCartEngine();

  const filteredTasks = useMemo(() => {
    const tasks = data?.tasks ?? fallbackTasks;
    if (filter === 'all') return tasks;
    return tasks.filter((task) => task.status === filter);
  }, [data?.tasks, filter]);

  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) return;
    const source = new EventSource(`${baseUrl}/api/progress/stream`);
    source.onmessage = (event) => {
      try {
        const parsed: TaskProgress = JSON.parse(event.data);
        queryClient.setQueryData<{ tasks: TaskProgress[] }>(['tasks-progress'], (current) => {
          const existing = current?.tasks ?? [];
          const next = existing.some((task) => task.id === parsed.id)
            ? existing.map((task) => (task.id === parsed.id ? parsed : task))
            : [parsed, ...existing].slice(0, 200);
          return { tasks: next };
        });
      } catch (error) {
        console.error('Failed to parse SSE payload', error);
      }
    };
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [queryClient]);

  const handleCartReorder = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = cart.items.findIndex((item) => item.id === event.active.id);
    const newIndex = cart.items.findIndex((item) => item.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    cart.reorder(oldIndex, newIndex);
    pushToast({ title: 'Cart reordered', description: 'Sequence updated for next run.' });
  };

  return (
    <div className="flex h-full w-full gap-4">
      <section className="flex w-2/3 flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListTodo className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            <div>
              <h2 className="text-base font-semibold text-foreground">Live Operations</h2>
              <p className="text-xs text-foreground-muted">Virtualized monitoring with instant filters.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {statusFilters.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilter(option.id as typeof filter)}
                className={clsx(
                  'rounded-full border border-border-subtle px-3 py-1 transition-colors',
                  filter === option.id ? 'border-focus text-foreground' : 'text-foreground-secondary hover:border-border-strong',
                )}
              >
                {option.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setViewMode((mode) => (mode === 'list' ? 'timeline' : 'list'))}
              className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1"
            >
              {viewMode === 'list' ? (
                <>
                  <History className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Timeline
                </>
              ) : (
                <>
                  <ListTodo className="h-4 w-4" strokeWidth={1.5} aria-hidden /> List
                </>
              )}
            </button>
          </div>
        </header>
        {viewMode === 'list' ? (
          <div className="flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-surface-base/70">
            <Virtuoso
              className="h-full"
              data={filteredTasks}
              overscan={24}
              itemContent={(index, task) => (
                <article className="flex items-center justify-between border-b border-border-subtle px-4 py-3 text-sm text-foreground last:border-b-0">
                  <div>
                    <p className="font-semibold">{task.title}</p>
                    <p className="text-xs text-foreground-muted">Status: {task.status}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="min-w-[48px] text-right font-mono text-foreground-secondary">{task.progress}%</span>
                    <button className="rounded-full border border-border-subtle px-3 py-1" onClick={() => pushToast({ title: 'Open task', description: task.title })}>
                      Open
                    </button>
                    <button className="rounded-full border border-border-subtle px-3 py-1" onClick={() => pushToast({ title: 'Retry queued', description: task.title })}>
                      Retry
                    </button>
                    <button className="rounded-full border border-border-subtle px-3 py-1" onClick={() => pushToast({ title: 'Dismissed', description: task.title })}>
                      Dismiss
                    </button>
                  </div>
                </article>
              )}
            />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-surface-base/70 p-4">
            <ul className="flex h-full flex-col gap-3 overflow-y-auto pr-2 text-sm text-foreground">
              {timelineEvents.map((event) => (
                <li key={event.id} className="flex items-center justify-between rounded-xl border border-border-subtle bg-surface-subtle/70 px-4 py-3">
                  <div>
                    <p className="font-semibold">{event.title}</p>
                    <p className="text-xs text-foreground-muted">{new Date(event.timestamp).toLocaleTimeString()}</p>
                  </div>
                  <span className="rounded-full border border-border-subtle px-2 py-1 text-[11px] text-foreground-muted">{event.status}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section className="flex w-1/3 flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center gap-3 text-sm">
          <button
            type="button"
            onClick={() => setTab('live')}
            className={clsx(
              'rounded-full border border-border-subtle px-3 py-1',
              tab === 'live' ? 'border-focus text-foreground' : 'text-foreground-secondary hover:border-border-strong',
            )}
          >
            Tasks
          </button>
          <button
            type="button"
            onClick={() => setTab('cart')}
            className={clsx(
              'rounded-full border border-border-subtle px-3 py-1',
              tab === 'cart' ? 'border-focus text-foreground' : 'text-foreground-secondary hover:border-border-strong',
            )}
          >
            Cart ({cart.items.length})
          </button>
        </header>
        {tab === 'live' ? (
          <div className="flex flex-1 flex-col gap-3">
            <h3 className="text-sm font-semibold text-foreground">Timeline Summary</h3>
            <div className="space-y-3 overflow-y-auto pr-2 text-sm text-foreground">
              {timelineEvents.slice(0, 25).map((event) => (
                <article key={event.id} className="rounded-2xl border border-border-subtle bg-surface-base/70 px-4 py-3">
                  <header className="flex items-center justify-between text-xs text-foreground-muted">
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                    <span>{event.status}</span>
                  </header>
                  <p className="pt-1 text-sm font-semibold text-foreground">{event.title}</p>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-foreground">
                <button
                  type="button"
                  onClick={() => (cart.running ? cart.pause() : cart.run())}
                  className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1"
                >
                  {cart.running ? (
                    <>
                      <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Run
                    </>
                  )}
                </button>
                <select
                  value={cart.parallelism}
                  onChange={(event) =>
                    cart.setParallelism(event.target.value === 'auto' ? 'auto' : (Number(event.target.value) as 1 | 2 | 4))
                  }
                  className="h-9 rounded-full border border-border-subtle bg-surface-base px-3 text-xs text-foreground"
                >
                  <option value="auto">Parallel: Auto</option>
                  <option value="1">Parallel: 1</option>
                  <option value="2">Parallel: 2</option>
                  <option value="4">Parallel: 4</option>
                </select>
                <select
                  value={cart.onCompletion}
                  onChange={(event) => cart.setOnCompletion(event.target.value as typeof cart.onCompletion)}
                  className="h-9 rounded-full border border-border-subtle bg-surface-base px-3 text-xs text-foreground"
                >
                  <option value="notify">Notify</option>
                  <option value="shutdown">Shutdown</option>
                  <option value="nothing">Nothing</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => cart.dryRun()}
                className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1 text-xs"
              >
                <RefreshCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Dry Run
              </button>
            </div>
            <div className="flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-surface-base/70">
              <DndContext sensors={sensors} onDragEnd={handleCartReorder}>
                  <SortableContext items={cart.items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                    <Virtuoso
                      className="h-full"
                      data={cart.items}
                      itemContent={(index, item) => (
                        <SortableCartRow key={item.id} item={item} remove={cart.removeItem} />
                      )}
                    />
                  </SortableContext>
                </DndContext>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

const useTasksQuery = (fallback: TaskProgress[]) => {
  const enabled = Boolean(getApiBaseUrl());
  return useQuery<{ tasks: TaskProgress[] }>({
    queryKey: ['tasks-progress'],
    enabled,
    queryFn: async () => {
      if (!enabled) {
        return { tasks: fallback };
      }
      const response = await apiClient.tasks.getProgress();
      return { tasks: response.tasks as TaskProgress[] };
    },
    initialData: { tasks: fallback },
    refetchInterval: 15000,
  });
};

type SortableCartRowProps = {
  item: TaskCartItem;
  remove: (id: string) => void;
};

const SortableCartRow = ({ item, remove }: SortableCartRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx('border-b border-border-subtle px-3 py-3 text-sm text-foreground last:border-b-0', isDragging && 'opacity-60')}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-surface-subtle text-foreground-muted"
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        </button>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="text-xs text-foreground-muted">{item.action}</p>
            </div>
            <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase text-foreground-muted">{item.state}</span>
          </div>
          {item.prereqs?.length ? (
            <ul className="list-disc space-y-1 pl-4 text-xs text-foreground-muted">
              {item.prereqs.map((requirement: string) => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full border border-border-subtle px-2 py-0.5 text-foreground-muted">{Math.max(1, Math.round((item.estMs ?? 0) / 60000))}m</span>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="rounded-full border border-border-subtle px-3 py-1 text-foreground-secondary transition-colors hover:border-brand-danger hover:text-brand-danger"
            >
              Remove
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
