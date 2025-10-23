import type { GlobalSearchResult, TaskProgress, StorageUsageEntry } from '@lecturetools/api';

type MockCurriculumNode = {
  id: string;
  title: string;
  type: 'class' | 'module' | 'lecture';
  depth: number;
  count: number;
  description?: string;
  parentId?: string;
};

type MockActivity = {
  id: string;
  title: string;
  description: string;
  timestamp: number;
  targetRoute: string;
};

type MockSystemSnapshot = {
  gpu: 'Active' | 'Fallback';
  storageUsed: number;
  queuedTasks: number;
};

type MockStorageDirectory = {
  id: string;
  path: string;
  size: string;
  scopeId: string;
};

type MockDebugEvent = {
  id: string;
  severity: 'info' | 'warn' | 'error';
  category: 'transcription' | 'storage' | 'system';
  message: string;
  timestamp: number;
};

const curriculum: MockCurriculumNode[] = [
  {
    id: 'class-neuroscience-401',
    title: 'Neuroscience 401',
    type: 'class',
    depth: 0,
    count: 3,
    description: 'Graduate focus on cortical computation and neural dynamics.',
  },
  {
    id: 'module-synaptic-plasticity',
    parentId: 'class-neuroscience-401',
    title: 'Synaptic Plasticity',
    type: 'module',
    depth: 1,
    count: 4,
    description: 'Adaptive learning mechanisms for synapses.',
  },
  {
    id: 'lecture-ltp-fundamentals',
    parentId: 'module-synaptic-plasticity',
    title: 'LTP Fundamentals',
    type: 'lecture',
    depth: 2,
    count: 5,
    description: 'Potentiation sequences with lab-ready workflows.',
  },
  {
    id: 'lecture-stdp-protocols',
    parentId: 'module-synaptic-plasticity',
    title: 'STDP Protocols',
    type: 'lecture',
    depth: 2,
    count: 4,
    description: 'Spike-timing dependent plasticity recipes and safeguards.',
  },
  {
    id: 'module-neural-interfaces',
    parentId: 'class-neuroscience-401',
    title: 'Neural Interfaces',
    type: 'module',
    depth: 1,
    count: 5,
    description: 'Closed-loop systems and hardware integrations.',
  },
  {
    id: 'lecture-brain-computer',
    parentId: 'module-neural-interfaces',
    title: 'Brain-Computer Links',
    type: 'lecture',
    depth: 2,
    count: 6,
    description: 'BCI capture pipelines and ethical guardrails.',
  },
  {
    id: 'class-humanities-210',
    title: 'Humanities 210',
    type: 'class',
    depth: 0,
    count: 2,
    description: 'Narrative craft for lecture-driven courses.',
  },
  {
    id: 'module-rhetoric',
    parentId: 'class-humanities-210',
    title: 'Modern Rhetoric',
    type: 'module',
    depth: 1,
    count: 3,
    description: 'Persuasive frameworks across media.',
  },
  {
    id: 'lecture-visual-story',
    parentId: 'module-rhetoric',
    title: 'Visual Storytelling',
    type: 'lecture',
    depth: 2,
    count: 2,
    description: 'Slide choreography and note synthesis.',
  },
];

const searchIndex: GlobalSearchResult[] = [
  {
    id: 'class-neuroscience-401',
    entityType: 'class',
    title: 'Neuroscience 401',
    subtitle: 'Graduate · 2 modules · 3 lectures',
    badge: 'Class',
  },
  {
    id: 'module-synaptic-plasticity',
    entityType: 'module',
    title: 'Synaptic Plasticity',
    subtitle: 'Neuroscience 401 · 4 assets per lecture',
    badge: 'Module',
  },
  {
    id: 'lecture-ltp-fundamentals',
    entityType: 'lecture',
    title: 'LTP Fundamentals',
    subtitle: 'Synaptic Plasticity · 48 min',
    badge: 'Lecture',
  },
  {
    id: 'asset-transcript-ltp',
    entityType: 'asset',
    title: 'Transcript · LTP Fundamentals',
    subtitle: 'Updated 6m ago · 5 highlights',
    badge: 'Transcript',
  },
  {
    id: 'class-humanities-210',
    entityType: 'class',
    title: 'Humanities 210',
    subtitle: 'Undergraduate · 1 module',
    badge: 'Class',
  },
];

const now = Date.now();

