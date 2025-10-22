export type Identifier = string;

export interface Pagination {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
}

export interface ClassSummary {
  id: Identifier;
  name: string;
  description?: string | null;
  moduleCount: number;
  lectureCount: number;
}

export interface ModuleSummary {
  id: Identifier;
  classId: Identifier;
  name: string;
  description?: string | null;
  lectureCount: number;
}

export interface LectureAsset {
  id: Identifier;
  kind: string;
  name: string;
  size: number | null;
  updatedAt?: string;
  url?: string | null;
  status?: string | null;
  progress?: number | null;
}

export interface LectureSummary {
  id: Identifier;
  classId: Identifier;
  moduleId: Identifier;
  name: string;
  description?: string | null;
  createdAt?: string;
  updatedAt?: string;
  assets: LectureAsset[];
}

export interface LectureDetail extends LectureSummary {
  notes?: string | null;
  language?: string | null;
  durationSeconds?: number | null;
  metadata?: Record<string, unknown> | null;
}

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface JobProgress {
  id: Identifier;
  label: string;
  status: JobStatus;
  step?: string | null;
  percent?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  lectureId?: Identifier | null;
  details?: string | null;
}

export interface StorageEntry {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number | null;
  modifiedAt?: string | null;
  downloadable?: boolean;
}

export interface StorageListing {
  path: string;
  parent: string | null;
  entries: StorageEntry[];
}

export interface StorageUsage {
  totalBytes: number;
  usedBytes: number;
  processedAudioBytes: number;
}

export interface GPUStatus {
  available: boolean;
  backend: string | null;
  lastCheckedAt: string | null;
  message?: string | null;
}

export interface SettingsPayload {
  language: string;
  theme: Theme;
  autoMastering: boolean;
  defaultWhisperModel?: string | null;
}

export type Theme = 'light' | 'dark' | 'system';

export interface SlidePreview {
  id: Identifier;
  pageCount: number;
  generatedAt: string;
  title: string;
}

export interface SlideProcessingRequest {
  startPage: number;
  endPage: number;
  notes?: string | null;
}

export interface UploadDescriptor {
  lectureId: Identifier;
  kind: string;
  file: File;
  chunkSize?: number;
  signal?: AbortSignal;
  onProgress?: (uploadedBytes: number, totalBytes: number) => void;
}

export interface CurriculumNode {
  classInfo: ClassSummary;
  modules: Map<Identifier, ModuleNode>;
  pagination?: Pagination;
}

export interface ModuleNode {
  moduleInfo: ModuleSummary;
  lectures: Map<Identifier, LectureSummary>;
  pagination?: Pagination;
}

export interface CurriculumSnapshot {
  classes: CurriculumNode[];
  totals: {
    classes: number;
    modules: number;
    lectures: number;
    assets: Record<string, number>;
  };
}

export interface EnvironmentConfig {
  basePath: string;
  pdf: {
    script: string;
    worker: string;
    module: string;
    workerModule: string;
  };
}

export interface ProgressEventPayload {
  id: Identifier;
  label: string;
  status: JobStatus;
  percent?: number | null;
  step?: string | null;
  details?: string | null;
  lectureId?: Identifier | null;
}

export interface ImportResponse {
  replacedLectures: number;
  mergedLectures: number;
  skippedLectures: number;
}
