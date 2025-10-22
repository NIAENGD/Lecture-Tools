import {
  createLecture,
  deleteLecture,
  getLecture,
  listModules,
  removeAsset,
  triggerSlideProcessing,
  triggerTranscription,
  updateLecture,
  uploadAsset,
} from '../api';
import type { Identifier, LectureAsset, LectureDetail, ModuleSummary } from '../types';
import type { AppState, Store } from '../store';
import {
  createElement,
  formatBytes,
  formatDate,
  formatPercent,
  qs,
  renderList,
  toggle,
} from '../utils/dom';

interface AssetType {
  kind: string;
  label: string;
  accept: string;
  description: string;
}

const ASSET_TYPES: AssetType[] = [
  { kind: 'audio', label: 'Audio', accept: 'audio/*', description: 'Upload raw or mastered audio tracks' },
  {
    kind: 'transcript',
    label: 'Transcript',
    accept: '.txt,.json,.srt,.vtt,.tsv',
    description: 'Attach generated or manual transcripts',
  },
  { kind: 'slides', label: 'Slides', accept: '.pdf', description: 'Provide slide decks for previewing' },
  { kind: 'notes', label: 'Notes', accept: '.md,.txt,.json,.pdf', description: 'Add lecture notes or outlines' },
];

export class LectureDetailController {
  private store: Store;

  private detailContainer: HTMLElement;

  private summaryContainer: HTMLElement;

  private assetSection: HTMLElement;

  private assetList: HTMLUListElement;

  private editToggle: HTMLButtonElement;

  private deleteButton: HTMLButtonElement;

  private editForm: HTMLFormElement;

  private editName: HTMLInputElement;

  private editModule: HTMLSelectElement;

  private editDescription: HTMLTextAreaElement;

  private editModeBanner: HTMLElement;

  private createForm: HTMLFormElement;

  private createModule: HTMLSelectElement;

  private createName: HTMLInputElement;

  private createDescription: HTMLTextAreaElement;

  private editActions: HTMLElement;

  private ingestionActions: HTMLElement;

  private currentCreateModuleClass: Identifier | null = null;

  constructor(store: Store, root: HTMLElement) {
    this.store = store;
    this.detailContainer = root;
    this.summaryContainer = qs<HTMLElement>(root, '#lecture-summary');
    this.assetSection = qs<HTMLElement>(root, '#asset-section');
    this.assetList = qs<HTMLUListElement>(root, '#asset-list');
    this.editToggle = qs<HTMLButtonElement>(root, '#toggle-edit-mode');
    this.deleteButton = qs<HTMLButtonElement>(root, '#delete-lecture');
    this.editForm = qs<HTMLFormElement>(root, '#lecture-edit-form');
    this.editName = qs<HTMLInputElement>(root, '#edit-lecture-name');
    this.editModule = qs<HTMLSelectElement>(root, '#edit-lecture-module');
    this.editDescription = qs<HTMLTextAreaElement>(root, '#edit-lecture-description');
    this.editModeBanner = qs<HTMLElement>(root, '#edit-mode-banner');
    this.createForm = qs<HTMLFormElement>(root, '#lecture-create-form');
    this.createModule = qs<HTMLSelectElement>(root, '#create-module');
    this.createName = qs<HTMLInputElement>(root, '#create-name');
    this.createDescription = qs<HTMLTextAreaElement>(root, '#create-description');
    this.editActions = this.ensureActionsContainer('detail');
    this.ingestionActions = this.ensureActionsContainer('ingestion');
  }

