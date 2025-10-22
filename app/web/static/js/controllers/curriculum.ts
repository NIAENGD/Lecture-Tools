import {
  fetchCurriculumSnapshot,
  getLecture,
  listClasses,
  listLectures,
  listModules,
} from '../api';
import type {
  ClassSummary,
  CurriculumNode,
  CurriculumSnapshot,
  Identifier,
  LectureSummary,
  ModuleNode,
  ModuleSummary,
  PaginatedResponse,
} from '../types';
import { qs, toggle } from '../utils/dom';
import type { AppState, Store } from '../store';

interface TreeRow {
  key: string;
  type: 'class' | 'module' | 'lecture';
  depth: number;
  data: ClassSummary | ModuleSummary | LectureSummary;
  description?: string | null;
  badge?: string;
}

const ROW_HEIGHT = 64;
const PAGE_SIZE = 50;

export class CurriculumController {
  private root: HTMLElement;

  private treeHost: HTMLElement;

  private statsHost: HTMLElement;

  private filterInput: HTMLInputElement;

  private loadMoreButton: HTMLButtonElement;

  private store: Store;

  private rows: TreeRow[] = [];

  private expandedClasses = new Set<Identifier>();

  private expandedModules = new Set<string>();

  private loading = false;

  private hasMore = true;

  private offset = 0;

  private seededCreateModules = false;

  constructor(store: Store, sidebar: HTMLElement) {
    this.store = store;
    this.root = sidebar;
    this.treeHost = qs<HTMLElement>(sidebar, '#curriculum');
    this.statsHost = qs<HTMLElement>(sidebar, '#stats');
    this.filterInput = qs<HTMLInputElement>(sidebar, '#search-input');
    this.loadMoreButton = document.createElement('button');
    this.loadMoreButton.type = 'button';
    this.loadMoreButton.className = 'button button--ghost curriculum-load-more';
    this.loadMoreButton.textContent = 'Load more';
    this.loadMoreButton.addEventListener('click', () => {
      void this.loadNextPage();
    });
  }

  init(): void {
    const list = document.createElement('div');
    list.className = 'curriculum-list';
    list.tabIndex = 0;
    list.setAttribute('role', 'tree');
    list.addEventListener('scroll', () => this.renderVirtualized());
    list.addEventListener('click', (event) => this.handleTreeClick(event));

    this.treeHost.replaceChildren(list);
    this.treeHost.appendChild(this.loadMoreButton);

    this.filterInput.addEventListener('input', () => {
      const value = this.filterInput.value.trim().toLowerCase();
      this.store.update((draft) => {
        draft.curriculum.filter = value;
      });
      this.refreshRows();
    });

    this.store.subscribe((state) => this.handleStateChange(state));
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await Promise.all([this.loadNextPage(), this.refreshSnapshot()]);
  }

  private async refreshSnapshot(): Promise<void> {
    try {
      const snapshot = await fetchCurriculumSnapshot();
      this.store.update((draft) => {
        draft.snapshot = snapshot;
      });
      this.renderSnapshot(snapshot);
    } catch (error) {
      console.warn('Failed to load snapshot', error);
    }
  }

  private async loadNextPage(): Promise<void> {
    if (this.loading || !this.hasMore) {
      return;
    }
    this.loading = true;
    toggle(this.loadMoreButton, false);
    try {
      const response = await listClasses(this.offset, PAGE_SIZE);
      this.offset += response.items.length;
      this.hasMore = response.pagination.hasMore;
      this.mergeClasses(response);
      if (!this.seededCreateModules && response.items.length) {
        this.seededCreateModules = true;
        void this.ensureModulesLoaded(response.items[0].id);
      }
      this.refreshRows();
    } catch (error) {
      console.error('Failed to load classes', error);
    } finally {
      this.loading = false;
      toggle(this.loadMoreButton, this.hasMore);
    }
  }

  private mergeClasses(response: PaginatedResponse<ClassSummary>): void {
    this.store.update((draft) => {
      draft.curriculum.initialized = true;
      response.items.forEach((classInfo) => {
        if (!draft.curriculum.nodes.has(classInfo.id)) {
          const node: CurriculumNode = {
            classInfo,
            modules: new Map(),
          };
          draft.curriculum.nodes.set(classInfo.id, node);
        } else {
          draft.curriculum.nodes.get(classInfo.id)!.classInfo = classInfo;
        }
      });
    });
  }

  private handleStateChange(state: AppState): void {
    const { curriculum, snapshot } = state;
    if (snapshot) {
      this.renderSnapshot(snapshot);
    }
    const rows = this.buildRows(curriculum);
    if (rows !== this.rows) {
      this.rows = rows;
      this.renderVirtualized(true);
    }
  }

