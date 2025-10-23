import { z } from 'zod';

const ApiErrorSchema = z.object({
  message: z.string(),
  status: z.number(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

type SecureRequestInit = RequestInit & {
  requiredRoles?: string[];
  etag?: string;
  reason?: string;
};

export const createApiClient = (options: {
  baseUrl: string;
  token?: string;
  getCsrfToken?: () => string | null;
  getRoles?: () => string[];
  onUnauthorized?: (required: string[], reason?: string) => void;
  getEtag?: (key: string) => string | undefined;
  setEtag?: (key: string, value: string) => void;
}) => {
  const baseHeaders = new Headers({ 'Content-Type': 'application/json' });

  if (options.token) {
    baseHeaders.set('Authorization', `Bearer ${options.token}`);
  }

  const ensureRoles = (required?: string[], reason?: string) => {
    if (!required?.length || !options.getRoles) {
      return true;
    }
    const roles = options.getRoles().map((role) => role.toLowerCase());
    const allowed = required.some((role) => roles.includes(role.toLowerCase()));
    if (!allowed) {
      options.onUnauthorized?.(required, reason);
    }
    return allowed;
  };

  const request = async <TData>(input: string, schema?: z.ZodType<TData>, init: SecureRequestInit = {}): Promise<TData> => {
    const { requiredRoles, etag, reason, ...fetchInit } = init;
    if (!ensureRoles(requiredRoles, reason)) {
      throw { message: 'Forbidden', status: 403 } satisfies ApiError;
    }

    const method = (fetchInit.method ?? 'GET').toUpperCase();
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const headers = new Headers(baseHeaders);
    if (fetchInit.headers) {
      new Headers(fetchInit.headers).forEach((value, key) => headers.set(key, value));
    }

    if (!fetchInit.body) {
      headers.delete('Content-Type');
    }

    if (isMutation) {
      const csrfToken = options.getCsrfToken?.();
      if (csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
      }
      headers.set('X-Requested-With', 'XMLHttpRequest');
      const etagKey = `${method}:${input}`;
      const etagValue = etag ?? options.getEtag?.(etagKey);
      if (etagValue) {
        headers.set('If-Match', etagValue);
      }
    }

    const response = await fetch(`${options.baseUrl}${input}`, {
      ...fetchInit,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      referrerPolicy: 'strict-origin-when-cross-origin',
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({ message: response.statusText }));
      const parsed = ApiErrorSchema.safeParse({ message: errorPayload.message, status: response.status });
      throw parsed.success ? parsed.data : { message: response.statusText, status: response.status };
    }

    const etagHeader = response.headers.get('ETag');
    if (etagHeader) {
      const cacheKey = `${method}:${input}`;
      options.setEtag?.(cacheKey, etagHeader);
    }

    if (response.status === 204) {
      return undefined as TData;
    }

    const data = await response.json();
    return schema ? schema.parse(data) : (data as TData);
  };

  return {
    search: {
      global: (query: string) =>
        request('/api/search?q=' + encodeURIComponent(query), GlobalSearchResponseSchema),
    },
    catalog: {
      listClasses: () => request('/api/classes', ClassSummaryResponseSchema),
      listModules: (classId: string) => request(`/api/classes/${classId}/modules`, ModuleSummaryResponseSchema),
      listLectures: (moduleId: string) => request(`/api/modules/${moduleId}/lectures`, LectureSummaryResponseSchema),
      createLecture: (payload: LecturePayload) =>
        request('/api/lectures', LectureSummaryResponseSchema, {
          method: 'POST',
          body: JSON.stringify(payload),
          requiredRoles: ['editor', 'admin'],
          reason: 'create-lecture',
        }),
      bulkUpdate: (payload: CatalogBulkEditPayload) =>
        request('/api/catalog/bulk', CatalogBulkEditResponseSchema, {
          method: 'PATCH',
          body: JSON.stringify(payload),
          requiredRoles: ['editor', 'admin'],
          reason: 'catalog-bulk-update',
        }),
    },
    tasks: {
      getProgress: () => request('/api/progress', TaskProgressResponseSchema),
      deleteTask: (taskId: string) =>
        request(`/api/progress/${taskId}`, undefined, {
          method: 'DELETE',
          requiredRoles: ['operator', 'admin'],
          reason: 'task-delete',
        }),
      enqueueBatch: (payload: TaskCartBatchPayload) =>
        request('/api/tasks/batch', TaskBatchResponseSchema, {
          method: 'POST',
          body: JSON.stringify(payload),
          requiredRoles: ['operator', 'admin'],
          reason: 'task-batch-enqueue',
        }),
      updateBatch: (batchId: string, payload: TaskCartBatchUpdatePayload) =>
        request(`/api/tasks/batch/${batchId}`, TaskBatchResponseSchema, {
          method: 'PATCH',
          body: JSON.stringify(payload),
          requiredRoles: ['operator', 'admin'],
          reason: 'task-batch-update',
        }),
      reorderBatch: (batchId: string, order: string[]) =>
        request(`/api/tasks/batch/${batchId}/order`, TaskBatchResponseSchema, {
          method: 'PATCH',
          body: JSON.stringify({ order }),
          requiredRoles: ['operator', 'admin'],
          reason: 'task-batch-reorder',
        }),
      fetchBatchLogs: (batchId: string) =>
        request(`/api/tasks/batch/${batchId}/logs`, TaskBatchLogsResponseSchema),
    },
    storage: {
      getUsage: () => request('/api/storage/usage', StorageUsageResponseSchema),
      downloadArchive: (payload: StorageArchivePayload) =>
        request('/api/storage/download', ArchiveJobResponseSchema, {
          method: 'POST',
          body: JSON.stringify(payload),
          requiredRoles: ['editor', 'admin'],
          reason: 'storage-archive',
        }),
      purgeProcessedAudio: () =>
        request('/api/storage/purge', undefined, {
          method: 'POST',
          requiredRoles: ['admin'],
          reason: 'storage-purge',
        }),
    },
  };
};

export const ClassSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  moduleCount: z.number(),
  lectureCount: z.number(),
});
export type ClassSummary = z.infer<typeof ClassSummarySchema>;

export const ClassSummaryResponseSchema = z.object({
  classes: z.array(ClassSummarySchema),
});
export type ClassSummaryResponse = z.infer<typeof ClassSummaryResponseSchema>;

export const ModuleSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  lectureCount: z.number(),
  classId: z.string(),
});
export type ModuleSummary = z.infer<typeof ModuleSummarySchema>;

