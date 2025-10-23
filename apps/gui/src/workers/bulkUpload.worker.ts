import * as Comlink from 'comlink';

export type BulkUploadDescriptor = {
  name: string;
  relativePath: string;
  size: number;
  type: string;
};

export type BulkUploadOptions = {
  autoMaster: boolean;
  autoTranscribe: boolean;
  autoSlides: boolean;
  preferCpu: boolean;
};

export type BulkUploadPlanItem = {
  id: string;
  className: string;
  moduleName: string;
  lectureName: string;
  assetType: 'audio' | 'slides' | 'transcript' | 'notes' | 'unknown';
  fileName: string;
  size: number;
  relativePath: string;
};

export type BulkUploadPlan = {
  totalBytes: number;
  items: BulkUploadPlanItem[];
  options: BulkUploadOptions;
  inferredCount: { classes: number; modules: number; lectures: number };
};

const extensionMap: Record<string, BulkUploadPlanItem['assetType']> = {
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  flac: 'audio',
  pdf: 'slides',
  pptx: 'slides',
  key: 'slides',
  vtt: 'transcript',
  srt: 'transcript',
  docx: 'notes',
  txt: 'notes',
};

type WorkerApi = {
  analyze: (
    files: BulkUploadDescriptor[],
    options: BulkUploadOptions,
    progress?: (value: number) => void,
  ) => Promise<BulkUploadPlan>;
};

const api: WorkerApi = {
  async analyze(files, options, progress) {
    const total = files.length;
    const items: BulkUploadPlanItem[] = [];
    const seenClasses = new Set<string>();
    const seenModules = new Set<string>();
    const seenLectures = new Set<string>();
    let processed = 0;
    let totalBytes = 0;

    for (const file of files) {
      processed += 1;
      totalBytes += file.size;
      const tokens = normalizePath(file.relativePath || file.name);
      const { className, moduleName, lectureName } = inferHierarchy(tokens);
      const assetType = inferAssetType(file.name);
      items.push({
        id: crypto.randomUUID(),
        className,
        moduleName,
        lectureName,
        assetType,
        fileName: file.name,
        size: file.size,
        relativePath: file.relativePath,
      });
      if (className) seenClasses.add(className);
      if (moduleName) seenModules.add(moduleName);
      if (lectureName) seenLectures.add(lectureName);
      progress?.(Number((processed / total).toFixed(3)));
      await tick();
    }

    return {
      totalBytes,
      items,
      options,
      inferredCount: {
        classes: seenClasses.size,
        modules: seenModules.size,
        lectures: seenLectures.size,
      },
    } satisfies BulkUploadPlan;
  },
};

const inferAssetType = (fileName: string): BulkUploadPlanItem['assetType'] => {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return extensionMap[ext] ?? 'unknown';
};

const sanitizeSegment = (segment: string) => segment.replace(/[<>:"|?*]/g, '_');

const normalizePath = (path: string) => {
  const tokens = path
    .split(/\\|\//)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const safe: string[] = [];
  for (const segment of tokens) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') {
      safe.pop();
      continue;
    }
    safe.push(sanitizeSegment(segment));
  }
  return safe;
};

const inferHierarchy = (tokens: string[]) => {
  if (tokens.length >= 3) {
    return {
      className: tokens[0],
      moduleName: tokens[1],
      lectureName: tokens[2],
    };
  }
  if (tokens.length === 2) {
    return { className: tokens[0], moduleName: tokens[0], lectureName: tokens[1] };
  }
  if (tokens.length === 1) {
    return { className: 'Unsorted', moduleName: 'Unsorted', lectureName: tokens[0] };
  }
  return { className: 'Unsorted', moduleName: 'Unsorted', lectureName: 'Untitled' };
};

const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

Comlink.expose(api);

export type BulkUploadWorker = typeof api;