  private buildRows(curriculum: AppState['curriculum']): TreeRow[] {
    const rows: TreeRow[] = [];
    const filter = curriculum.filter;
    for (const node of curriculum.nodes.values()) {
      const classRow: TreeRow = {
        key: `class:${node.classInfo.id}`,
        type: 'class',
        depth: 0,
        data: node.classInfo,
        description: node.classInfo.description,
        badge: `${node.classInfo.moduleCount} modules · ${node.classInfo.lectureCount} lectures`,
      };
      if (!filter || this.matchesFilter(classRow, filter)) {
        rows.push(classRow);
      }
      if (this.expandedClasses.has(node.classInfo.id)) {
        for (const module of node.modules.values()) {
          const moduleRow: TreeRow = {
            key: `module:${module.moduleInfo.id}`,
            type: 'module',
            depth: 1,
            data: module.moduleInfo,
            description: module.moduleInfo.description,
            badge: `${module.moduleInfo.lectureCount} lectures`,
          };
          if (!filter || this.matchesFilter(moduleRow, filter)) {
            rows.push(moduleRow);
          }
          if (this.expandedModules.has(this.moduleKey(node.classInfo.id, module.moduleInfo.id))) {
            for (const lecture of module.lectures.values()) {
              const lectureRow: TreeRow = {
                key: `lecture:${lecture.id}`,
                type: 'lecture',
                depth: 2,
                data: lecture,
                description: lecture.description,
                badge: lecture.assets.length ? `${lecture.assets.length} assets` : undefined,
              };
              if (!filter || this.matchesFilter(lectureRow, filter)) {
                rows.push(lectureRow);
              }
            }
          }
        }
      }
    }
    return rows;
  }

  private matchesFilter(row: TreeRow, filter: string): boolean {
    if (!filter) {
      return true;
    }
    const value = `${row.data.name} ${row.description ?? ''}`.toLowerCase();
    return value.includes(filter);
  }

  private renderVirtualized(force = false): void {
    const list = this.treeHost.querySelector<HTMLElement>('.curriculum-list');
    if (!list) {
      return;
    }
    if (!force && !this.rows.length) {
      return;
    }
    const { scrollTop, clientHeight } = list;
    const start = Math.max(Math.floor(scrollTop / ROW_HEIGHT) - 2, 0);
    const end = Math.min(start + Math.ceil(clientHeight / ROW_HEIGHT) + 6, this.rows.length);
    const visible = this.rows.slice(start, end);

    const fragment = document.createDocumentFragment();
    visible.forEach((row) => {
      fragment.appendChild(this.createRowElement(row));
    });

    const spacerTop = document.createElement('div');
    spacerTop.style.height = `${start * ROW_HEIGHT}px`;
    const spacerBottom = document.createElement('div');
    spacerBottom.style.height = `${(this.rows.length - end) * ROW_HEIGHT}px`;

    const viewport = document.createElement('div');
    viewport.className = 'curriculum-viewport';
    viewport.appendChild(spacerTop);
    viewport.appendChild(fragment);
    viewport.appendChild(spacerBottom);

    list.replaceChildren(viewport);
  }

  private createRowElement(row: TreeRow): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'curriculum-row';
    button.dataset.key = row.key;
    button.dataset.type = row.type;
    button.setAttribute('role', row.type === 'lecture' ? 'treeitem' : 'group');
    button.style.setProperty('--depth', String(row.depth));

    const title = document.createElement('span');
    title.className = 'curriculum-row__title';
    title.textContent = row.data.name;
    button.appendChild(title);

    if (row.description) {
      const description = document.createElement('span');
      description.className = 'curriculum-row__description';
      description.textContent = row.description;
      button.appendChild(description);
    }

    if (row.badge) {
      const badge = document.createElement('span');
      badge.className = 'curriculum-row__badge';
      badge.textContent = row.badge;
      button.appendChild(badge);
    }

    const selection = this.store.getState().curriculum.selection;

    if (row.type === 'class') {
      const classId = (row.data as ClassSummary).id;
      button.dataset.classId = classId;
      button.setAttribute('aria-expanded', String(this.expandedClasses.has(classId)));
      button.setAttribute('role', 'treeitem');
      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'curriculum-row__indicator';
      toggleIcon.textContent = this.expandedClasses.has(classId) ? '−' : '+';
      button.appendChild(toggleIcon);
      if (selection.classId === classId) {
        button.classList.add('is-selected');
      }
    } else if (row.type === 'module') {
      const module = row.data as ModuleSummary;
      const key = this.moduleKey(module.classId, module.id);
      button.dataset.classId = module.classId;
      button.dataset.moduleId = module.id;
      button.setAttribute('aria-expanded', String(this.expandedModules.has(key)));
      button.setAttribute('role', 'treeitem');
      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'curriculum-row__indicator';
      toggleIcon.textContent = this.expandedModules.has(key) ? '−' : '+';
      button.appendChild(toggleIcon);
      if (selection.moduleId === module.id) {
        button.classList.add('is-selected');
      }
    } else {
      const lecture = row.data as LectureSummary;
      button.dataset.classId = lecture.classId;
      button.dataset.moduleId = lecture.moduleId;
      button.dataset.lectureId = lecture.id;
      button.setAttribute('role', 'treeitem');
      const toggleIcon = document.createElement('span');
      toggleIcon.className = 'curriculum-row__indicator';
      toggleIcon.textContent = '›';
      button.appendChild(toggleIcon);
      if (selection.lectureId === lecture.id) {
        button.classList.add('is-selected');
      }
    }