export const ModuleSummaryResponseSchema = z.object({
  modules: z.array(ModuleSummarySchema),
});
export type ModuleSummaryResponse = z.infer<typeof ModuleSummaryResponseSchema>;

export const LectureSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  duration: z.number(),
  assetCount: z.number(),
  moduleId: z.string(),
});
export type LectureSummary = z.infer<typeof LectureSummarySchema>;

export const LectureSummaryResponseSchema = z.object({
  lectures: z.array(LectureSummarySchema),
});
export type LectureSummaryResponse = z.infer<typeof LectureSummaryResponseSchema>;

export const LecturePayloadSchema = z.object({
  title: z.string().min(1),
  moduleId: z.string(),
  description: z.string().optional(),
});
export type LecturePayload = z.infer<typeof LecturePayloadSchema>;

export const CatalogBulkEditPayloadSchema = z.object({
  ids: z.array(z.string()),
  updates: z.object({
    title: z.string().optional(),
    titlePrefix: z.string().optional(),
    moduleId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});
export type CatalogBulkEditPayload = z.infer<typeof CatalogBulkEditPayloadSchema>;

export const CatalogBulkEditResponseSchema = z.object({
  updated: z.number(),
});
export type CatalogBulkEditResponse = z.infer<typeof CatalogBulkEditResponseSchema>;

export const TaskProgressSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['queued', 'running', 'failed', 'completed']),
  progress: z.number().int().min(0).max(100),
});
export type TaskProgress = z.infer<typeof TaskProgressSchema>;
export const TaskProgressResponseSchema = z.object({
  tasks: z.array(TaskProgressSchema),
});
export type TaskProgressResponse = z.infer<typeof TaskProgressResponseSchema>;