const activities: MockActivity[] = [
  {
    id: 'activity-run-cart',
    title: 'Cart executed',
    description: 'Batch completed with auto notifications.',
    timestamp: now - 1_200_000,
    targetRoute: '/tasks',
  },
  {
    id: 'activity-upload',
    title: 'Slides uploaded',
    description: 'Auto preview and note extraction scheduled.',
    timestamp: now - 2_400_000,
    targetRoute: '/catalog',
  },
  {
    id: 'activity-transcribe',
    title: 'Transcription finished',
    description: 'GPU fallback triggered mid-run.',
    timestamp: now - 3_000_000,
    targetRoute: '/tasks',
  },
  {
    id: 'activity-export',
    title: 'Export built',
    description: 'Archive available for Humanities 210.',
    timestamp: now - 4_800_000,
    targetRoute: '/import-export',
  },
  {
    id: 'activity-update',
    title: 'System update ready',
    description: 'Release 2.6 validated via dry run.',
    timestamp: now - 6_000_000,
    targetRoute: '/system',
  },
];

const systemSnapshot: MockSystemSnapshot = {
  gpu: 'Active',
  storageUsed: 0.58,
  queuedTasks: 3,
};

const taskProgress: TaskProgress[] = [
  { id: 'task-transcribe-1', title: 'Transcribe · LTP Fundamentals', status: 'running', progress: 62 },
  { id: 'task-slides-1', title: 'Process Slides · Visual Story', status: 'queued', progress: 12 },
  { id: 'task-export-1', title: 'Export · Neuroscience 401', status: 'completed', progress: 100 },
  { id: 'task-master-1', title: 'Master Audio · Brain-Computer Links', status: 'failed', progress: 48 },
  { id: 'task-transcribe-2', title: 'Transcribe · STDP Protocols', status: 'running', progress: 41 },
];

const storageEntries: StorageUsageEntry[] = [
  { id: 'neuro401', label: 'Neuroscience 401', gigabytes: 42.4, mastered: 18, purgeCandidates: 7 },
  { id: 'hum210', label: 'Humanities 210', gigabytes: 19.2, mastered: 6, purgeCandidates: 2 },
  { id: 'guest', label: 'Guest Lectures', gigabytes: 8.6, mastered: 2, purgeCandidates: 1 },
];

const storageDirectories: MockStorageDirectory[] = Array.from({ length: 45 }).map((_, index) => {
  const scope = index % 3 === 0 ? 'neuro401' : index % 3 === 1 ? 'hum210' : 'guest';
  const folder = scope === 'neuro401' ? 'neuroscience-401' : scope === 'hum210' ? 'humanities-210' : 'guest-series';
  const module = index % 2 === 0 ? 'module-a' : 'module-b';
  const lecture = `lecture-${(index % 9) + 1}`;
  return {
    id: `dir-${index + 1}`,
    path: `/classes/${folder}/${module}/${lecture}`,
    size: `${(Math.random() * 2 + 0.5).toFixed(2)} GB`,
    scopeId: scope,
  } satisfies MockStorageDirectory;
});

const debugEvents: MockDebugEvent[] = Array.from({ length: 60 }).map((_, index) => {
  const severity: MockDebugEvent['severity'] = index % 7 === 0 ? 'error' : index % 4 === 0 ? 'warn' : 'info';
  const category: MockDebugEvent['category'] = index % 5 === 0 ? 'system' : index % 2 === 0 ? 'transcription' : 'storage';
  return {
    id: `dbg-${index + 1}`,
    severity,
    category,
    message:
      severity === 'error'
        ? 'Retry limit exceeded; switching to CPU fallback.'
        : severity === 'warn'
        ? 'Throughput dip detected; monitoring until stable.'
        : 'Heartbeat ping acknowledged with 12 ms latency.',
    timestamp: now - index * 7_500,
  } satisfies MockDebugEvent;
});

const clone = <T extends Record<string, any>>(items: T[]): T[] => items.map((item) => ({ ...item }));

export const loadMockCurriculumNodes = (): MockCurriculumNode[] => clone(curriculum);

export const loadMockSearchResults = (query: string): GlobalSearchResult[] => {
  if (!query) {
    return clone(searchIndex);
  }
  const lower = query.toLowerCase();
  return searchIndex
    .filter((item) =>
      [item.title, item.subtitle ?? ''].some((value) => value.toLowerCase().includes(lower)),
    )
    .map((item) => ({ ...item }));
};

export const loadMockActivities = (): MockActivity[] =>
  clone(activities).sort((a, b) => b.timestamp - a.timestamp);

export const loadMockSystemSnapshot = (): MockSystemSnapshot => ({ ...systemSnapshot });

export const loadMockTaskProgress = (): TaskProgress[] => clone(taskProgress);

export const loadMockStorage = () => ({
  entries: clone(storageEntries),
  directories: storageDirectories.map((entry) => ({ ...entry })),
});

export const loadMockDebugEvents = (): MockDebugEvent[] => clone(debugEvents);

export type { MockCurriculumNode, MockStorageDirectory, MockActivity, MockSystemSnapshot, MockDebugEvent };