    return button;
  }

  private moduleKey(classId: Identifier, moduleId: Identifier): string {
    return `${classId}:${moduleId}`;
  }

  private async handleTreeClick(event: MouseEvent): Promise<void> {
    const target = event.target as HTMLElement;
    const button = target.closest<HTMLButtonElement>('.curriculum-row');
    if (!button) {
      return;
    }
    const key = button.dataset.key;
    const type = button.dataset.type as TreeRow['type'];
    if (!key || !type) {
      return;
    }
    if (type === 'class') {
      const classId = button.dataset.classId;
      if (classId) {
        await this.toggleClass(classId);
      }
    } else if (type === 'module') {
      const classId = button.dataset.classId;
      const moduleId = button.dataset.moduleId;
      if (classId && moduleId) {
        await this.toggleModule(classId, moduleId);
      }
    } else if (type === 'lecture') {
      const lectureId = button.dataset.lectureId;
      if (lectureId) {
        await this.selectLecture(lectureId);
      }
    }
  }

  private async toggleClass(classId: Identifier): Promise<void> {
    if (this.expandedClasses.has(classId)) {
      this.expandedClasses.delete(classId);
      this.renderVirtualized(true);
      return;
    }
    this.expandedClasses.add(classId);
    await this.ensureModulesLoaded(classId);
    this.store.update((draft) => {
      draft.curriculum.selection.classId = classId;
      draft.curriculum.selection.moduleId = null;
      draft.curriculum.selection.lectureId = null;
    });
    this.renderVirtualized(true);
  }

  private async toggleModule(classId: Identifier, moduleId: Identifier): Promise<void> {
    const key = this.moduleKey(classId, moduleId);
    if (this.expandedModules.has(key)) {
      this.expandedModules.delete(key);
      this.renderVirtualized(true);
      return;
    }
    this.expandedModules.add(key);
    await this.ensureLecturesLoaded(classId, moduleId);
    this.store.update((draft) => {
      draft.curriculum.selection.classId = classId;
      draft.curriculum.selection.moduleId = moduleId;
      draft.curriculum.selection.lectureId = null;
    });
    this.renderVirtualized(true);
  }

  private async ensureModulesLoaded(classId: Identifier): Promise<void> {
    const state = this.store.getState();
    const node = state.curriculum.nodes.get(classId);
    if (!node || node.modules.size) {
      return;
    }
    try {
      const response = await listModules(classId, 0, PAGE_SIZE);
      this.store.update((draft) => {
        const draftNode = draft.curriculum.nodes.get(classId);
        if (!draftNode) {
          return;
        }
        response.items.forEach((moduleInfo) => {
          draftNode.modules.set(moduleInfo.id, {
            moduleInfo,
            lectures: new Map(),
          });
        });
      });
    } catch (error) {
      console.error('Failed to load modules', error);
    }
  }

  private async ensureLecturesLoaded(classId: Identifier, moduleId: Identifier): Promise<void> {
    const state = this.store.getState();
    const node = state.curriculum.nodes.get(classId);
    const module = node?.modules.get(moduleId);
    if (!module || module.lectures.size) {
      return;
    }
    try {
      const response = await listLectures(classId, moduleId, 0, PAGE_SIZE);
      this.store.update((draft) => {
        const draftModule = draft.curriculum.nodes.get(classId)?.modules.get(moduleId);
        if (!draftModule) {
          return;
        }
        response.items.forEach((lecture) => {
          draftModule.lectures.set(lecture.id, lecture);
        });
      });
    } catch (error) {
      console.error('Failed to load lectures', error);
    }
  }

  private async selectLecture(lectureId: Identifier): Promise<void> {
    try {
      const detail = await getLecture(lectureId);
      this.store.update((draft) => {
        draft.curriculum.selection.lectureId = lectureId;
        draft.curriculum.selection.classId = detail.classId;
        draft.curriculum.selection.moduleId = detail.moduleId;
        draft.lecture.detail = detail;
        draft.lecture.loading = false;
        draft.lecture.error = null;
      });
    } catch (error) {
      this.store.update((draft) => {
        draft.lecture.loading = false;
        draft.lecture.error = 'Failed to load lecture';
      });
      console.error('Failed to load lecture detail', error);
    }
  }

  private refreshRows(): void {
    const state = this.store.getState();
    this.rows = this.buildRows(state.curriculum);
    this.renderVirtualized(true);
  }

  private renderSnapshot(snapshot: CurriculumSnapshot): void {
    const fragment = document.createDocumentFragment();
    this.appendStat(fragment, 'Classes', snapshot.totals.classes);
    this.appendStat(fragment, 'Modules', snapshot.totals.modules);
    this.appendStat(fragment, 'Lectures', snapshot.totals.lectures);
    Object.entries(snapshot.totals.assets).forEach(([key, value]) => {
      this.appendStat(fragment, key, value);
    });
    this.statsHost.replaceChildren(fragment);
    toggle(this.statsHost.parentElement, true);
  }

  private appendStat(target: DocumentFragment, label: string, value: number): void {
    const term = document.createElement('dt');
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.textContent = String(value);
    target.append(term, definition);
  }
}