export const TaskCartBatchItemSchema = z.object({
  id: z.string().optional(),
  action: z.string(),
  lectureId: z.string(),
  options: z.record(z.any()).optional(),
});
export type TaskCartBatchItem = z.infer<typeof TaskCartBatchItemSchema>;

export const TaskCartBatchPayloadSchema = z.object({
  parallelism: z.union([z.literal('auto'), z.literal(1), z.literal(2), z.literal(4)]),
  onCompletion: z.enum(['notify', 'shutdown', 'nothing']),
  tasks: z.array(TaskCartBatchItemSchema),
  dryRun: z.boolean().optional(),
  presetName: z.string().optional(),
});
export type TaskCartBatchPayload = z.infer<typeof TaskCartBatchPayloadSchema>;

export const TaskBatchResponseSchema = z.object({
  id: z.string(),
  accepted: z.number(),
  status: z.enum(['queued', 'running', 'paused', 'completed', 'failed']).optional(),
});
export type TaskBatchResponse = z.infer<typeof TaskBatchResponseSchema>;

export const TaskCartBatchUpdatePayloadSchema = z.object({
  command: z.enum(['pause', 'resume', 'cancel']).optional(),
  parallelism: z.union([z.literal('auto'), z.literal(1), z.literal(2), z.literal(4)]).optional(),
  onCompletion: z.enum(['notify', 'shutdown', 'nothing']).optional(),
  dryRun: z.boolean().optional(),
  tasks: z
    .array(
      z.object({
        id: z.string(),
        action: z.string().optional(),
        lectureId: z.string().optional(),
        options: z.record(z.any()).optional(),
      }),
    )
    .optional(),
});
export type TaskCartBatchUpdatePayload = z.infer<typeof TaskCartBatchUpdatePayloadSchema>;

export const TaskCartLogEntrySchema = z.object({
  id: z.string(),
  itemId: z.string(),
  timestamp: z.string(),
  level: z.enum(['info', 'warn', 'error']).default('info'),
  message: z.string(),
  state: z.enum(['idle', 'queued', 'running', 'success', 'error', 'paused']).optional(),
});
export type TaskCartLogEntry = z.infer<typeof TaskCartLogEntrySchema>;

export const TaskBatchLogsResponseSchema = z.object({
  entries: z.array(TaskCartLogEntrySchema),
});
export type TaskBatchLogsResponse = z.infer<typeof TaskBatchLogsResponseSchema>;

export const StorageUsageEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  gigabytes: z.number(),
  mastered: z.number(),
  purgeCandidates: z.number(),
});
export type StorageUsageEntry = z.infer<typeof StorageUsageEntrySchema>;

export const StorageUsageResponseSchema = z.object({
  totalUsed: z.number(),
  entries: z.array(StorageUsageEntrySchema),
});
export type StorageUsageResponse = z.infer<typeof StorageUsageResponseSchema>;

export const StorageArchivePayloadSchema = z.object({
  scope: z.enum(['selection', 'class', 'all']),
  include: z.array(z.enum(['metadata', 'transcripts', 'notes', 'slides', 'audio'])),
  flattenStructure: z.boolean(),
});
export type StorageArchivePayload = z.infer<typeof StorageArchivePayloadSchema>;

export const ArchiveJobResponseSchema = z.object({
  jobId: z.string(),
  status: z.enum(['queued', 'running', 'completed']),
  downloadUrl: z.string().url().optional(),
});
export type ArchiveJobResponse = z.infer<typeof ArchiveJobResponseSchema>;

export const GlobalSearchResultSchema = z.object({
  id: z.string(),
  entityType: z.enum(['class', 'module', 'lecture', 'asset']),
  title: z.string(),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
});
export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>;

export const GlobalSearchResponseSchema = z.object({
  results: z.array(GlobalSearchResultSchema),
});
export type GlobalSearchResponse = z.infer<typeof GlobalSearchResponseSchema>;
