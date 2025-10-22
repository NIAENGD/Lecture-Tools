import { getGPUStatus, getSettings, testGPU, updateSettings } from '../api';
import type { GPUStatus, SettingsPayload, Theme } from '../types';
import type { Store } from '../store';
import { qs } from '../utils/dom';

export class SettingsController {
  private store: Store;

  private root: HTMLElement;

  private themeSelect: HTMLSelectElement;

  private languageSelect: HTMLSelectElement;

  private autoMasteringCheckbox: HTMLInputElement;

  private modelSelect: HTMLSelectElement;

  private gpuStatusLabel: HTMLElement;

  private gpuTestButton: HTMLButtonElement;

  private debugCheckbox: HTMLInputElement;

  constructor(store: Store, root: HTMLElement) {
    this.store = store;
    this.root = root;
    this.themeSelect = qs<HTMLSelectElement>(root, '#settings-theme');
    this.languageSelect = qs<HTMLSelectElement>(root, '#settings-language');
    this.autoMasteringCheckbox = qs<HTMLInputElement>(root, '#settings-audio-mastering');
    this.modelSelect = qs<HTMLSelectElement>(root, '#settings-whisper-model');
    this.gpuStatusLabel = qs<HTMLElement>(root, '#settings-whisper-gpu-status');
    this.gpuTestButton = qs<HTMLButtonElement>(root, '#settings-whisper-gpu-test');
    this.debugCheckbox = qs<HTMLInputElement>(root, '#settings-debug-enabled');
  }

  init(): void {
    this.themeSelect.addEventListener('change', () => {
      void this.persistSettings({ theme: this.themeSelect.value as Theme });
    });
    this.languageSelect.addEventListener('change', () => {
      void this.persistSettings({ language: this.languageSelect.value });
    });
    this.autoMasteringCheckbox.addEventListener('change', () => {
      void this.persistSettings({ autoMastering: this.autoMasteringCheckbox.checked });
    });
    this.modelSelect.addEventListener('change', () => {
      void this.persistSettings({ defaultWhisperModel: this.modelSelect.value });
    });
    this.gpuTestButton.addEventListener('click', () => {
      void this.runGPUTest();
    });
    this.debugCheckbox.addEventListener('change', () => {
      document.body.classList.toggle('debug-enabled', this.debugCheckbox.checked);
    });

    this.store.subscribe(({ settings }) => {
      if (settings.settings) {
        this.syncSettings(settings.settings);
      }
      if (settings.gpu) {
        this.renderGPUStatus(settings.gpu);
      }
      this.themeSelect.value = settings.theme;
    });

    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const [settings, gpu] = await Promise.all([getSettings(), getGPUStatus()]);
      this.store.update((draft) => {
        draft.settings.settings = settings;
        draft.settings.theme = settings.theme ?? 'system';
        draft.settings.language = settings.language ?? 'en';
        draft.settings.gpu = gpu;
      });
      this.syncSettings(settings);
      this.renderGPUStatus(gpu);
      this.applyThemeLocal((settings.theme ?? 'system') as Theme);
      this.applyLanguageLocal(settings.language ?? 'en');
    } catch (error) {
      console.error('Failed to load settings', error);
    }
  }

  private syncSettings(settings: SettingsPayload): void {
    this.themeSelect.value = settings.theme;
    this.languageSelect.value = settings.language;
    this.autoMasteringCheckbox.checked = settings.autoMastering;
    if (settings.defaultWhisperModel) {
      this.modelSelect.value = settings.defaultWhisperModel;
    }
  }

  private async persistSettings(patch: Partial<SettingsPayload>): Promise<void> {
    try {
      const next = await updateSettings(patch);
      this.store.update((draft) => {
        draft.settings.settings = next;
        draft.settings.theme = next.theme;
        draft.settings.language = next.language;
      });
      if (patch.theme !== undefined) {
        this.applyThemeLocal(next.theme);
      }
      if (patch.language !== undefined) {
        this.applyLanguageLocal(next.language);
      }
    } catch (error) {
      console.error('Failed to update settings', error);
    }
  }

  private applyThemeLocal(theme: Theme): void {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.dataset.theme = theme;
    }
  }

  private applyLanguageLocal(language: string): void {
    document.documentElement.lang = language;
  }

  private renderGPUStatus(status: GPUStatus): void {
    if (status.available) {
      this.gpuStatusLabel.textContent = status.backend
        ? `GPU acceleration ready (${status.backend})`
        : 'GPU acceleration ready';
    } else if (status.message) {
      this.gpuStatusLabel.textContent = status.message;
    } else {
      this.gpuStatusLabel.textContent = 'GPU acceleration unavailable';
    }
  }

  private async runGPUTest(): Promise<void> {
    this.gpuTestButton.disabled = true;
    this.gpuStatusLabel.textContent = 'Testing GPU…';
    try {
      const status = await testGPU();
      this.store.update((draft) => {
        draft.settings.gpu = status;
      });
      this.renderGPUStatus(status);
    } catch (error) {
      console.error('GPU test failed', error);
      this.gpuStatusLabel.textContent = 'GPU test failed';
    } finally {
      this.gpuTestButton.disabled = false;
    }
  }
}