  init(): void {
    this.editToggle.addEventListener('click', () => {
      this.store.update((draft) => {
        draft.lecture.editMode = !draft.lecture.editMode;
      });
      this.renderLectureDetail(this.store.getState().lecture.detail);
    });

    this.editForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.saveLectureChanges();
    });

    this.deleteButton.addEventListener('click', () => {
      void this.deleteSelectedLecture();
    });

    this.createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.createLectureFromForm();
    });

    this.store.subscribe((state) => {
      this.renderLectureDetail(state.lecture.detail);
      this.syncCreateModules(state);
    });

    this.renderCreateActions();
  }

  private async saveLectureChanges(): Promise<void> {
    const detail = this.store.getState().lecture.detail;
    if (!detail) {
      return;
    }
    try {
      const payload = {
        name: this.editName.value.trim(),
        description: this.editDescription.value.trim(),
        moduleId: this.editModule.value,
      };
      const updated = await updateLecture(detail.id, payload);
      this.store.update((draft) => {
        draft.lecture.detail = updated;
        draft.lecture.editMode = false;
      });
      await this.refreshLectureModules(detail.classId);
    } catch (error) {
      console.error('Failed to update lecture', error);
    }
  }

  private async deleteSelectedLecture(): Promise<void> {
    const detail = this.store.getState().lecture.detail;
    if (!detail) {
      return;
    }
    if (!window.confirm(`Delete lecture "${detail.name}"? This cannot be undone.`)) {
      return;
    }
    try {
      await deleteLecture(detail.id);
      this.store.update((draft) => {
        draft.lecture.detail = null;
        draft.curriculum.selection.lectureId = null;
      });
      await this.refreshLectureModules(detail.classId);
    } catch (error) {
      console.error('Failed to delete lecture', error);
    }
  }

  private async createLectureFromForm(): Promise<void> {
    const classId = this.createModule.selectedOptions[0]?.dataset.classId;
    const moduleId = this.createModule.value;
    if (!classId || !moduleId) {
      return;
    }
    try {
      const payload = {
        classId,
        moduleId,
        name: this.createName.value.trim(),
        description: this.createDescription.value.trim(),
      };
      const created = await createLecture(payload);
      this.createForm.reset();
      await this.refreshLectureModules(classId);
      const detail = await getLecture(created.id);
      this.store.update((draft) => {
        draft.lecture.detail = detail;
        draft.curriculum.selection = {
          classId: detail.classId,
          moduleId: detail.moduleId,
          lectureId: detail.id,
        };
      });
    } catch (error) {
      console.error('Failed to create lecture', error);
    }
  }

  private async refreshLectureModules(classId: Identifier): Promise<void> {
    try {
      const modules = await listModules(classId, 0, 200);
      this.populateModuleOptions(modules.items);
    } catch (error) {
      console.warn('Failed to refresh modules', error);
    }
  }

  private populateModuleOptions(modules: ModuleSummary[]): void {
    const editFragment = document.createDocumentFragment();
    const createFragment = document.createDocumentFragment();
    modules.forEach((module) => {
      const base = document.createElement('option');
      base.value = module.id;
      base.textContent = module.name;
      base.dataset.classId = module.classId;
      editFragment.appendChild(base.cloneNode(true));
      createFragment.appendChild(base);
    });
    this.editModule.replaceChildren(editFragment);
    this.createModule.replaceChildren(createFragment);
  }

  private syncCreateModules(state: AppState): void {
    const availableClasses = Array.from(state.curriculum.nodes.keys());
    const targetClass = state.curriculum.selection.classId ?? availableClasses[0] ?? null;
    if (!targetClass) {
      return;
    }
    const node = state.curriculum.nodes.get(targetClass);
    if (!node || node.modules.size === 0) {
      return;
    }
    if (this.currentCreateModuleClass === targetClass && this.createModule.options.length === node.modules.size) {
      return;
    }
    this.currentCreateModuleClass = targetClass;
    const modules = Array.from(node.modules.values()).map((entry) => entry.moduleInfo);
    this.populateModuleOptions(modules);
    if (!state.lecture.detail) {
      this.createModule.value = modules[0]?.id ?? '';
    }
  }

  private ensureActionsContainer(scope: 'detail' | 'ingestion'): HTMLElement {
    let container = this.detailContainer.querySelector<HTMLElement>(
      scope === 'detail' ? '#lecture-actions' : '#create-actions',
    );
    if (!container) {
      container = document.createElement('div');
      container.id = scope === 'detail' ? 'lecture-actions' : 'create-actions';
      container.className = 'action-bar';
      if (scope === 'detail') {
        this.summaryContainer.insertAdjacentElement('afterend', container);
      } else {
        this.createForm.insertAdjacentElement('beforebegin', container);
      }
    }
    return container;
  }

  private renderLectureDetail(detail: LectureDetail | null): void {
    toggle(this.deleteButton, Boolean(detail));
    toggle(this.assetSection, Boolean(detail));
    toggle(this.editForm, Boolean(detail) && this.store.getState().lecture.editMode);
    toggle(this.editModeBanner, Boolean(detail) && this.store.getState().lecture.editMode);
    toggle(this.summaryContainer, Boolean(detail));

    if (!detail) {
      this.summaryContainer.textContent = 'Select a lecture from the curriculum.';
      this.assetList.replaceChildren();
      this.editActions.replaceChildren();
      this.editToggle.setAttribute('aria-pressed', 'false');
      this.editToggle.textContent = 'Enable edit mode';
      return;
    }

    this.summaryContainer.replaceChildren(this.buildSummary(detail));

    this.editName.value = detail.name;
    this.editDescription.value = detail.description ?? '';
    this.editToggle.setAttribute('aria-pressed', String(this.store.getState().lecture.editMode));
    this.editToggle.textContent = this.store.getState().lecture.editMode
      ? 'Disable edit mode'
      : 'Enable edit mode';

    void this.refreshLectureModules(detail.classId).then(() => {
      this.editModule.value = detail.moduleId;
    });

    this.renderAssets(detail);
    this.renderDetailActions(detail);
  }

  private buildSummary(detail: LectureDetail): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lecture-summary';

    const title = createElement('h3', { className: 'lecture-title', text: detail.name });
    container.appendChild(title);

    if (detail.description) {
      container.appendChild(createElement('p', { className: 'lecture-description', text: detail.description }));
    }

    const metadata = createElement('dl', { className: 'lecture-metadata' });
    metadata.appendChild(createElement('dt', { text: 'Module' }));
    metadata.appendChild(createElement('dd', { text: detail.moduleId }));
    if (detail.durationSeconds) {
      const minutes = Math.round(detail.durationSeconds / 60);
      metadata.appendChild(createElement('dt', { text: 'Duration' }));
      metadata.appendChild(createElement('dd', { text: `${minutes} min` }));
    }
    if (detail.language) {
      metadata.appendChild(createElement('dt', { text: 'Language' }));
      metadata.appendChild(createElement('dd', { text: detail.language }));
    }
    if (detail.updatedAt) {
      metadata.appendChild(createElement('dt', { text: 'Updated' }));
      metadata.appendChild(createElement('dd', { text: formatDate(detail.updatedAt) }));
    }
    container.appendChild(metadata);

    return container;
  }

  private renderAssets(detail: LectureDetail): void {
    const items = detail.assets;
    renderList(this.assetList, items, (asset) => this.createAssetRow(detail, asset));

    const missingKinds = ASSET_TYPES.filter((type) => !items.some((asset) => asset.kind === type.kind));
    if (missingKinds.length) {
      const missingList = document.createElement('li');
      missingList.className = 'asset-missing';
      missingList.textContent = `Missing assets: ${missingKinds.map((type) => type.label).join(', ')}`;
      this.assetList.appendChild(missingList);
    }
  }

  private createAssetRow(detail: LectureDetail, asset: LectureAsset): HTMLElement {
    const item = document.createElement('li');
    item.className = 'asset-item';
    item.dataset.assetId = asset.id;
    item.dataset.kind = asset.kind;

    const header = createElement('div', { className: 'asset-header' });
    header.appendChild(createElement('span', { className: 'asset-kind', text: asset.kind }));
    header.appendChild(createElement('strong', { className: 'asset-name', text: asset.name }));
    item.appendChild(header);

    const meta = createElement('div', { className: 'asset-meta' });
    meta.appendChild(createElement('span', { text: formatBytes(asset.size) }));
    if (asset.updatedAt) {
      meta.appendChild(createElement('span', { text: formatDate(asset.updatedAt) }));
    }
    if (asset.status) {
      meta.appendChild(createElement('span', { text: asset.status }));
    }
    if (asset.progress !== undefined && asset.progress !== null) {
      meta.appendChild(createElement('span', { text: formatPercent(asset.progress) }));
    }
    item.appendChild(meta);

    const actions = createElement('div', { className: 'asset-actions' });
    const uploadButton = createElement('button', { className: 'button button--ghost', text: 'Replace' });
    uploadButton.addEventListener('click', () => {
      void this.openUploadDialog(detail, asset.kind);
    });
    actions.appendChild(uploadButton);

    const removeButton = createElement('button', { className: 'button button--danger', text: 'Remove' });
    removeButton.addEventListener('click', () => {
      void this.removeAsset(detail, asset.kind);
    });
    actions.appendChild(removeButton);

    if (asset.url) {
      const download = createElement('a', { className: 'button button--secondary', text: 'Download' });
      download.href = asset.url;
      download.target = '_blank';
      download.rel = 'noopener noreferrer';
      actions.appendChild(download);
    }

    item.appendChild(actions);

    return item;
  }

  private renderDetailActions(detail: LectureDetail): void {
    this.editActions.replaceChildren();
    const uploadMenu = createElement('div', { className: 'action-group' });
    const uploadLabel = createElement('span', { className: 'action-label', text: 'Upload assets' });
    uploadMenu.appendChild(uploadLabel);
    ASSET_TYPES.forEach((type) => {
      const button = createElement('button', {
        className: 'button button--ghost',
        text: type.label,
      });
      button.addEventListener('click', () => {
        void this.openUploadDialog(detail, type.kind, type.accept, type.description);
      });
      uploadMenu.appendChild(button);
    });
    this.editActions.appendChild(uploadMenu);

    const processing = createElement('div', { className: 'action-group' });
    processing.appendChild(createElement('span', { className: 'action-label', text: 'Automation' }));

    const transcribeButton = createElement('button', {
      className: 'button button--primary',
      text: 'Transcribe audio',
    });
    transcribeButton.addEventListener('click', () => {
      void this.requestTranscription(detail);
    });
    processing.appendChild(transcribeButton);

    const slideButton = createElement('button', {
      className: 'button button--secondary',
      text: 'Process slides',
    });
    slideButton.addEventListener('click', () => {
      void this.requestSlideProcessing(detail);
    });
    processing.appendChild(slideButton);

    this.editActions.appendChild(processing);
  }

  private async openUploadDialog(
    detail: LectureDetail,
    kind: string,
    accept = '*/*',
    description?: string,
  ): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (description) {
      input.title = description;
    }
    input.click();
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      try {
        await uploadAsset({
          lectureId: detail.id,
          kind,
          file,
          onProgress: (uploaded, total) => {
            console.debug(`Uploading ${kind}: ${uploaded}/${total}`);
          },
        });
        const updated = await getLecture(detail.id);
        this.store.update((draft) => {
          draft.lecture.detail = updated;
        });
      } catch (error) {
        console.error('Failed to upload asset', error);
      }
    });
  }

  private async removeAsset(detail: LectureDetail, kind: string): Promise<void> {
    if (!window.confirm(`Remove ${kind} asset?`)) {
      return;
    }
    try {
      await removeAsset(detail.id, kind);
      const updated = await getLecture(detail.id);
      this.store.update((draft) => {
        draft.lecture.detail = updated;
      });
    } catch (error) {
      console.error('Failed to remove asset', error);
    }
  }

  private async requestTranscription(detail: LectureDetail): Promise<void> {
    try {
      await triggerTranscription(detail.id, { model: 'medium', useGPU: true });
    } catch (error) {
      console.error('Failed to start transcription', error);
    }
  }

  private async requestSlideProcessing(detail: LectureDetail): Promise<void> {
    try {
      await triggerSlideProcessing(detail.id, { startPage: 1, endPage: 0 });
    } catch (error) {
      console.error('Failed to process slides', error);
    }
  }

  private renderCreateActions(): void {
    this.ingestionActions.replaceChildren();
    const intro = createElement('p', {
      className: 'action-help',
      text: 'Add course assets after creating a lecture. Uploading files will immediately start background processing.',
    });
    this.ingestionActions.appendChild(intro);

    const chips = createElement('div', { className: 'action-group' });
    chips.appendChild(createElement('span', { className: 'action-label', text: 'Supported assets' }));
    ASSET_TYPES.forEach((type) => {
      chips.appendChild(
        createElement('span', {
          className: 'action-chip',
          text: `${type.label} (${type.accept || 'any'})`,
        }),
      );
    });
    this.ingestionActions.appendChild(chips);
  }
}
