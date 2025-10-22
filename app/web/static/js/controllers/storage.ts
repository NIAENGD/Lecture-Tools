import {
  downloadStorageArchive,
  getStorageListing,
  getStorageUsage,
  purgeProcessedAudio,
} from '../api';
import type { StorageEntry, StorageListing, StorageUsage } from '../types';
import type { Store } from '../store';
import {
  createElement,
  formatBytes,
  formatDate,
  qs,
  toggle,
} from '../utils/dom';

export class StorageController {
  private store: Store;

  private root: HTMLElement;

  private pathLabel: HTMLElement;

  private tableBody: HTMLTableSectionElement;

  private tableWrapper: HTMLElement;

  private emptyState: HTMLElement;

  private loadingState: HTMLElement;

  private refreshButton: HTMLButtonElement;

  private rootButton: HTMLButtonElement;

  private upButton: HTMLButtonElement;

  private downloadSelectedButton: HTMLButtonElement;

  private purgeButton: HTMLButtonElement;

  private usedLabel: HTMLElement;

  private availableLabel: HTMLElement;

  private totalLabel: HTMLElement;

  private selected = new Set<string>();

  private currentPath = '';

  constructor(store: Store, root: HTMLElement) {
    this.store = store;
    this.root = root;
    this.pathLabel = qs<HTMLElement>(root, '#storage-path');
    this.tableBody = qs<HTMLTableSectionElement>(root, '#storage-browser-body');
    this.tableWrapper = qs<HTMLElement>(root, '#storage-browser-table-wrapper');
    this.emptyState = qs<HTMLElement>(root, '#storage-browser-empty');
    this.loadingState = qs<HTMLElement>(root, '#storage-browser-loading');
    this.refreshButton = qs<HTMLButtonElement>(root, '#storage-refresh');
    this.rootButton = qs<HTMLButtonElement>(root, '#storage-nav-root');
    this.upButton = qs<HTMLButtonElement>(root, '#storage-nav-up');
    this.downloadSelectedButton = qs<HTMLButtonElement>(root, '#storage-download-selected');
    this.purgeButton = qs<HTMLButtonElement>(root, '#storage-purge');
    this.usedLabel = qs<HTMLElement>(root, '#storage-used');
    this.availableLabel = qs<HTMLElement>(root, '#storage-available');
    this.totalLabel = qs<HTMLElement>(root, '#storage-total');
  }

  init(): void {
    this.refreshButton.addEventListener('click', () => {
      void this.load(this.currentPath);
    });
    this.rootButton.addEventListener('click', () => {
      void this.load('');
    });
    this.upButton.addEventListener('click', () => {
      const segments = this.currentPath.split('/').filter(Boolean);
      segments.pop();
      void this.load(segments.join('/'));
    });
    this.downloadSelectedButton.addEventListener('click', () => {
      void this.downloadSelected();
    });
    this.purgeButton.addEventListener('click', () => {
      void this.purgeAudio();
    });

    void this.load('');
    void this.refreshUsage();
  }

  private async load(path: string): Promise<void> {
    this.currentPath = path;
    this.selected.clear();
    this.updateSelectionState();
    try {
      toggle(this.loadingState, true);
      const listing = await getStorageListing(path);
      this.renderListing(listing);
    } catch (error) {
      console.error('Failed to load storage listing', error);
    } finally {
      toggle(this.loadingState, false);
    }
  }

  private renderListing(listing: StorageListing): void {
    this.pathLabel.textContent = listing.path || '/';
    toggle(this.emptyState, listing.entries.length === 0);
    toggle(this.tableWrapper, listing.entries.length > 0);

    const fragment = document.createDocumentFragment();
    listing.entries
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        fragment.appendChild(this.createRow(entry));
      });
    this.tableBody.replaceChildren(fragment);
  }

  private createRow(entry: StorageEntry): HTMLElement {
    const row = document.createElement('tr');
    row.dataset.path = entry.path;

    const selectCell = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.disabled = entry.type === 'directory' && !entry.downloadable;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.selected.add(entry.path);
      } else {
        this.selected.delete(entry.path);
      }
      this.updateSelectionState();
    });
    selectCell.appendChild(checkbox);
    row.appendChild(selectCell);

    const nameCell = document.createElement('td');
    const nameButton = createElement('button', {
      className: 'button button--link',
      text: entry.name,
    });
    if (entry.type === 'directory') {
      nameButton.addEventListener('click', () => {
        void this.load(entry.path);
      });
    } else if (entry.downloadable) {
      nameButton.addEventListener('click', () => {
        void this.downloadEntry(entry);
      });
    }
    nameCell.appendChild(nameButton);
    row.appendChild(nameCell);

    row.appendChild(createElement('td', { text: entry.type }));
    row.appendChild(createElement('td', { text: formatBytes(entry.size) }));
    row.appendChild(createElement('td', { text: formatDate(entry.modifiedAt ?? null) }));

    const actionsCell = document.createElement('td');
    if (entry.downloadable && entry.type === 'file') {
      const downloadButton = createElement('button', {
        className: 'button button--ghost',
        text: 'Download',
      });
      downloadButton.addEventListener('click', () => {
        void this.downloadEntry(entry);
      });
      actionsCell.appendChild(downloadButton);
    }
    row.appendChild(actionsCell);

    return row;
  }

  private updateSelectionState(): void {
    this.downloadSelectedButton.disabled = this.selected.size === 0;
  }

  private async downloadEntry(entry: StorageEntry): Promise<void> {
    try {
      const blob = await downloadStorageArchive([entry.path]);
      this.saveBlob(blob, `${entry.name}.zip`);
    } catch (error) {
      console.error('Failed to download entry', error);
    }
  }

  private async downloadSelected(): Promise<void> {
    if (this.selected.size === 0) {
      return;
    }
    try {
      const blob = await downloadStorageArchive(Array.from(this.selected));
      this.saveBlob(blob, 'lecture-storage.zip');
    } catch (error) {
      console.error('Failed to download archive', error);
    }
  }

  private saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async purgeAudio(): Promise<void> {
    if (!window.confirm('Remove all mastered audio assets?')) {
      return;
    }
    try {
      await purgeProcessedAudio();
      await this.refreshUsage();
      await this.load(this.currentPath);
    } catch (error) {
      console.error('Failed to purge processed audio', error);
    }
  }

  private async refreshUsage(): Promise<void> {
    try {
      const usage = await getStorageUsage();
      this.renderUsage(usage);
    } catch (error) {
      console.warn('Failed to load storage usage', error);
    }
  }

  private renderUsage(usage: StorageUsage): void {
    this.usedLabel.textContent = formatBytes(usage.usedBytes);
    this.totalLabel.textContent = formatBytes(usage.totalBytes);
    const available = Math.max(usage.totalBytes - usage.usedBytes, 0);
    this.availableLabel.textContent = formatBytes(available);
  }
}
