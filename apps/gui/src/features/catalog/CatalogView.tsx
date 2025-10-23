import { useMemo, useState, useEffect, useRef, useCallback, type ChangeEvent } from 'react';
import {
  ChevronRight,
  FolderTree,
  Search as SearchIcon,
  UploadCloud,
  GripVertical,
  Edit3,
  Save,
  X,
  Copy,
  Trash2,
  FileAudio,
  FileText,
  FileImage,
  FileType2,
  Wand2,
  Sparkles,
} from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { useSelectionStore } from '../../state/selection';
import { useTaskCartStore } from '../../state/taskCart';
import { useToastStore } from '../../state/toast';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { apiClient, getApiBaseUrl } from '../../lib/apiClient';
import type { CatalogBulkEditPayload } from '@lecturetools/api';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useBulkUploadAnalyzer } from '../../lib/useBulkUploadAnalyzer';
import type { BulkUploadPlanItem } from '../../workers/bulkUpload.worker';
import { loadMockCurriculumNodes } from '../../lib/mockData';
import { useTranslation } from 'react-i18next';

const assetPalette = [
  { id: 'audio', label: 'Audio', icon: FileAudio },
  { id: 'mastered', label: 'Mastered', icon: Wand2 },
  { id: 'slides', label: 'Slides', icon: FileImage },
  { id: 'previews', label: 'Slide Previews', icon: FileType2 },
  { id: 'transcript', label: 'Transcript', icon: FileText },
  { id: 'notes', label: 'Notes', icon: Sparkles },
];

const depthPadding = ['pl-0', 'pl-3', 'pl-6', 'pl-9', 'pl-12', 'pl-16', 'pl-20', 'pl-24'];

type CurriculumNode = {
  id: string;
  title: string;
  type: 'class' | 'module' | 'lecture';
  depth: number;
  count: number;
  description?: string;
  parentId?: string;
};

const buildMockTree = (): CurriculumNode[] =>
  loadMockCurriculumNodes().map((node) => ({ ...node }));

const detailSchema = z.object({
  title: z.string().min(1),
  description: z.string().max(2000).optional(),
});

type DetailForm = z.infer<typeof detailSchema>;

const bulkEditSchema = z.object({
  prefix: z.string().optional(),
  moduleId: z.string().optional(),
  tag: z.string().optional(),
});

type BulkEditForm = z.infer<typeof bulkEditSchema>;

const defaultBulkOptions = {
  autoMaster: true,
  autoTranscribe: true,
  autoSlides: false,
  preferCpu: false,
};

const useCurriculumQuery = (fallback: CurriculumNode[]) => {
  const enabled = Boolean(getApiBaseUrl());
  return useQuery({
    queryKey: ['catalog-tree'],
    enabled,
    queryFn: async () => {
      if (!enabled) return fallback;
      const classes = await apiClient.catalog.listClasses();
      const modulesByClass = await Promise.all(
        classes.classes.map(async (klass) => ({
          classId: klass.id,
          modules: await apiClient.catalog.listModules(klass.id),
        })),
      );
      const lectures = await Promise.all(
        modulesByClass.flatMap((entry) =>
          entry.modules.modules.map(async (module) => ({
            moduleId: module.id,
            lectures: await apiClient.catalog.listLectures(module.id),
          })),
        ),
      );
      const flattened: CurriculumNode[] = [];
      classes.classes.forEach((klass) => {
        flattened.push({
          id: klass.id,
          title: klass.title,
          type: 'class',
          depth: 0,
          count: klass.moduleCount,
          description: `${klass.lectureCount} lectures`,
        });
        const modulePayload = modulesByClass.find((entry) => entry.classId === klass.id)?.modules.modules ?? [];
        modulePayload.forEach((module) => {
          flattened.push({
            id: module.id,
            parentId: klass.id,
            title: module.title,
            type: 'module',
            depth: 1,
            count: module.lectureCount,
            description: `${module.lectureCount} lectures`,
          });
          const lecturePayload = lectures.find((entry) => entry.moduleId === module.id)?.lectures.lectures ?? [];
          lecturePayload.forEach((lecture) => {
            flattened.push({
              id: lecture.id,
              parentId: module.id,
              title: lecture.title,
              type: 'lecture',
              depth: 2,
              count: lecture.assetCount,
              description: `${lecture.duration} min · ${lecture.assetCount} assets`,
            });
          });
        });
      });
      return flattened.length ? flattened : fallback;
    },
    initialData: fallback,
  });
};

