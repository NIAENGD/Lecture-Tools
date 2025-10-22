import { cancelProgress, fetchProgressQueue, subscribeToProgress } from '../api';
import type { JobProgress } from '../types';
import type { Store } from '../store';
import { createElement, formatDate, formatPercent, qs, toggle } from '../utils/dom';

export class ProgressController {
  private store: Store;

  private root: HTMLElement;

  private list: HTMLUListElement;

  private emptyState: HTMLElement;

  private refreshButton: HTMLButtonElement;

  private unsubscribe: (() => void) | null = null;

  constructor(store: Store, root: HTMLElement) {
    this.store = store;
    this.root = root;
    this.list = qs<HTMLUListElement>(root, '#progress-list');
    this.emptyState = qs<HTMLElement>(root, '#progress-empty');
    this.refreshButton = qs<HTMLButtonElement>(root, '#progress-refresh');
  }

  init(): void {
    this.refreshButton.addEventListener('click', () => {
      void this.refresh();
    });

    this.unsubscribe = subscribeToProgress((progress) => {
      this.store.update((draft) => {
        draft.progress.queue.set(progress.id, progress);
        draft.progress.lastUpdated = Date.now();
      });
    });

    this.store.subscribe(({ progress }) => {
      this.render(Array.from(progress.queue.values()));
    });

    void this.refresh();
  }

  private async refresh(): Promise<void> {
    try {
      const queue = await fetchProgressQueue();
      this.store.update((draft) => {
        draft.progress.queue.clear();
        queue.forEach((entry) => {
          draft.progress.queue.set(entry.id, entry);
        });
        draft.progress.lastUpdated = Date.now();
      });
    } catch (error) {
      console.error('Failed to fetch progress queue', error);
    }
  }

  private render(entries: JobProgress[]): void {
    toggle(this.emptyState, entries.length === 0);
    toggle(this.list, entries.length > 0);

    const fragment = document.createDocumentFragment();
    entries
      .sort((a, b) => (a.startedAt && b.startedAt ? b.startedAt.localeCompare(a.startedAt) : 0))
      .forEach((entry) => {
        fragment.appendChild(this.createItem(entry));
      });
    this.list.replaceChildren(fragment);
  }

  private createItem(entry: JobProgress): HTMLElement {
    const item = createElement('li', { className: 'progress-item' });
    const header = createElement('div', { className: 'progress-header-row' });
    header.appendChild(createElement('h3', { className: 'progress-title', text: entry.label }));
    header.appendChild(createElement('span', { className: 'progress-status', text: entry.status }));
    item.appendChild(header);

    const details = createElement('div', { className: 'progress-details' });
    if (entry.percent !== null && entry.percent !== undefined) {
      details.appendChild(
        createElement('span', {
          className: 'progress-percent',
          text: formatPercent(entry.percent),
        }),
      );
    }
    if (entry.step) {
      details.appendChild(createElement('span', { className: 'progress-step', text: entry.step }));
    }
    if (entry.details) {
      details.appendChild(createElement('span', { className: 'progress-message', text: entry.details }));
    }
    if (entry.startedAt) {
      details.appendChild(
        createElement('span', { className: 'progress-timestamp', text: formatDate(entry.startedAt) }),
      );
    }
    item.appendChild(details);

    const actions = createElement('div', { className: 'progress-actions' });
    const cancel = createElement('button', { className: 'button button--danger', text: 'Cancel' });
    cancel.disabled = entry.status === 'succeeded' || entry.status === 'failed';
    cancel.addEventListener('click', () => {
      if (entry.lectureId) {
        void cancelProgress(entry.lectureId, entry.id);
      }
    });
    actions.appendChild(cancel);
    item.appendChild(actions);

    return item;
  }

  destroy(): void {
    this.unsubscribe?.();
  }
}
