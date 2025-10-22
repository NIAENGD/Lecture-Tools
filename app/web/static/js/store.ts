import type {
  CurriculumNode,
  CurriculumSnapshot,
  GPUStatus,
  Identifier,
  JobProgress,
  LectureDetail,
  ModuleNode,
  SettingsPayload,
  StorageListing,
  StorageUsage,
  Theme,
} from './types';

export interface SelectionState {
  classId: Identifier | null;
  moduleId: Identifier | null;
  lectureId: Identifier | null;
}

export interface CurriculumState {
  nodes: Map<Identifier, CurriculumNode>;
  filter: string;
  loading: boolean;
  initialized: boolean;
  selection: SelectionState;
}

export interface LectureState {
  detail: LectureDetail | null;
  loading: boolean;
  error: string | null;
  editMode: boolean;
}

export interface ProgressState {
  queue: Map<Identifier, JobProgress>;
  lastUpdated: number;
}

export interface StorageState {
  listing: StorageListing | null;
  usage: StorageUsage | null;
  loading: boolean;
  selected: Set<string>;
}

export interface SettingsState {
  settings: SettingsPayload | null;
  gpu: GPUStatus | null;
  theme: Theme;
  language: string;
  saving: boolean;
}

export interface AppState {
  curriculum: CurriculumState;
  lecture: LectureState;
  progress: ProgressState;
  storage: StorageState;
  settings: SettingsState;
  snapshot: CurriculumSnapshot | null;
}

export type StateSubscriber = (state: AppState) => void;

export class Store {
  private state: AppState;

  private subscribers = new Set<StateSubscriber>();

  constructor(initialState?: Partial<AppState>) {
    this.state = {
      curriculum: {
        nodes: new Map(),
        filter: '',
        loading: false,
        initialized: false,
        selection: { classId: null, moduleId: null, lectureId: null },
      },
      lecture: {
        detail: null,
        loading: false,
        error: null,
        editMode: false,
      },
      progress: {
        queue: new Map(),
        lastUpdated: Date.now(),
      },
      storage: {
        listing: null,
        usage: null,
        loading: false,
        selected: new Set(),
      },
      settings: {
        settings: null,
        gpu: null,
        theme: 'system',
        language: 'en',
        saving: false,
      },
      snapshot: null,
      ...initialState,
    } as AppState;
  }

  getState(): AppState {
    return this.state;
  }

  subscribe(subscriber: StateSubscriber): () => void {
    this.subscribers.add(subscriber);
    subscriber(this.state);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }

  update(mutator: (draft: AppState) => void): void {
    const next = this.cloneState(this.state);
    mutator(next);
    this.state = next;
    this.emit();
  }

  private emit(): void {
    for (const subscriber of this.subscribers) {
      subscriber(this.state);
    }
  }

  private cloneState(source: AppState): AppState {
    return {
      ...source,
      curriculum: {
        ...source.curriculum,
        nodes: new Map(source.curriculum.nodes),
        selection: { ...source.curriculum.selection },
      },
      lecture: { ...source.lecture },
      progress: {
        ...source.progress,
        queue: new Map(source.progress.queue),
      },
      storage: {
        ...source.storage,
        listing: source.storage.listing
          ? { ...source.storage.listing, entries: [...source.storage.listing.entries] }
          : null,
        selected: new Set(source.storage.selected),
      },
      settings: {
        ...source.settings,
        settings: source.settings.settings ? { ...source.settings.settings } : null,
        gpu: source.settings.gpu ? { ...source.settings.gpu } : null,
      },
      snapshot: source.snapshot ? ({
        classes: source.snapshot.classes.map((node) => ({
          classInfo: { ...node.classInfo },
          modules: new Map(
            [...node.modules.entries()].map(([moduleId, module]) => [
              moduleId,
              {
                moduleInfo: { ...module.moduleInfo },
                lectures: new Map(
                  [...module.lectures.entries()].map(([lectureId, lecture]) => [
                    lectureId,
                    { ...lecture, assets: [...lecture.assets] },
                  ]),
                ),
                pagination: module.pagination ? { ...module.pagination } : undefined,
              } as ModuleNode,
            ]),
          ),
          pagination: node.pagination ? { ...node.pagination } : undefined,
        })),
        totals: {
          classes: source.snapshot.totals.classes,
          modules: source.snapshot.totals.modules,
          lectures: source.snapshot.totals.lectures,
          assets: { ...source.snapshot.totals.assets },
        },
      }) : null,
    };
  }
}