export const CatalogView = () => {
  const { t } = useTranslation();
  const fallbackTree = useMemo(() => buildMockTree(), []);
  const { data } = useCurriculumQuery(fallbackTree);
  const [nodes, setNodes] = useState<CurriculumNode[]>(data ?? fallbackTree);
  const [selectedId, setSelectedId] = useState(nodes[0]?.id ?? '');
  const [treeFilter, setTreeFilter] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [bulkSheetOpen, setBulkSheetOpen] = useState(false);
  const [bulkOptions, setBulkOptions] = useState(defaultBulkOptions);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const { analyze, retry: retryBulk, plan: bulkPlan, status: bulkStatus, progress: bulkProgress, error: bulkError, reset: resetBulk } =
    useBulkUploadAnalyzer();
  const [dragActive, setDragActive] = useState(false);
  const toggleSelection = useSelectionStore((state) => state.toggle);
  const selectionMap = useSelectionStore((state) => state.selections);
  const pushToast = useToastStore((state) => state.pushToast);
  const addCartItem = useTaskCartStore((state) => state.addItem);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const selectedNode = useMemo(() => nodes.find((node) => node.id === selectedId) ?? nodes[0], [nodes, selectedId]);
  const [editing, setEditing] = useState(false);
  const form = useForm<DetailForm>({
    resolver: zodResolver(detailSchema),
    defaultValues: {
      title: selectedNode?.title ?? '',
      description: selectedNode?.description ?? '',
    },
  });
  const bulkForm = useForm<BulkEditForm>({
    resolver: zodResolver(bulkEditSchema),
    defaultValues: { prefix: '', moduleId: '', tag: '' },
  });
  const selectedLectures = selectionMap.lecture ?? [];
  const moduleOptions = useMemo(() => nodes.filter((node) => node.type === 'module'), [nodes]);
  const bulkEditMutation = useMutation({
    mutationFn: async (payload: CatalogBulkEditPayload) => {
      if (!getApiBaseUrl()) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return { updated: payload.ids.length } as const;
      }
      return apiClient.catalog.bulkUpdate(payload);
    },
    onMutate: async (payload) => {
      const previous = nodes;
      setNodes((current) =>
        current.map((node) => {
          if (!payload.ids.includes(node.id)) return node;
          const nextTitle = payload.updates.title
            ? payload.updates.title
            : payload.updates.titlePrefix
              ? `${payload.updates.titlePrefix}${node.title}`
              : node.title;
          return {
            ...node,
            title: nextTitle,
            parentId: payload.updates.moduleId ?? node.parentId,
          };
        }),
      );
      return { previous };
    },
    onError: (error: any, _payload, context) => {
      if (context?.previous) {
        setNodes(context.previous);
      }
      pushToast({
        title: 'Bulk edit failed',
        description: error?.message ?? 'Changes rolled back.',
        tone: 'error',
      });
    },
    onSuccess: (response) => {
      pushToast({ title: 'Bulk edit applied', description: `${response.updated} entries updated.` });
      bulkForm.reset({ prefix: '', moduleId: '', tag: '' });
    },
  });

  useEffect(() => {
    if (!data) return;
    setNodes(data);
    const exists = data.some((node) => node.id === selectedId);
    if (!exists && data.length) {
      setSelectedId(data[0].id);
    }
  }, [data, selectedId]);

  useEffect(() => {
    form.reset({
      title: selectedNode?.title ?? '',
      description: selectedNode?.description ?? '',
    });
  }, [form, selectedNode]);

  const filteredNodes = useMemo(() => {
    if (!treeFilter.trim()) return nodes;
    const lower = treeFilter.toLowerCase();
    return nodes.filter((node) => node.title.toLowerCase().includes(lower));
  }, [nodes, treeFilter]);

  const handleBulkFiles = useCallback(
    async (fileList: FileList | File[] | null) => {
      if (!fileList || !fileList.length) return;
      const array = Array.from(fileList as Iterable<File>);
      setBulkFiles(array);
      setBulkSheetOpen(true);
      try {
        await analyze(array, bulkOptions);
      } catch (error: any) {
        pushToast({
          title: 'Bulk analysis failed',
          description: error?.message ?? 'Unable to map dropped files.',
          tone: 'error',
        });
      }
    },
    [analyze, bulkOptions, pushToast],
  );

  const handleFileInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      handleBulkFiles(event.target.files);
      event.target.value = '';
    },
    [handleBulkFiles],
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragActive(false);
      handleBulkFiles(event.dataTransfer?.files ?? null);
    },
    [handleBulkFiles],
  );

  const closeBulkSheet = useCallback(() => {
    setBulkSheetOpen(false);
    setBulkFiles([]);
    resetBulk();
  }, [resetBulk]);

  const clearBulkAnalysis = useCallback(() => {
    setBulkFiles([]);
    resetBulk();
  }, [resetBulk]);

  const toggleBulkOption = useCallback(
    (key: keyof typeof bulkOptions) => {
      setBulkOptions((previous) => {
        const next = { ...previous, [key]: !previous[key] };
        if (bulkFiles.length && bulkStatus !== 'analyzing') {
          analyze(bulkFiles, next).catch((error) => {
            console.error('Failed to refresh bulk mapping', error);
          });
        }
        return next;
      });
    },
    [analyze, bulkFiles, bulkStatus],
  );

  const retryBulkAnalysis = useCallback(() => {
    retryBulk().catch((error: any) => {
      pushToast({
        title: 'Retry failed',
        description: error?.message ?? 'Unable to re-run bulk analysis.',
        tone: 'error',
      });
    });
  }, [pushToast, retryBulk]);

  const commitBulkUpload = useCallback(() => {
    if (!bulkPlan) return;
    bulkPlan.items.forEach((item) => {
      addCartItem({
        title: `${item.lectureName} · ${item.assetType}`,
        action: 'Bulk Upload',
        lectureId: item.lectureName,
        params: {
          relativePath: item.relativePath,
          className: item.className,
          moduleName: item.moduleName,
          autoMaster: bulkPlan.options.autoMaster,
          autoTranscribe: bulkPlan.options.autoTranscribe,
          autoSlides: bulkPlan.options.autoSlides,
          preferCpu: bulkPlan.options.preferCpu,
        },
        estMs: estimateBulkUploadMs(item, bulkPlan.options),
        prereqs: [item.className, item.moduleName].filter(Boolean),
      });
    });
    pushToast({
      title: 'Bulk upload staged',
      description: `${bulkPlan.items.length} assets queued in Task Cart.`,
      tone: 'success',
    });
    closeBulkSheet();
  }, [addCartItem, bulkPlan, closeBulkSheet, pushToast]);

  const handleBulkSubmit = bulkForm.handleSubmit((values) => {
    if (!selectedLectures.length) {
      pushToast({
        title: 'No lectures selected',
        description: 'Select lectures from the tree before applying bulk edits.',
        tone: 'warning',
      });
      return;
    }
    const payload: CatalogBulkEditPayload = {
      ids: selectedLectures,
      updates: {
        ...(values.prefix ? { titlePrefix: values.prefix } : {}),
        ...(values.moduleId ? { moduleId: values.moduleId } : {}),
        ...(values.tag ? { tags: [values.tag] } : {}),
      },
    };
    bulkEditMutation.mutate(payload);
  });

  const prefixValue = bulkForm.watch('prefix');
  const targetModuleId = bulkForm.watch('moduleId');
  const targetModuleName = useMemo(
    () => moduleOptions.find((module) => module.id === targetModuleId)?.title ?? null,
    [moduleOptions, targetModuleId],
  );

  const bulkPreview = useMemo(
    () =>
      selectedLectures
        .map((id) => {
          const node = nodes.find((entry) => entry.id === id);
          if (!node) return null;
          const after = prefixValue ? `${prefixValue}${node.title}` : node.title;
          return { id, before: node.title, after };
        })
        .filter(Boolean) as { id: string; before: string; after: string }[],
    [selectedLectures, nodes, prefixValue],
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = nodes.findIndex((node) => node.id === event.active.id);
    const newIndex = nodes.findIndex((node) => node.id === event.over?.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const updated = arrayMove(nodes, oldIndex, newIndex);
    setNodes(updated);
    pushToast({ title: 'Order updated', description: 'Changes synced to catalog.' });
  };

  const handleSubmit = form.handleSubmit((values) => {
    setNodes((prev) =>
      prev.map((node) =>
        node.id === selectedNode?.id
          ? { ...node, title: values.title, description: values.description ?? '' }
          : node,
      ),
    );
    pushToast({ title: 'Details saved', description: `${values.title} updated.` });
    setEditing(false);
  });

  const assetAction = (action: string, asset: string) => {
    addCartItem({
      title: `${action} ${asset}`,
      action,
      lectureId: selectedNode?.id,
      params: { asset, targetId: selectedNode?.id },
      estMs: estimateAssetMs(action, asset),
      prereqs: selectedNode ? [selectedNode.title] : [],
    });
    pushToast({ title: `${action} queued`, description: `${asset} moved to Task Cart.` });
  };

  return (
    <>
      <input
        ref={(node) => {
          fileInputRef.current = node;
          if (node) {
            node.setAttribute('webkitdirectory', 'true');
          }
        }}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <div className="flex h-full w-full gap-4">
        <section
        className={clsx(
          'flex w-[24%] min-w-[280px] flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4 transition-shadow',
          dragActive && 'border-focus shadow-focus',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        data-help-id="catalog-pane-a"
        data-help-title={t('helpOverlay.catalogPaneA.title')}
        data-help-description={t('helpOverlay.catalogPaneA.body')}
      >
        <header className="flex items-center gap-3">
          <FolderTree className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-foreground">Curriculum</h2>
            <p className="text-xs text-foreground-muted">Two taps to select, drag to reorder, bulk-first.</p>
          </div>
        </header>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
          <input
            type="search"
            value={treeFilter}
            onChange={(event) => setTreeFilter(event.target.value)}
            placeholder="Search classes, modules, lectures"
            className="h-11 w-full rounded-lg border border-border-subtle bg-surface-base pl-9 pr-3 text-sm text-foreground outline-none focus:border-focus focus:shadow-focus"
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button className="rounded-full border border-border-subtle px-3 py-1">Create Class</button>
          <button className="rounded-full border border-border-subtle px-3 py-1">Create Module</button>
          <button className="rounded-full border border-border-subtle px-3 py-1">Create Lecture</button>
          <button
            className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <UploadCloud className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            Bulk Upload
          </button>
        </div>
        <div className="flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-surface-base/60">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext items={filteredNodes.map((node) => node.id)} strategy={verticalListSortingStrategy}>
              <Virtuoso
                className="h-full"
                data={filteredNodes}
                overscan={20}
                itemContent={(index, node) => (
                  <SortableNode
                    key={node.id}
                    node={node}
                    active={selectedId === node.id}
                    onSelect={() => {
                      setSelectedId(node.id);
                      toggleSelection(node.type, node.id);
                    }}
                  />
                )}
              />
            </SortableContext>
          </DndContext>
        </div>
        {dragActive ? (
          <div className="pointer-events-none rounded-2xl border border-dashed border-focus bg-surface-base/80 p-3 text-center text-xs text-foreground">
            Drop folders or ZIPs to launch Bulk Upload mapping.
          </div>
        ) : null}
      </section>
        <section
          className="flex w-[46%] min-w-[420px] flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4"
          data-help-id="catalog-pane-b"
          data-help-title={t('helpOverlay.catalogPaneB.title')}
          data-help-description={t('helpOverlay.catalogPaneB.body')}
        >
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">Details</h2>
              <p className="text-xs text-foreground-muted">Read first, flip to edit when needed. No modals.</p>
            </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setEditing((state) => !state)}
              className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1"
            >
              {editing ? <X className="h-4 w-4" strokeWidth={1.5} aria-hidden /> : <Edit3 className="h-4 w-4" strokeWidth={1.5} aria-hidden />}
              {editing ? 'Cancel' : 'Edit'}
            </button>
            <button className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1">
              <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => {
                pushToast({ title: 'Delete queued', description: 'Hold confirm triggered for safe purge.' });
              }}
              className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1 text-brand-danger"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              Delete
            </button>
          </div>
        </header>
        {!editing ? (
          <article className="space-y-3 rounded-2xl border border-border-subtle bg-surface-base/60 p-4 text-sm text-foreground">
            <h3 className="text-lg font-semibold">{selectedNode?.title}</h3>
            <p className="text-foreground-muted capitalize">{selectedNode?.type}</p>
            <div className="flex flex-wrap gap-2 pt-2 text-xs">
              <span className="rounded-full border border-border-subtle px-3 py-1">Scope: {selectedNode?.count ?? 0}</span>
              <span className="rounded-full border border-border-subtle px-3 py-1">ID: {selectedNode?.id}</span>
            </div>
            <p className="text-sm text-foreground-muted">{selectedNode?.description}</p>
          </article>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-border-subtle bg-surface-base/60 p-4 text-sm text-foreground">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">Title</span>
              <input
                {...form.register('title')}
                className="h-11 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm focus:border-focus focus:shadow-focus"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-foreground-muted">Description</span>
              <textarea
                {...form.register('description')}
                rows={4}
                className="rounded-lg border border-border-subtle bg-surface-base px-3 py-2 text-sm focus:border-focus focus:shadow-focus"
              />
            </label>
            {form.formState.errors.title ? (
              <p className="text-xs text-brand-danger">{form.formState.errors.title.message}</p>
            ) : null}
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1 text-xs"
              >
                <Save className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Save
              </button>
              <button type="button" className="rounded-full border border-border-subtle px-3 py-1 text-xs">
                Move
              </button>
            </div>
          </form>
        )}
        <section className="space-y-3 rounded-2xl border border-border-subtle bg-surface-base/60 p-4 text-sm text-foreground">
          <header className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Bulk Edit</h3>
              <p className="text-xs text-foreground-muted">Selected {selectedLectures.length} lectures.</p>
            </div>
            <span className="text-xs text-foreground-muted">{bulkEditMutation.isPending ? 'Syncing…' : 'Diff preview below'}</span>
          </header>
          <form onSubmit={handleBulkSubmit} className="grid gap-3 text-xs">
            <label className="flex flex-col gap-1">
              Title prefix
              <input
                {...bulkForm.register('prefix')}
                placeholder="Nightly • "
                className="h-9 rounded-lg border border-border-subtle bg-surface-base px-3 text-xs text-foreground focus:border-focus"
              />
            </label>
            <label className="flex flex-col gap-1">
              Move to module
              <select
                {...bulkForm.register('moduleId')}
                className="h-9 rounded-lg border border-border-subtle bg-surface-base px-3 text-xs text-foreground"
              >
                <option value="">Keep current</option>
                {moduleOptions.map((module) => (
                  <option key={module.id} value={module.id}>
                    {module.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Tag
              <input
                {...bulkForm.register('tag')}
                placeholder="Exam Prep"
                className="h-9 rounded-lg border border-border-subtle bg-surface-base px-3 text-xs text-foreground"
              />
            </label>
            <div className="flex items-center justify-between">
              <span className="text-xs text-foreground-muted">
                {targetModuleName ? `Will move to ${targetModuleName}` : 'Module unchanged'}
              </span>
              <button
                type="submit"
                disabled={bulkEditMutation.isPending}
                className="rounded-full border border-border-subtle px-3 py-1 text-xs hover:border-focus hover:text-focus disabled:opacity-60"
              >
                Apply bulk edit
              </button>
            </div>
          </form>
          <div className="max-h-36 overflow-y-auto rounded-xl border border-border-subtle bg-surface-subtle/60 p-3 text-xs">
            {bulkPreview.length ? (
              <ul className="space-y-2">
                {bulkPreview.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-4">
                    <span className="truncate text-foreground-muted">{entry.before}</span>
                    <ChevronRight className="h-3.5 w-3.5 text-foreground-muted" strokeWidth={1.5} aria-hidden />
                    <span className="truncate text-foreground">{entry.after}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-foreground-muted">Select lectures to preview changes.</p>
            )}
          </div>
        </section>
      </section>
        <section
          className="flex w-[30%] min-w-[320px] flex-col gap-3 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4"
          data-help-id="catalog-pane-c"
          data-help-title={t('helpOverlay.catalogPaneC.title')}
          data-help-description={t('helpOverlay.catalogPaneC.body')}
        >
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Assets & Actions</h2>
          <button
            className="rounded-full border border-border-subtle px-3 py-1 text-xs"
            onClick={() =>
              addCartItem({
                title: `Batch assets for ${selectedNode?.title ?? 'selection'}`,
                action: 'Process all assets',
                estMs: 12 * 60_000,
                lectureId: selectedNode?.id,
                params: { targetId: selectedNode?.id, scope: 'all-assets' },
                prereqs: selectedNode ? [selectedNode.title] : [],
              })
            }
          >
            Add all to Cart
          </button>
        </header>
        <div className="space-y-3 text-sm text-foreground">
          {assetPalette.map((asset) => (
            <article key={asset.id} className="flex flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-base/60 p-3">
              <header className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <asset.icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  <h3 className="font-semibold">{asset.label}</h3>
                </div>
                <span className="text-xs text-foreground-muted">Available</span>
              </header>
              <div className="flex flex-wrap gap-2 text-xs">
                <button className="rounded-full border border-border-subtle px-3 py-1" onClick={() => assetAction('Upload', asset.label)}>
                  Upload
                </button>
                <button className="rounded-full border border-border-subtle px-3 py-1" onClick={() => assetAction('Download', asset.label)}>
                  Download
                </button>
                <button className="rounded-full border border-border-subtle px-3 py-1" onClick={() => assetAction('Replace', asset.label)}>
                  Replace
                </button>
                <button
                  className="rounded-full border border-border-subtle px-3 py-1 text-brand-danger"
                  onClick={() => assetAction('Remove', asset.label)}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <button
            className="h-12 rounded-xl border border-border-subtle"
            onClick={() => assetAction('Transcribe task queued for', selectedNode?.title ?? 'selection')}
          >
            Transcribe
          </button>
          <button
            className="h-12 rounded-xl border border-border-subtle"
            onClick={() => assetAction('Process slides queued for', selectedNode?.title ?? 'selection')}
          >
            Process Slides
          </button>
        </div>
      </section>
      </div>
      {bulkSheetOpen ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-surface-overlay/70 backdrop-blur-panel">
          <div className="flex h-[80vh] w-[min(960px,96%)] flex-col gap-4 rounded-3xl border border-border-strong bg-surface-overlay/95 p-4 shadow-panel">
            <header className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">Bulk Upload Mapping</h3>
                <p className="text-xs text-foreground-muted">
                  Drop folders, confirm mapping, then push directly to Task Cart.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-foreground-muted">
                <span>{Math.round(bulkProgress * 100)}%</span>
                <button
                  type="button"
                  onClick={closeBulkSheet}
                  className="rounded-full border border-border-subtle px-3 py-1 hover:border-brand-danger hover:text-brand-danger"
                >
                  Close
                </button>
              </div>
            </header>
            <div className="grid flex-1 grid-cols-3 gap-4">
              <section className="col-span-1 space-y-3 rounded-2xl border border-border-subtle bg-surface-base/80 p-3 text-xs">
                <h4 className="text-sm font-semibold text-foreground">Options</h4>
                {bulkError ? (
                  <div className="space-y-2 rounded-xl border border-brand-danger/40 bg-brand-danger/5 p-3">
                    <p className="text-xs font-medium text-brand-danger">{bulkError}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <button
                        type="button"
                        onClick={retryBulkAnalysis}
                        disabled={bulkStatus === 'analyzing'}
                        className="rounded-full border border-brand-danger/60 px-3 py-1 text-brand-danger transition hover:border-brand-danger hover:bg-brand-danger/10 disabled:opacity-60"
                      >
                        Retry analysis
                      </button>
                      <button
                        type="button"
                        onClick={clearBulkAnalysis}
                        disabled={bulkStatus === 'analyzing'}
                        className="rounded-full border border-border-subtle px-3 py-1 text-foreground transition hover:border-border-strong hover:text-foreground-strong disabled:opacity-60"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                ) : null}
                <label className="flex items-center justify-between gap-2">
                  Auto Mastering
                  <input
                    type="checkbox"
                    checked={bulkOptions.autoMaster}
                    onChange={() => toggleBulkOption('autoMaster')}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Auto Transcribe
                  <input
                    type="checkbox"
                    checked={bulkOptions.autoTranscribe}
                    onChange={() => toggleBulkOption('autoTranscribe')}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Process Slides
                  <input
                    type="checkbox"
                    checked={bulkOptions.autoSlides}
                    onChange={() => toggleBulkOption('autoSlides')}
                  />
                </label>
                <label className="flex items-center justify-between gap-2">
                  Prefer CPU
                  <input
                    type="checkbox"
                    checked={bulkOptions.preferCpu}
                    onChange={() => toggleBulkOption('preferCpu')}
                  />
                </label>
                <div className="rounded-xl border border-border-subtle bg-surface-subtle/70 p-3 text-xs text-foreground">
                  <p>Total bytes: {(bulkPlan?.totalBytes ?? 0).toLocaleString()}</p>
                  <p>
                    Classes {bulkPlan?.inferredCount.classes ?? 0} · Modules {bulkPlan?.inferredCount.modules ?? 0} · Lectures{' '}
                    {bulkPlan?.inferredCount.lectures ?? 0}
                  </p>
                </div>
              </section>
              <section className="col-span-2 flex flex-col rounded-2xl border border-border-subtle bg-surface-base/80">
                <Virtuoso
                  className="h-full"
                  data={bulkPlan?.items ?? []}
                  itemContent={(index, item) => (
                    <div className="flex items-center justify-between border-b border-border-subtle px-3 py-2 text-xs text-foreground last:border-b-0">
                      <div>
                        <p className="font-semibold">{item.lectureName}</p>
                        <p className="text-foreground-muted">
                          {item.className} / {item.moduleName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p>{item.assetType}</p>
                        <p className="text-foreground-muted">{item.fileName}</p>
                      </div>
                    </div>
                  )}
                />
              </section>
            </div>
            <footer className="flex items-center justify-between text-xs text-foreground-muted">
              <span>{bulkStatus === 'analyzing' ? 'Analyzing files…' : 'Ready to queue tasks.'}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeBulkSheet}
                  className="rounded-full border border-border-subtle px-3 py-1"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={commitBulkUpload}
                  disabled={!bulkPlan || bulkStatus === 'analyzing'}
                  className="rounded-full border border-border-subtle px-3 py-1 text-foreground hover:border-focus hover:text-focus disabled:opacity-60"
                >
                  Add to Task Cart
                </button>
              </div>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
};

type SortableNodeProps = {
  node: CurriculumNode;
  active: boolean;
  onSelect: () => void;
};

const SortableNode = ({ node, active, onSelect }: SortableNodeProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const paddingClass = depthPadding[Math.min(node.depth, depthPadding.length - 1)];

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={clsx('px-3 py-2', isDragging && 'opacity-60')}
    >
      <button
        type="button"
        onClick={onSelect}
        className={clsx(
          'group flex w-full items-center justify-between rounded-xl border border-border-subtle bg-surface-base/60 px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
          active && 'border-focus shadow-focus',
        )}
      >
        <span className="flex items-center gap-2">
          <span
            {...attributes}
            {...listeners}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-surface-subtle text-foreground-muted"
          >
            <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          </span>
          <ChevronRight className="h-4 w-4 text-foreground-muted" strokeWidth={1.5} aria-hidden />
          <span className={clsx('font-medium', paddingClass)}>
            {node.title}
          </span>
        </span>
        <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-foreground-muted">{node.count}</span>
      </button>
    </div>
  );
};

const estimateBulkUploadMs = (item: BulkUploadPlanItem, options: typeof defaultBulkOptions) => {
  const baseMinutes = item.assetType === 'audio' ? 10 : item.assetType === 'slides' ? 6 : 4;
  const optionMinutes = (options.autoTranscribe ? 5 : 0) + (options.autoMaster ? 3 : 0) + (options.autoSlides ? 2 : 0);
  return (baseMinutes + optionMinutes) * 60_000;
};

const estimateAssetMs = (action: string, asset: string) => {
  const normalizedAction = action.toLowerCase();
  if (normalizedAction.includes('transcribe')) {
    return 12 * 60_000;
  }
  if (normalizedAction.includes('slides')) {
    return 8 * 60_000;
  }
  if (normalizedAction.includes('upload') || normalizedAction.includes('replace')) {
    return 6 * 60_000;
  }
  if (normalizedAction.includes('remove') || normalizedAction.includes('delete')) {
    return 3 * 60_000;
  }
  return 5 * 60_000;
};
