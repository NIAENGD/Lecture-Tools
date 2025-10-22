// @ts-nocheck
import '../styles/main.scss';
import { createI18n } from './i18n';

declare global {
  interface Window {
    __LECTURE_TOOLS_SERVER_ROOT_PATH__?: string | null;
    __LECTURE_TOOLS_BASE_PATH__?: string;
    __LECTURE_TOOLS_PDFJS_SCRIPT_URL__?: string;
    __LECTURE_TOOLS_PDFJS_WORKER_URL__?: string;
    __LECTURE_TOOLS_PDFJS_MODULE_URL__?: string;
    __LECTURE_TOOLS_PDFJS_WORKER_MODULE_URL__?: string;
  }
}

function bootstrapEnvironmentFromDataset(): void {
  const body = document.body;
  if (!body) {
    return;
  }
  const { dataset } = body;
  window.__LECTURE_TOOLS_SERVER_ROOT_PATH__ = dataset.rootPath ?? '';
  window.__LECTURE_TOOLS_PDFJS_SCRIPT_URL__ = dataset.pdfjsScript ?? '';
  window.__LECTURE_TOOLS_PDFJS_WORKER_URL__ = dataset.pdfjsWorker ?? '';
  window.__LECTURE_TOOLS_PDFJS_MODULE_URL__ = dataset.pdfjsModule ?? '';
  window.__LECTURE_TOOLS_PDFJS_WORKER_MODULE_URL__ = dataset.pdfjsWorkerModule ?? '';
}

bootstrapEnvironmentFromDataset();

(async function () {
        const DEFAULT_LANGUAGE = 'en';

        function normalizeServerPath(value) {
          if (typeof value !== 'string') {
            return null;
          }
          const sentinel = '__LECTURE_TOOLS_ROOT_PATH__';
          if (value === sentinel) {
            return null;
          }
          let normalized = value.trim();
          if (!normalized || normalized === '/') {
            return '';
          }
          if (!normalized.startsWith('/')) {
            normalized = `/${normalized}`;
          }
          return normalized.replace(/\/+$/, '') || '';
        }

        const BASE_PATH = (() => {
          const serverPath = normalizeServerPath(
            window.__LECTURE_TOOLS_SERVER_ROOT_PATH__,
          );
          if (serverPath !== null) {
            return serverPath;
          }
          const { pathname } = window.location;
          if (!pathname || pathname === '/' || pathname === '/index.html') {
            return '';
          }
          const withoutIndex = pathname.replace(/\/index\.html?$/, '');
          const trimmed = withoutIndex.endsWith('/')
            ? withoutIndex.slice(0, -1)
            : withoutIndex;
          return trimmed === '/' ? '' : trimmed;
        })();

        window.__LECTURE_TOOLS_BASE_PATH__ = BASE_PATH;

        function resolveAppUrl(target) {
          if (!target || typeof target !== 'string') {
            return target;
          }
          if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target) || target.startsWith('//')) {
            return target;
          }
          if (target.startsWith('#') || target.startsWith('?')) {
            return target;
          }
          const normalized = target.startsWith('/') ? target : `/${target}`;
          if (!BASE_PATH) {
            return normalized;
          }
          if (normalized === '/') {
            return BASE_PATH || '/';
          }
          return `${BASE_PATH}${normalized}`;
        }

        const i18n = createI18n({
          defaultLanguage: DEFAULT_LANGUAGE,
          initialLanguage: DEFAULT_LANGUAGE,
          resolveUrl: resolveAppUrl,
        });

        let currentLanguage = await i18n.init();

        function t(key, params = undefined) {
          if (!key) {
            return '';
          }
          return i18n.translate(key, params);
        }

        function pluralize(language, key, count) {
          return i18n.pluralize(key, Number(count), language);
        }

        let activeSlideRangeDialog = null;

        async function applyTranslations(language) {
          const { language: applied } = await i18n.setLanguage(language ?? currentLanguage);
          currentLanguage = applied;
          document.documentElement.lang = applied;

          document.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.getAttribute('data-i18n');
            if (!key) {
              return;
            }
            const translation = i18n.format(key, undefined, applied);
            if (typeof translation !== 'string') {
              return;
            }
            const attr = element.getAttribute('data-i18n-attr');
            if (attr) {
              attr.split(',').forEach((attributeName) => {
                const name = attributeName.trim();
                if (name) {
                  element.setAttribute(name, translation);
                }
              });
            } else {
              element.textContent = translation;
            }
          });

          const titleTranslation = i18n.format('document.title', undefined, applied);
          if (titleTranslation) {
            document.title = titleTranslation;
          }

          if (activeSlideRangeDialog) {
            activeSlideRangeDialog.updateTexts();
            activeSlideRangeDialog.updateRangeSummary();
          }

          renderProgressQueue();
          renderSystemUpdate();
          if (state.selectedLectureDetail) {
            renderAssets(state.selectedLectureDetail.lecture);
          }
        }

        function createStorageStore() {
          const browser = {
            path: '',
            parent: null,
            entries: [],
            loading: false,
            initialized: false,
            deleting: new Set(),
            selected: new Set(),
            error: null,
          };
          const listeners = new Set();
          let active = false;

          function bind(target, type, handler, options) {
            if (!target || typeof target.addEventListener !== 'function') {
              return;
            }
            target.addEventListener(type, handler, options);
            listeners.add(() => {
              target.removeEventListener(type, handler, options);
            });
          }

          function detachListeners() {
            listeners.forEach((remove) => {
              try {
                remove();
              } catch (error) {
                console.warn('Failed to detach storage listener', error);
              }
            });
            listeners.clear();
          }

          function ensureSets() {
            if (!(browser.deleting instanceof Set)) {
              browser.deleting = new Set(
                Array.isArray(browser.deleting) ? browser.deleting : [],
              );
            }
            if (!(browser.selected instanceof Set)) {
              browser.selected = new Set(
                Array.isArray(browser.selected) ? browser.selected : [],
              );
            }
          }

          function clearTransient() {
            ensureSets();
            browser.deleting.clear();
            browser.selected.clear();
          }

          const store = {
            usage: null,
            loading: false,
            overview: null,
            purging: false,
            initialized: false,
            active: false,
            browser,
            activate() {
              if (active) {
                return;
              }
              active = true;
              this.active = true;
              detachListeners();
              if (!dom.storage) {
                return;
              }
              bind(dom.storage.refresh, 'click', handleRefreshClick);
              const browserDom = dom.storage.browser || {};
              bind(browserDom.navRoot, 'click', handleNavRootClick);
              bind(browserDom.navUp, 'click', handleNavUpClick);
              bind(browserDom.tableBody, 'click', handleBrowserClick);
              bind(browserDom.tableBody, 'change', handleBrowserChange);
              bind(browserDom.selectAll, 'change', handleSelectAllChange);
              bind(dom.storage.downloadSelected, 'click', handleDownloadClick);
              bind(dom.storage.purge, 'click', handlePurgeClick);
            },
            deactivate() {
              if (!active) {
                return;
              }
              active = false;
              this.active = false;
              detachListeners();
              clearTransient();
              this.initialized = false;
              this.loading = false;
              this.overview = null;
              this.usage = null;
              this.purging = false;
              browser.entries = [];
              browser.initialized = false;
              browser.loading = false;
              browser.error = null;
            },
            dispose() {
              this.deactivate();
              this.usage = null;
              this.overview = null;
              this.loading = false;
              this.purging = false;
              this.initialized = false;
              browser.path = '';
              browser.parent = null;
              browser.entries = [];
              browser.loading = false;
              browser.initialized = false;
              browser.error = null;
            },
            getBrowserState() {
              ensureSets();
              return browser;
            },
          };

          function handleRefreshClick(event) {
            event?.preventDefault?.();
            void refreshStorage({ includeOverview: true, force: true });
          }

          function handleNavRootClick(event) {
            event?.preventDefault?.();
            void refreshStorage({ includeOverview: false, path: '', force: true });
          }

          function handleNavUpClick(event) {
            event?.preventDefault?.();
            const current = store.getBrowserState();
            if (current.parent === null) {
              return;
            }
            const parentPath = current.parent || '';
            void refreshStorage({ includeOverview: false, path: parentPath, force: true });
          }

          function handleBrowserClick(event) {
            void handleStorageBrowserAction(event);
          }

          function handleBrowserChange(event) {
            handleStorageSelectionChange(event);
          }

          function handleSelectAllChange(event) {
            handleStorageSelectAll(event);
          }

          function handleDownloadClick(event) {
            event?.preventDefault?.();
            void handleStorageDownloadSelected();
          }

          function handlePurgeClick(event) {
            event?.preventDefault?.();
            void handlePurgeProcessedAudio();
          }

          return store;
        }

        function createProgressStore() {
          const listeners = new Set();

          function bind(target, type, handler, options) {
            if (!target || typeof target.addEventListener !== 'function') {
              return;
            }
            target.addEventListener(type, handler, options);
            listeners.add(() => {
              target.removeEventListener(type, handler, options);
            });
          }

          function detachListeners() {
            listeners.forEach((remove) => {
              try {
                remove();
              } catch (error) {
                console.warn('Failed to detach progress listener', error);
              }
            });
            listeners.clear();
          }

          const store = {
            entries: [],
            loading: false,
            timer: null,
            polling: false,
            active: false,
            activate() {
              if (this.active) {
                return;
              }
              this.active = true;
              detachListeners();
              if (dom.progress) {
                bind(dom.progress.refresh, 'click', handleRefreshClick);
                bind(dom.progress.list, 'click', handleListClick);
              }
            },
            deactivate() {
              if (!this.active) {
                return;
              }
              this.active = false;
              detachListeners();
              stopProgressPolling();
              this.loading = false;
              this.entries = [];
              renderProgressQueue();
            },
            dispose() {
              this.deactivate();
            },
          };

          function handleRefreshClick(event) {
            event?.preventDefault?.();
            void refreshProgressQueue({ force: true });
          }

          function handleListClick(event) {
            void handleProgressAction(event);
          }

          return store;
        }

        function createDebugStore() {
          const listeners = new Set();
          let active = false;
          let queryTimer = null;

          function bind(target, type, handler, options) {
            if (!target || typeof target.addEventListener !== 'function') {
              return;
            }
            target.addEventListener(type, handler, options);
            listeners.add(() => {
              target.removeEventListener(type, handler, options);
            });
          }

          function detachListeners() {
            listeners.forEach((remove) => {
              try {
                remove();
              } catch (error) {
                console.warn('Failed to detach debug listener', error);
              }
            });
            listeners.clear();
            if (queryTimer !== null) {
              window.clearTimeout(queryTimer);
              queryTimer = null;
            }
          }

          const store = {
            enabled: false,
            timer: null,
            streamSource: null,
            streamRetryTimer: null,
            ackTimer: null,
            lastId: 0,
            pending: false,
            autoScroll: true,
            serverEntries: [],
            tasks: [],
            entries: [],
            pendingAck: 0,
            retentionMs: DEBUG_RETENTION_MS,
            connecting: false,
            filters: {
              severity: 'all',
              category: 'all',
              correlationId: '',
              taskId: '',
              query: '',
            },
            active: false,
            activate() {
              if (active) {
                return;
              }
              active = true;
              this.active = true;
              attachListeners();
            },
            deactivate() {
              if (!active) {
                return;
              }
              active = false;
              this.active = false;
              detachListeners();
              stopDebugPolling();
              this.enabled = false;
              this.timer = null;
              this.streamSource = null;
              this.streamRetryTimer = null;
              this.ackTimer = null;
              this.lastId = 0;
              this.pending = false;
              this.autoScroll = true;
              this.serverEntries = [];
              this.tasks = [];
              this.entries = [];
              this.pendingAck = 0;
              this.connecting = false;
            },
            dispose() {
              this.deactivate();
            },
          };

          function attachListeners() {
            detachListeners();
            if (dom.debugLog) {
              bind(dom.debugLog, 'scroll', handleLogScroll);
            }
            if (dom.debugFilterSeverity) {
              bind(dom.debugFilterSeverity, 'change', handleSeverityChange);
            }
            if (dom.debugFilterCategory) {
              bind(dom.debugFilterCategory, 'change', handleCategoryChange);
            }
            if (dom.debugFilterCorrelation) {
              bind(dom.debugFilterCorrelation, 'input', handleCorrelationChange);
            }
            if (dom.debugFilterTask) {
              bind(dom.debugFilterTask, 'input', handleTaskChange);
            }
            if (dom.debugFilterQuery) {
              bind(dom.debugFilterQuery, 'input', handleQueryChange);
            }
            if (dom.debugFilterClear) {
              bind(dom.debugFilterClear, 'click', handleFilterClear);
            }
            if (dom.debugExport) {
              bind(dom.debugExport, 'click', handleExportClick);
            }
          }

          function handleLogScroll() {
            if (!dom.debugLog) {
              return;
            }
            const element = dom.debugLog;
            const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
            store.autoScroll = remaining <= 40;
          }

          function handleSeverityChange(event) {
            const value = event?.target?.value || 'all';
            setDebugFilter('severity', value);
          }

          function handleCategoryChange(event) {
            const value = event?.target?.value || 'all';
            setDebugFilter('category', value);
          }

          function handleCorrelationChange(event) {
            const value = event?.target?.value || '';
            setDebugFilter('correlationId', value);
          }

          function handleTaskChange(event) {
            const value = event?.target?.value || '';
            setDebugFilter('taskId', value);
          }

          function handleQueryChange(event) {
            const value = event?.target?.value || '';
            if (queryTimer !== null) {
              window.clearTimeout(queryTimer);
            }
            queryTimer = window.setTimeout(() => {
              setDebugFilter('query', value);
            }, 120);
          }

          function handleFilterClear(event) {
            event?.preventDefault?.();
            store.filters = {
              severity: 'all',
              category: 'all',
              correlationId: '',
              taskId: '',
              query: '',
            };
            if (dom.debugFilterSeverity) {
              dom.debugFilterSeverity.value = 'all';
            }
            if (dom.debugFilterCategory) {
              dom.debugFilterCategory.value = 'all';
            }
            if (dom.debugFilterCorrelation) {
              dom.debugFilterCorrelation.value = '';
            }
            if (dom.debugFilterTask) {
              dom.debugFilterTask.value = '';
            }
            if (dom.debugFilterQuery) {
              dom.debugFilterQuery.value = '';
            }
            renderDebugLogs();
          }

          return store;
        }

        const storageStore = createStorageStore();
        const progressStore = createProgressStore();
        const debugStore = createDebugStore();

        const WHISPER_MODEL_CHOICES = new Set([
          'tiny',
          'base',
          'small',
          'medium',
          'large',
          'gpu',
        ]);
        const GPU_MODEL = 'gpu';
        const DEFAULT_WHISPER_MODEL = 'base';
        const SLIDE_DPI_CHOICES = new Set(['150', '200', '300', '400', '600']);
        const DEFAULT_SLIDE_DPI = '200';
        const LANGUAGE_CHOICES = new Set(['en', 'zh', 'es', 'fr']);
        const LEGACY_DEBUG_POLL_INTERVAL_MS = 2000;
        const DEBUG_STREAM_RETRY_DELAY_MS = 3000;
        const DEBUG_RETENTION_MS = 5 * 60 * 1000;
        const DEBUG_ACK_DEBOUNCE_MS = 500;
        const SERVER_LOG_CATEGORY = 'server';
        const UPDATE_POLL_INTERVAL_MS = 3000;

        function normalizeWhisperModel(value) {
          const candidate =
            typeof value === 'string' ? value.trim() : String(value ?? '');
          return WHISPER_MODEL_CHOICES.has(candidate)
            ? candidate
            : DEFAULT_WHISPER_MODEL;
        }

        function normalizeSlideDpi(value) {
          let candidate;
          if (typeof value === 'number' && Number.isFinite(value)) {
            candidate = String(Math.trunc(value));
          } else if (typeof value === 'string') {
            candidate = value.trim();
          } else {
            candidate = String(value ?? '');
          }
          return SLIDE_DPI_CHOICES.has(candidate) ? candidate : DEFAULT_SLIDE_DPI;
        }

        function normalizeLanguage(value) {
          if (typeof value === 'string') {
            const trimmed = value.trim().toLowerCase();
            return LANGUAGE_CHOICES.has(trimmed) ? trimmed : DEFAULT_LANGUAGE;
          }
          return DEFAULT_LANGUAGE;
        }

        const CURRICULUM_PAGE_SIZE = 20;
        const MODULE_PAGE_SIZE = 8;
        const LECTURE_PAGE_SIZE = 25;

        const state = {
          classes: [],
          stats: {},
          query: '',
          selectedLectureId: null,
          selectedLectureDetail: null,
          buttonMap: new Map(),
          expandedClasses: new Map(),
          expandedModules: new Map(),
          editMode: false,
          activeView: 'details',
          settings: null,
          draggingLectureId: null,
          draggingSourceModuleId: null,
          draggedElement: null,
          curriculumWindow: {
            offset: 0,
            limit: CURRICULUM_PAGE_SIZE,
            total: 0,
            nextOffset: null,
            hasMore: false,
            loading: false,
          },
          moduleWindows: new Map(),
          lectureWindows: new Map(),
          moduleIndex: new Map(),
          curriculumRenderMetrics: [],
          curriculumVirtualizer: null,
          gpuWhisper: {
            supported: false,
            checked: false,
            message: t('settings.whisper.gpu.status'),
            output: '',
            lastChecked: null,
            unavailable: false,
          },
          transcriptionProgressTimer: null,
          transcriptionProgressLectureId: null,
          processingProgressTimer: null,
          processingProgressLectureId: null,
          lastProgressMessage: '',
          lastProgressRatio: null,
          statusHideTimer: null,
          storage: storageStore,
          progress: progressStore,
          systemUpdate: {
            running: false,
            startedAt: null,
            finishedAt: null,
            success: null,
            exitCode: null,
            error: null,
            log: [],
            pollTimer: null,
          },
          transcribeControls: {
            button: null,
            model: null,
            gpuOption: null,
          },
          debug: debugStore,
        };

        function getTranscribeButton() {
          return state.transcribeControls.button;
        }

        function getTranscribeModelSelect() {
          return state.transcribeControls.model;
        }

        function setTranscribeControls(button, model, gpuOption) {
          const current = state.transcribeControls;
          if (current.button && current.button !== button) {
            current.button.removeEventListener('click', handleTranscribeClick);
          }

          if (dom.gpuModelOptions) {
            const existingOption = current.gpuOption;
            if (existingOption && existingOption !== gpuOption) {
              if (dom.gpuModelOptions instanceof Set) {
                dom.gpuModelOptions.delete(existingOption);
              } else if (Array.isArray(dom.gpuModelOptions)) {
                dom.gpuModelOptions = dom.gpuModelOptions.filter(
                  (option) => option !== existingOption,
                );
              }
            }
          }

          state.transcribeControls = {
            button: button || null,
            model: model || null,
            gpuOption: gpuOption || null,
          };

          if (button && current.button !== button) {
            button.addEventListener('click', handleTranscribeClick);
          }

          if (dom.gpuModelOptions && gpuOption) {
            if (dom.gpuModelOptions instanceof Set) {
              dom.gpuModelOptions.add(gpuOption);
            } else if (Array.isArray(dom.gpuModelOptions)) {
              dom.gpuModelOptions.push(gpuOption);
            }
          }

          updateGpuWhisperUI({ ...state.gpuWhisper });
        }

        function setTranscribeButtonDisabled(disabled) {
          const button = getTranscribeButton();
          if (button) {
            button.disabled = Boolean(disabled);
          }
        }

        function setTranscribeModelValue(value) {
          const select = getTranscribeModelSelect();
          if (!select) {
            return;
          }
          select.value = normalizeWhisperModel(value);
        }

        function getTranscribeModelValue() {
          const select = getTranscribeModelSelect();
          if (select && select.value) {
            return normalizeWhisperModel(select.value);
          }
          return state.settings?.whisper_model || DEFAULT_WHISPER_MODEL;
        }

        const dom = {
          status: document.getElementById('status-bar'),
          statusMessage: document.getElementById('status-bar-message'),
          statusProgress: document.getElementById('status-bar-progress'),
          statusProgressFill: document.getElementById('status-bar-progress-fill'),
          statusProgressText: document.getElementById('status-bar-progress-text'),
          stats: document.getElementById('stats'),
          curriculum: document.getElementById('curriculum'),
          search: document.getElementById('search-input'),
          summary: document.getElementById('lecture-summary'),
          editForm: document.getElementById('lecture-edit-form'),
          editName: document.getElementById('edit-lecture-name'),
          editModule: document.getElementById('edit-lecture-module'),
          editDescription: document.getElementById('edit-lecture-description'),
          deleteButton: document.getElementById('delete-lecture'),
          editToggle: document.getElementById('toggle-edit-mode'),
          editBanner: document.getElementById('edit-mode-banner'),
          assetSection: document.getElementById('asset-section'),
          assetList: document.getElementById('asset-list'),
          createForm: document.getElementById('lecture-create-form'),
          createModule: document.getElementById('create-module'),
          createName: document.getElementById('create-name'),
          createDescription: document.getElementById('create-description'),
          createSubmit: document.getElementById('create-submit'),
          viewButtons: Array.from(document.querySelectorAll('.top-bar [data-view]')),
          views: {
            details: document.getElementById('view-details'),
            progress: document.getElementById('view-progress'),
            create: document.getElementById('view-create'),
            storage: document.getElementById('view-storage'),
            settings: document.getElementById('view-settings'),
          },
          sidebarOverview: document.getElementById('sidebar-overview'),
          settingsForm: document.getElementById('settings-form'),
          settingsTheme: document.getElementById('settings-theme'),
          settingsLanguage: document.getElementById('settings-language'),
          settingsWhisperModel: document.getElementById('settings-whisper-model'),
          settingsWhisperCompute: document.getElementById('settings-whisper-compute'),
          settingsWhisperBeam: document.getElementById('settings-whisper-beam'),
          settingsWhisperGpuStatus: document.getElementById('settings-whisper-gpu-status'),
          settingsWhisperGpuTest: document.getElementById('settings-whisper-gpu-test'),
          settingsSlideDpi: document.getElementById('settings-slide-dpi'),
          settingsAudioMastering: document.getElementById('settings-audio-mastering'),
          settingsDebugEnabled: document.getElementById('settings-debug-enabled'),
          settingsExitApp: document.getElementById('settings-exit-app'),
          settingsExport: document.getElementById('settings-export'),
          settingsImport: document.getElementById('settings-import'),
          settingsImportMode: document.getElementById('settings-import-mode'),
          settingsUpdateRun: document.getElementById('settings-update-run'),
          settingsUpdateRefresh: document.getElementById('settings-update-refresh'),
          settingsUpdateStatus: document.getElementById('settings-update-status'),
          settingsUpdateMeta: document.getElementById('settings-update-meta'),
          settingsUpdateLogWrapper: document.getElementById('settings-update-log-wrapper'),
          settingsUpdateLog: document.getElementById('settings-update-log'),
          settingsUpdateLogEmpty: document.getElementById('settings-update-log-empty'),
          gpuModelOptions: new Set(Array.from(document.querySelectorAll('option.gpu-only'))),
          debugPane: document.getElementById('debug-pane'),
          debugExport: document.getElementById('debug-export'),
          debugLog: document.getElementById('debug-log-window'),
          debugEmpty: document.getElementById('debug-log-empty'),
          debugStatus: document.getElementById('debug-log-status'),
          debugHeartbeat: document.getElementById('debug-heartbeat'),
          debugHeartbeatTrack: document.querySelector('#debug-heartbeat .debug-heartbeat-track'),
          debugStream: document.getElementById('debug-stream-window'),
          debugStreamEntries: document.getElementById('debug-stream-entries'),
          debugStreamEmpty: document.getElementById('debug-stream-empty'),
          debugFilterSeverity: document.getElementById('debug-filter-severity'),
          debugFilterCategory: document.getElementById('debug-filter-category'),
          debugFilterCorrelation: document.getElementById('debug-filter-correlation'),
          debugFilterTask: document.getElementById('debug-filter-task'),
          debugFilterQuery: document.getElementById('debug-filter-query'),
          debugFilterClear: document.getElementById('debug-filter-clear'),
          storage: {
            container: document.getElementById('view-storage'),
            path: document.getElementById('storage-path'),
            refresh: document.getElementById('storage-refresh'),
            downloadSelected: document.getElementById('storage-download-selected'),
            used: document.getElementById('storage-used'),
            available: document.getElementById('storage-available'),
            total: document.getElementById('storage-total'),
            loading: document.getElementById('storage-loading'),
            empty: document.getElementById('storage-empty'),
            wrapper: document.getElementById('storage-class-wrapper'),
            list: document.getElementById('storage-class-list'),
            purge: document.getElementById('storage-purge'),
            purgeSummary: document.getElementById('storage-purge-summary'),
            browser: {
              navRoot: document.getElementById('storage-nav-root'),
              navUp: document.getElementById('storage-nav-up'),
              loading: document.getElementById('storage-browser-loading'),
              empty: document.getElementById('storage-browser-empty'),
              tableWrapper: document.getElementById('storage-browser-table-wrapper'),
              tableBody: document.getElementById('storage-browser-body'),
              selectAll: document.getElementById('storage-select-all'),
            },
          },
          progress: {
            container: document.getElementById('view-progress'),
            list: document.getElementById('progress-list'),
            empty: document.getElementById('progress-empty'),
            refresh: document.getElementById('progress-refresh'),
            description: document.getElementById('progress-description'),
          },
          dialog: {
            root: document.getElementById('dialog-root'),
            backdrop: document.getElementById('dialog-backdrop'),
            window: document.getElementById('dialog-window'),
            title: document.getElementById('dialog-title'),
            message: document.getElementById('dialog-message'),
            inputWrapper: document.getElementById('dialog-input-wrapper'),
            input: document.getElementById('dialog-input'),
            confirm: document.getElementById('dialog-confirm'),
            cancel: document.getElementById('dialog-cancel'),
          },
          pendingDialog: {
            root: document.getElementById('dialog-pending'),
            message: document.getElementById('dialog-pending-message'),
          },
          slideRangeDialog: {
            root: document.getElementById('slide-range-dialog'),
            backdrop: document.getElementById('slide-range-backdrop'),
            window: document.getElementById('slide-range-window'),
            title: document.getElementById('slide-range-title'),
            description: document.getElementById('slide-range-description'),
            preview: document.getElementById('slide-range-preview'),
            loading: document.getElementById('slide-range-loading'),
            error: document.getElementById('slide-range-error'),
            fallback: document.getElementById('slide-range-fallback'),
            fallbackFrame: document.getElementById('slide-range-fallback-frame'),
            fallbackLink: document.getElementById('slide-range-fallback-link'),
            fallbackMessage: document.getElementById('slide-range-fallback-message'),
            pages: document.getElementById('slide-range-pages'),
            startLabel: document.getElementById('slide-range-start-label'),
            endLabel: document.getElementById('slide-range-end-label'),
            startInput: document.getElementById('slide-range-start'),
            endInput: document.getElementById('slide-range-end'),
            selectAll: document.getElementById('slide-range-select-all'),
            zoomLabel: document.getElementById('slide-range-zoom-label'),
            zoomValue: document.getElementById('slide-range-zoom-value'),
            zoomSlider: document.getElementById('slide-range-zoom'),
            hint: document.getElementById('slide-range-hint'),
            summary: document.getElementById('slide-range-summary'),
            confirm: document.getElementById('slide-range-confirm'),
            cancel: document.getElementById('slide-range-cancel'),
          },
          uploadDialog: {
            root: document.getElementById('upload-dialog'),
            backdrop: document.getElementById('upload-dialog-backdrop'),
            window: document.getElementById('upload-dialog-window'),
            title: document.getElementById('upload-dialog-title'),
            description: document.getElementById('upload-dialog-description'),
            dropzone: document.getElementById('upload-dropzone'),
            input: document.getElementById('upload-dialog-input'),
            prompt: document.getElementById('upload-dropzone-prompt'),
            help: document.getElementById('upload-dropzone-help'),
            browse: document.getElementById('upload-browse-button'),
            fileInfo: document.getElementById('upload-file-info'),
            fileName: document.getElementById('upload-file-name'),
            fileSize: document.getElementById('upload-file-size'),
            clear: document.getElementById('upload-clear'),
            progressContainer: document.getElementById('upload-progress-container'),
            progress: document.getElementById('upload-progress'),
            progressFill: document.getElementById('upload-progress-fill'),
            progressText: document.getElementById('upload-progress-text'),
            status: document.getElementById('upload-status-message'),
            cancel: document.getElementById('upload-cancel'),
            confirm: document.getElementById('upload-confirm'),
          },
        };

        const DEFAULT_DEBUG_EMPTY_TEXT = dom.debugEmpty
          ? dom.debugEmpty.textContent || ''
          : '';
        const FILTERED_DEBUG_EMPTY_TEXT = 'No log entries match the current filters.';

        function renderStorageUsage() {
          if (!dom.storage) {
            return;
          }
          const usage = state.storage.usage;
          if (dom.storage.used) {
            dom.storage.used.textContent =
              usage && typeof usage.used === 'number' ? formatBytes(usage.used) : '—';
          }
          if (dom.storage.available) {
            dom.storage.available.textContent =
              usage && typeof usage.free === 'number' ? formatBytes(usage.free) : '—';
          }
          if (dom.storage.total) {
            dom.storage.total.textContent =
              usage && typeof usage.total === 'number' ? formatBytes(usage.total) : '—';
          }
        }

        function renderStoragePurgeSummary() {
          if (!dom.storage || !dom.storage.purgeSummary) {
            return;
          }
          if (state.storage.loading) {
            dom.storage.purgeSummary.textContent = t('storage.loading');
            return;
          }
          const overview = state.storage.overview;
          const eligible = Number(overview?.eligible_audio_total) || 0;
          if (eligible > 0) {
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', eligible);
            dom.storage.purgeSummary.textContent = t('storage.purge.available', {
              count: eligible,
              lectureWord,
            });
          } else {
            dom.storage.purgeSummary.textContent = t('storage.purge.none');
          }
        }

        function renderStoragePurgeControls() {
          if (!dom.storage || !dom.storage.purge) {
            return;
          }
          const overview = state.storage.overview;
          const eligible = Number(overview?.eligible_audio_total) || 0;
          dom.storage.purge.disabled =
            state.storage.loading || state.storage.purging || eligible === 0;
          if (state.storage.purging) {
            dom.storage.purge.textContent = t('storage.purge.working');
          } else {
            dom.storage.purge.textContent = t('storage.actions.purge');
          }
        }

        function renderStorageClasses() {
          if (!dom.storage || !dom.storage.list) {
            return;
          }
          const container = dom.storage.list;
          container.innerHTML = '';
          if (state.storage.loading) {
            return;
          }
          const overview = state.storage.overview;
          const classes = Array.isArray(overview?.classes) ? overview.classes : [];
          classes.forEach((klass) => {
            if (!klass || typeof klass !== 'object') {
              return;
            }
            const classItem = document.createElement('li');
            classItem.className = 'storage-class-card';

            const header = document.createElement('div');
            header.className = 'storage-class-header';

            const title = document.createElement('h3');
            title.className = 'storage-class-title';
            title.textContent = klass.name || t('storage.unnamedClass');
            header.appendChild(title);

            const classSize = document.createElement('span');
            classSize.className = 'storage-class-size';
            classSize.textContent =
              typeof klass.size === 'number' && klass.size >= 0 ? formatBytes(klass.size) : '—';
            header.appendChild(classSize);

            classItem.appendChild(header);

            const moduleCount = Number(klass.module_count) || 0;
            const lectureCount = Number(klass.lecture_count) || 0;
            const moduleWord = pluralize(currentLanguage, 'counts.module', moduleCount);
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
            const classSummaryParts = [
              t('storage.classes.summary', {
                moduleCount,
                moduleWord,
                lectureCount,
                lectureWord,
              }),
            ];
            const classEligible = Number(klass.eligible_audio_count) || 0;
            if (classEligible > 0) {
              classSummaryParts.push(
                t('storage.purge.readyCount', {
                  count: classEligible,
                  lectureWord: pluralize(currentLanguage, 'counts.lecture', classEligible),
                }),
              );
            }
            const classMastered = Number(klass.processed_audio_count) || 0;
            if (classMastered > 0) {
              classSummaryParts.push(
                t('storage.classes.masteredCount', {
                  count: classMastered,
                  lectureWord: pluralize(currentLanguage, 'counts.lecture', classMastered),
                }),
              );
            }
            const classMeta = document.createElement('p');
            classMeta.className = 'storage-class-meta';
            classMeta.textContent = classSummaryParts.filter(Boolean).join(' • ');
            classItem.appendChild(classMeta);

            const modules = Array.isArray(klass.modules) ? klass.modules : [];
            if (!modules.length) {
              const empty = document.createElement('p');
              empty.className = 'storage-class-meta';
              empty.textContent = t('storage.classes.empty');
              classItem.appendChild(empty);
            } else {
              const moduleList = document.createElement('ul');
              moduleList.className = 'storage-module-list';
              modules.forEach((module) => {
                if (!module || typeof module !== 'object') {
                  return;
                }
                const moduleItem = document.createElement('li');
                moduleItem.className = 'storage-module-card';

                const moduleHeader = document.createElement('div');
                moduleHeader.className = 'storage-module-header';

                const moduleTitle = document.createElement('h4');
                moduleTitle.className = 'storage-module-title';
                moduleTitle.textContent = module.name || t('storage.unnamedModule');
                moduleHeader.appendChild(moduleTitle);

                const moduleSize = document.createElement('span');
                moduleSize.className = 'storage-module-size';
                moduleSize.textContent =
                  typeof module.size === 'number' && module.size >= 0
                    ? formatBytes(module.size)
                    : '—';
                moduleHeader.appendChild(moduleSize);

                moduleItem.appendChild(moduleHeader);

                const moduleLectureCount = Number(module.lecture_count) || 0;
                const moduleLectureWord = pluralize(
                  currentLanguage,
                  'counts.lecture',
                  moduleLectureCount,
                );
                const moduleSummaryParts = [
                  t('storage.modules.summary', {
                    lectureCount: moduleLectureCount,
                    lectureWord: moduleLectureWord,
                  }),
                ];
                const moduleEligible = Number(module.eligible_audio_count) || 0;
                if (moduleEligible > 0) {
                  moduleSummaryParts.push(
                    t('storage.purge.readyCount', {
                      count: moduleEligible,
                      lectureWord: pluralize(currentLanguage, 'counts.lecture', moduleEligible),
                    }),
                  );
                }
                const moduleMastered = Number(module.processed_audio_count) || 0;
                if (moduleMastered > 0) {
                  moduleSummaryParts.push(
                    t('storage.modules.masteredCount', {
                      count: moduleMastered,
                      lectureWord: pluralize(currentLanguage, 'counts.lecture', moduleMastered),
                    }),
                  );
                }
                const moduleMeta = document.createElement('p');
                moduleMeta.className = 'storage-module-meta';
                moduleMeta.textContent = moduleSummaryParts.filter(Boolean).join(' • ');
                moduleItem.appendChild(moduleMeta);

                const lectures = Array.isArray(module.lectures) ? module.lectures : [];
                if (!lectures.length) {
                  const emptyLecture = document.createElement('p');
                  emptyLecture.className = 'storage-module-meta';
                  emptyLecture.textContent = t('storage.modules.empty');
                  moduleItem.appendChild(emptyLecture);
                } else {
                  const lectureList = document.createElement('ul');
                  lectureList.className = 'storage-lecture-list';
                  lectures.forEach((lecture) => {
                    if (!lecture || typeof lecture !== 'object') {
                      return;
                    }
                    const lectureItem = document.createElement('li');
                    lectureItem.className = 'storage-lecture-item';

                    const lectureHeader = document.createElement('div');
                    lectureHeader.className = 'storage-lecture-header';

                    const lectureTitle = document.createElement('p');
                    lectureTitle.className = 'storage-lecture-title';
                    lectureTitle.textContent = lecture.name || t('storage.unnamedLecture');
                    lectureHeader.appendChild(lectureTitle);

                    const lectureSize = document.createElement('span');
                    lectureSize.className = 'storage-lecture-size';
                    lectureSize.textContent =
                      typeof lecture.size === 'number' && lecture.size >= 0
                        ? formatBytes(lecture.size)
                        : '—';
                    lectureHeader.appendChild(lectureSize);

                    lectureItem.appendChild(lectureHeader);

                    const lectureMeta = document.createElement('p');
                    lectureMeta.className = 'storage-lecture-meta';
                    const assetLabels = [];
                    if (lecture.has_audio) {
                      assetLabels.push(t('storage.lecture.audio'));
                    }
                    if (lecture.has_processed_audio) {
                      assetLabels.push(t('storage.lecture.processedAudio'));
                    }
                    if (lecture.has_transcript) {
                      assetLabels.push(t('storage.lecture.transcript'));
                    }
                    if (lecture.has_notes) {
                      assetLabels.push(t('storage.lecture.notes'));
                    }
                    if (lecture.has_slides) {
                      assetLabels.push(t('storage.lecture.slides'));
                    }
                    lectureMeta.textContent = assetLabels.length
                      ? assetLabels.join(' • ')
                      : t('storage.lecture.empty');
                    lectureItem.appendChild(lectureMeta);

                    const badgeContainer = document.createElement('div');
                    badgeContainer.className = 'storage-lecture-badges';

                    if (lecture.has_processed_audio) {
                      const processedBadge = document.createElement('span');
                      processedBadge.className = 'storage-lecture-processed';
                      processedBadge.textContent = t('storage.lecture.processedBadge');
                      badgeContainer.appendChild(processedBadge);
                    }

                    if (lecture.eligible_audio) {
                      const eligibleBadge = document.createElement('span');
                      eligibleBadge.className = 'storage-lecture-eligible';
                      eligibleBadge.textContent = t('storage.lecture.eligible');
                      badgeContainer.appendChild(eligibleBadge);
                    }

                    if (badgeContainer.childElementCount > 0) {
                      lectureItem.appendChild(badgeContainer);
                    }

                    lectureList.appendChild(lectureItem);
                  });
                  moduleItem.appendChild(lectureList);
                }

                moduleList.appendChild(moduleItem);
              });
              classItem.appendChild(moduleList);
            }

            container.appendChild(classItem);
          });
        }

        function getStorageBrowserState() {
          return storageStore.getBrowserState();
        }

        function renderStorageBrowser() {
          if (!dom.storage || !dom.storage.browser) {
            return;
          }
          const browserState = getStorageBrowserState();
          const pathElement = dom.storage.path;
          if (pathElement) {
            const displayPath = browserState.path ? `/${browserState.path}` : '/';
            pathElement.textContent = displayPath;
            pathElement.setAttribute('title', displayPath);
          }

          const navRoot = dom.storage.browser.navRoot;
          if (navRoot) {
            navRoot.disabled = browserState.loading || !browserState.path;
          }
          const navUp = dom.storage.browser.navUp;
          if (navUp) {
            navUp.disabled = browserState.loading || browserState.parent === null;
          }

          const loadingElement = dom.storage.browser.loading;
          const emptyElement = dom.storage.browser.empty;
          const tableWrapper = dom.storage.browser.tableWrapper;
          const tableBody = dom.storage.browser.tableBody;
          const downloadButton = dom.storage.downloadSelected;
          const selectAllControl = dom.storage.browser.selectAll;

          const isLoading = Boolean(browserState.loading);
          const entries = Array.isArray(browserState.entries) ? browserState.entries : [];
          const hasEntries = entries.length > 0;

          if (loadingElement) {
            loadingElement.hidden = !isLoading;
          }

          if (emptyElement) {
            const defaultMessage = t('storage.browser.empty');
            const message = browserState.error ? browserState.error : defaultMessage;
            emptyElement.textContent = message;
            emptyElement.hidden = isLoading || hasEntries;
          }

          if (tableWrapper) {
            tableWrapper.hidden = isLoading || !hasEntries;
          }

          if (tableBody) {
            tableBody.innerHTML = '';
            let visibleSelectableCount = 0;
            let visibleSelectedCount = 0;
            if (!isLoading && hasEntries) {
              entries.forEach((entry) => {
                if (!entry || typeof entry !== 'object') {
                  return;
                }
                const row = document.createElement('tr');
                const entryPath = typeof entry.path === 'string' ? entry.path : '';
                const entryName = typeof entry.name === 'string' && entry.name
                  ? entry.name
                  : entryPath;
                const isDirectory = Boolean(entry.is_dir);
                const isDeleting = browserState.deleting.has(entryPath);
                const isSelected = browserState.selected.has(entryPath);
                if (isSelected) {
                  row.classList.add('is-selected');
                }
                row.dataset.storagePath = entryPath;
                row.dataset.storageType = isDirectory ? 'directory' : 'file';

                const selectCell = document.createElement('td');
                selectCell.className = 'storage-select-cell';
                if (entryPath) {
                  const checkbox = document.createElement('input');
                  checkbox.type = 'checkbox';
                  checkbox.className = 'storage-select-checkbox';
                  checkbox.dataset.storageSelect = entryPath;
                  checkbox.checked = isSelected;
                  checkbox.disabled = browserState.loading || isDeleting;
                  const labelName = entryName || t('storage.browser.unnamed');
                  checkbox.setAttribute(
                    'aria-label',
                    t('storage.browser.selectAction', { name: labelName }),
                  );
                  selectCell.appendChild(checkbox);
                  visibleSelectableCount += 1;
                  if (isSelected) {
                    visibleSelectedCount += 1;
                  }
                }
                row.appendChild(selectCell);

                const nameCell = document.createElement('td');
                if (isDirectory) {
                  const button = document.createElement('button');
                  button.type = 'button';
                  button.className = 'storage-entry-name';
                  button.dataset.storageAction = 'open';
                  button.dataset.storagePath = entryPath;
                  button.textContent = entryName || t('storage.browser.unnamed');
                  nameCell.appendChild(button);
                } else {
                  const link = document.createElement('a');
                  link.className = 'storage-entry-name';
                  link.href = buildStorageURL(entryPath);
                  link.textContent = entryName || t('storage.browser.unnamed');
                  link.target = '_blank';
                  link.rel = 'noopener noreferrer';
                  nameCell.appendChild(link);
                }
                row.appendChild(nameCell);

                const typeCell = document.createElement('td');
                typeCell.className = 'storage-entry-type';
                typeCell.textContent = isDirectory
                  ? t('storage.browser.directory')
                  : t('storage.browser.file');
                row.appendChild(typeCell);

                const sizeCell = document.createElement('td');
                const sizeValue = Number.isFinite(entry?.size)
                  ? Number(entry.size)
                  : Number(entry?.size);
                if (Number.isFinite(sizeValue) && sizeValue >= 0) {
                  sizeCell.textContent = formatBytes(sizeValue);
                } else {
                  sizeCell.textContent = '—';
                }
                row.appendChild(sizeCell);

                const modifiedCell = document.createElement('td');
                const modifiedText = entry?.modified ? formatDate(entry.modified) : '';
                modifiedCell.textContent = modifiedText || '—';
                row.appendChild(modifiedCell);

                const actionsCell = document.createElement('td');
                actionsCell.className = 'storage-entry-actions';
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.dataset.storageAction = 'delete';
                deleteButton.dataset.storagePath = entryPath;
                deleteButton.dataset.storageName = entryName || entryPath || '';
                deleteButton.textContent = t('common.actions.delete');
                deleteButton.disabled = !entryPath || browserState.loading || isDeleting;
                actionsCell.appendChild(deleteButton);
                row.appendChild(actionsCell);

                tableBody.appendChild(row);
              });
            }
            if (selectAllControl) {
              selectAllControl.disabled =
                browserState.loading || isLoading || visibleSelectableCount === 0;
              selectAllControl.indeterminate =
                visibleSelectedCount > 0 && visibleSelectedCount < visibleSelectableCount;
              selectAllControl.checked =
                visibleSelectableCount > 0 &&
                visibleSelectedCount === visibleSelectableCount &&
                !selectAllControl.indeterminate;
            }
            if (downloadButton) {
              downloadButton.disabled =
                browserState.loading || isLoading || browserState.selected.size === 0;
            }
          }
        }

        function renderStorage() {
          if (!dom.storage) {
            return;
          }
          const browserState = getStorageBrowserState();
          if (dom.storage.loading) {
            const showLoading = Boolean(
              state.storage.loading || (!browserState.initialized && browserState.loading),
            );
            dom.storage.loading.hidden = !showLoading;
          }
          const overview = state.storage.overview;
          const classes = Array.isArray(overview?.classes) ? overview.classes : [];
          if (dom.storage.empty) {
            dom.storage.empty.hidden = state.storage.loading || classes.length > 0;
          }
          if (dom.storage.wrapper) {
            dom.storage.wrapper.hidden = state.storage.loading || classes.length === 0;
          }
          renderStorageBrowser();
          renderStorageUsage();
          renderStoragePurgeSummary();
          renderStoragePurgeControls();
          renderStorageClasses();
        }

        function parseIsoDate(value) {
          if (typeof value !== 'string' || !value) {
            return null;
          }
          const date = new Date(value);
          if (Number.isNaN(date.getTime())) {
            return null;
          }
          return date;
        }

        function formatDateTime(date) {
          if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return '';
          }
          try {
            const languageTag = currentLanguage || DEFAULT_LANGUAGE;
            return new Intl.DateTimeFormat(languageTag, {
              dateStyle: 'medium',
              timeStyle: 'medium',
            }).format(date);
          } catch (error) {
            return date.toLocaleString();
          }
        }

        function startUpdatePolling() {
          if (state.systemUpdate.pollTimer) {
            return;
          }
          state.systemUpdate.pollTimer = window.setInterval(() => {
            void fetchSystemUpdateStatus();
          }, UPDATE_POLL_INTERVAL_MS);
        }

        function stopUpdatePolling() {
          if (state.systemUpdate.pollTimer) {
            window.clearInterval(state.systemUpdate.pollTimer);
            state.systemUpdate.pollTimer = null;
          }
        }

        function renderSystemUpdate() {
          if (!dom.settingsUpdateStatus) {
            return;
          }
          const update = state.systemUpdate;
          const statusKey = update.running
            ? 'running'
            : update.success === true
            ? 'success'
            : update.success === false
            ? 'failure'
            : 'idle';
          dom.settingsUpdateStatus.textContent = t(`settings.update.status.${statusKey}`);

          if (dom.settingsUpdateMeta) {
            const parts = [];
            if (update.startedAt) {
              parts.push(t('settings.update.startedAt', { time: formatDateTime(update.startedAt) }));
            }
            if (update.finishedAt && !update.running) {
              parts.push(t('settings.update.finishedAt', { time: formatDateTime(update.finishedAt) }));
            }
            if (typeof update.exitCode === 'number' && Number.isFinite(update.exitCode)) {
              parts.push(t('settings.update.exitCode', { code: update.exitCode }));
            }
            if (update.error && !update.running) {
              parts.push(update.error);
            }
            if (parts.length > 0) {
              dom.settingsUpdateMeta.textContent = parts.join(' ');
              dom.settingsUpdateMeta.hidden = false;
            } else {
              dom.settingsUpdateMeta.textContent = '';
              dom.settingsUpdateMeta.hidden = true;
            }
          }

          if (dom.settingsUpdateRun) {
            dom.settingsUpdateRun.disabled = update.running;
          }
          if (dom.settingsUpdateRefresh) {
            dom.settingsUpdateRefresh.disabled = update.running;
          }

          if (dom.settingsUpdateLogWrapper) {
            const entries = Array.isArray(update.log) ? update.log : [];
            const hasEntries = entries.length > 0;
            const shouldShowWrapper = update.running || hasEntries;
            dom.settingsUpdateLogWrapper.hidden = !shouldShowWrapper;
            if (dom.settingsUpdateLog) {
              if (hasEntries) {
                const formatted = entries
                  .map((entry) => {
                    const stamp = parseIsoDate(entry.timestamp);
                    const prefix = stamp ? `[${formatDateTime(stamp)}] ` : '';
                    const message = typeof entry.message === 'string' ? entry.message : '';
                    return `${prefix}${message}`.trimEnd();
                  })
                  .join('\n');
                dom.settingsUpdateLog.textContent = formatted;
                dom.settingsUpdateLog.hidden = false;
                dom.settingsUpdateLog.scrollTop = dom.settingsUpdateLog.scrollHeight;
              } else {
                dom.settingsUpdateLog.textContent = '';
                dom.settingsUpdateLog.hidden = true;
              }
            }
            if (dom.settingsUpdateLogEmpty) {
              dom.settingsUpdateLogEmpty.hidden = hasEntries;
            }
          }
        }

        function applySystemUpdate(update) {
          if (!update || typeof update !== 'object') {
            return;
          }
          const previousRunning = state.systemUpdate.running;
          state.systemUpdate.running = Boolean(update.running);
          state.systemUpdate.startedAt = parseIsoDate(update.started_at);
          state.systemUpdate.finishedAt = parseIsoDate(update.finished_at);
          state.systemUpdate.success =
            typeof update.success === 'boolean' ? update.success : null;
          state.systemUpdate.exitCode =
            typeof update.exit_code === 'number' && Number.isFinite(update.exit_code)
              ? update.exit_code
              : null;
          state.systemUpdate.error =
            typeof update.error === 'string' && update.error ? update.error : null;
          state.systemUpdate.log = Array.isArray(update.log) ? update.log : [];
          renderSystemUpdate();
          if (state.systemUpdate.running) {
            if (!previousRunning) {
              showStatus(t('status.updateRunning'), 'info', { persist: true });
            }
            startUpdatePolling();
          } else {
            stopUpdatePolling();
            if (previousRunning) {
              if (state.systemUpdate.success) {
                showStatus(t('status.updateCompleted'), 'success');
              } else if (state.systemUpdate.success === false) {
                const message = state.systemUpdate.error || t('status.updateFailed');
                showStatus(message, 'error');
              }
            }
          }
        }

        async function fetchSystemUpdateStatus() {
          try {
            const payload = await request('/api/system/update');
            applySystemUpdate(payload?.update);
          } catch (error) {
            if (state.systemUpdate.running) {
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message || t('status.updateFailed'), 'error');
              stopUpdatePolling();
            }
          } finally {
            renderSystemUpdate();
          }
        }

        async function triggerSystemUpdate() {
          if (!dom.settingsUpdateRun) {
            return;
          }
          if (dom.settingsUpdateRun.disabled) {
            return;
          }
          showStatus(t('status.updateStarted'), 'info');
          dom.settingsUpdateRun.disabled = true;
          if (dom.settingsUpdateRefresh) {
            dom.settingsUpdateRefresh.disabled = true;
          }
          try {
            const payload = await request('/api/system/update', { method: 'POST' });
            applySystemUpdate(payload?.update);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (typeof message === 'string' && message.toLowerCase().includes('already')) {
              showStatus(t('status.updateConflict'), 'info');
            } else {
              showStatus(message || t('status.updateFailed'), 'error');
            }
            await fetchSystemUpdateStatus();
          } finally {
            renderSystemUpdate();
          }
        }

        async function loadStorageBrowser(path, options = {}) {
          const browserState = getStorageBrowserState();
          const previousPath = browserState.path || '';
          const targetPath = typeof path === 'string' ? path : previousPath;
          if (targetPath !== previousPath) {
            browserState.selected.clear();
          }
          try {
            const payload = await request(buildStorageListUrl(targetPath));
            const entries = Array.isArray(payload?.entries) ? payload.entries : [];
            browserState.path = typeof payload?.path === 'string' ? payload.path : '';
            if (typeof payload?.parent === 'string') {
              browserState.parent = payload.parent;
            } else if (payload?.parent === null) {
              browserState.parent = null;
            } else {
              browserState.parent = null;
            }
            browserState.entries = entries;
            browserState.error = null;
            browserState.deleting.clear();
            const validPaths = new Set(
              entries
                .map((entry) => (typeof entry?.path === 'string' ? entry.path : ''))
                .filter((value) => typeof value === 'string' && value),
            );
            Array.from(browserState.selected).forEach((value) => {
              if (!validPaths.has(value)) {
                browserState.selected.delete(value);
              }
            });
            browserState.initialized = true;
            return browserState.path;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            browserState.error = message || t('status.storageLoadFailed');
            browserState.entries = [];
            browserState.parent = null;
            if (typeof targetPath === 'string') {
              browserState.path = targetPath;
            }
            if (!options?.silent) {
              showStatus(browserState.error, 'error');
            }
            browserState.initialized = true;
            return browserState.path;
          }
        }

        async function refreshStorage(options = {}) {
          if (!dom.storage) {
            return;
          }
          const includeOverview = options.includeOverview !== false;
          const force = options.force === true;
          const browserState = getStorageBrowserState();
          if (!force && (state.storage.loading || browserState.loading)) {
            return;
          }
          const targetPath =
            typeof options.path === 'string' ? options.path : browserState.path || '';

          if (includeOverview) {
            state.storage.loading = true;
          }
          browserState.loading = true;
          renderStorage();

          if (includeOverview) {
            try {
              const overviewPayload = await request('/api/storage/overview');
              state.storage.overview = overviewPayload ?? null;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message || t('status.storageLoadFailed'), 'error');
              state.storage.overview = null;
            }
            try {
              const usagePayload = await request('/api/storage/usage');
              state.storage.usage = usagePayload?.usage ?? usagePayload ?? null;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message || t('status.storageUsageFailed'), 'error');
            }
            state.storage.initialized = true;
            state.storage.loading = false;
          }

          await loadStorageBrowser(targetPath, { silent: options.silent === true });
          browserState.loading = false;
          browserState.initialized = true;
          renderStorage();
        }

        async function handleStorageEntryDeletion(path, name) {
          const browserState = getStorageBrowserState();
          const targetPath = typeof path === 'string' ? path : '';
          if (!targetPath) {
            return;
          }
          const fallbackName = targetPath.split('/').pop() || targetPath;
          const displayName = name || fallbackName || t('storage.browser.unnamed');
          const confirmed = await confirmDialog({
            title: t('storage.dialogs.deleteTitle'),
            message: t('storage.dialogs.deleteMessage', { name: displayName }),
            confirmText: t('storage.dialogs.deleteConfirm'),
            cancelText: t('dialog.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          browserState.deleting.add(targetPath);
          browserState.selected.delete(targetPath);
          renderStorageBrowser();
          try {
            await request('/api/storage', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ path: targetPath }),
            });
            browserState.deleting.delete(targetPath);
            showStatus(t('status.storageDeleted'), 'success');
            const currentPath = browserState.path || '';
            await refreshStorage({ includeOverview: true, path: currentPath, force: true });
          } catch (error) {
            browserState.deleting.delete(targetPath);
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message || t('status.storageDeleteFailed'), 'error');
            renderStorageBrowser();
          }
        }

        async function handleStorageBrowserAction(event) {
          const target = event.target;
          if (!(target instanceof Element)) {
            return;
          }
          const actionElement = target.closest('[data-storage-action]');
          if (!actionElement) {
            return;
          }
          const action = actionElement.dataset.storageAction;
          const path = actionElement.dataset.storagePath || '';
          if (action === 'open') {
            event.preventDefault();
            if (!path) {
              return;
            }
            await refreshStorage({ includeOverview: false, path, force: true });
            return;
          }
          if (action === 'delete') {
            event.preventDefault();
            if (!path) {
              return;
            }
            const name = actionElement.dataset.storageName || '';
            await handleStorageEntryDeletion(path, name);
          }
        }

        function handleStorageSelectionChange(event) {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) {
            return;
          }
          if (target.type !== 'checkbox') {
            return;
          }
          const entryPath = target.dataset.storageSelect || '';
          if (!entryPath) {
            return;
          }
          const browserState = getStorageBrowserState();
          if (target.checked) {
            browserState.selected.add(entryPath);
          } else {
            browserState.selected.delete(entryPath);
          }
          renderStorageBrowser();
        }

        function handleStorageSelectAll(event) {
          const target = event.target;
          if (!(target instanceof HTMLInputElement)) {
            return;
          }
          if (target.disabled) {
            return;
          }
          const browserState = getStorageBrowserState();
          browserState.selected.clear();
          if (target.checked) {
            const entries = Array.isArray(browserState.entries) ? browserState.entries : [];
            entries.forEach((entry) => {
              if (!entry || typeof entry !== 'object') {
                return;
              }
              const entryPath = typeof entry.path === 'string' ? entry.path : '';
              if (entryPath) {
                browserState.selected.add(entryPath);
              }
            });
          }
          renderStorageBrowser();
        }

        async function handleStorageDownloadSelected() {
          if (!dom.storage || !dom.storage.downloadSelected) {
            return;
          }
          const browserState = getStorageBrowserState();
          const selected = Array.from(browserState.selected);
          if (selected.length === 0) {
            showStatus(t('status.storageDownloadNone'), 'info');
            return;
          }
          dom.storage.downloadSelected.disabled = true;
          let success = false;
          try {
            const response = await request('/api/storage/download', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ paths: selected }),
            });
            const archive = response?.archive;
            if (!archive || typeof archive.path !== 'string' || !archive.path) {
              throw new Error(t('status.storageDownloadFailed'));
            }
            const downloadUrl = buildStorageURL(archive.path);
            const fileName =
              typeof archive.filename === 'string' && archive.filename
                ? archive.filename
                : 'storage-selection.zip';
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = fileName;
            anchor.rel = 'noopener noreferrer';
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            success = true;
            showStatus(t('status.storageDownloadReady'), 'success');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message || t('status.storageDownloadFailed'), 'error');
          } finally {
            if (dom.storage && dom.storage.downloadSelected) {
              dom.storage.downloadSelected.disabled = false;
            }
            if (success) {
              browserState.selected.clear();
            }
            renderStorageBrowser();
          }
        }

        function resolveProgressOperationLabel(entry) {
          if (!entry) {
            return '';
          }
          if (entry.type === 'transcription') {
            return t('progress.labels.transcription');
          }
          const operation = entry?.context?.operation || entry?.context?.type || '';
          if (operation === 'slide_bundle') {
            return t('progress.labels.slideBundle');
          }
          if (operation === 'audio_mastering') {
            return t('progress.labels.audioMastering');
          }
          return t('progress.labels.processing');
        }

        function renderProgressQueue() {
          if (!dom.progress || !dom.progress.list) {
            return;
          }
          const entries = Array.isArray(state.progress.entries)
            ? state.progress.entries
            : [];
          dom.progress.list.innerHTML = '';
          const isLoading = Boolean(state.progress.loading);
          if (dom.progress.container) {
            dom.progress.container.setAttribute('aria-busy', isLoading ? 'true' : 'false');
          }
          if (!entries.length) {
            if (dom.progress.empty) {
              dom.progress.empty.classList.remove('hidden');
            }
            return;
          }
          if (dom.progress.empty) {
            dom.progress.empty.classList.add('hidden');
          }
          entries.forEach((entry) => {
            const lectureId = Number(entry?.lecture_id);
            const listItem = document.createElement('li');
            listItem.className = 'progress-entry';
            listItem.dataset.status = entry?.error
              ? 'error'
              : entry?.finished
              ? 'finished'
              : 'running';
            listItem.dataset.progressType = entry?.type || '';
            listItem.dataset.lectureId = Number.isFinite(lectureId)
              ? String(lectureId)
              : '';

            const title = document.createElement('div');
            title.className = 'progress-entry-title';
            const heading = document.createElement('h3');
            const lectureName = entry?.lecture?.name || t('progress.labels.untitled');
            heading.textContent = lectureName;
            const statusKey = entry?.error
              ? 'error'
              : entry?.finished
              ? 'finished'
              : 'running';
            const statusLabel = document.createElement('span');
            statusLabel.className = 'progress-entry-status';
            statusLabel.textContent = t(`progress.status.${statusKey}`);
            title.appendChild(heading);
            title.appendChild(statusLabel);
            listItem.appendChild(title);

            const meta = document.createElement('div');
            meta.className = 'progress-entry-meta';
            const typeLabel = document.createElement('span');
            typeLabel.textContent = resolveProgressOperationLabel(entry);
            meta.appendChild(typeLabel);
            const locationParts = [];
            if (entry?.lecture?.class) {
              locationParts.push(entry.lecture.class);
            }
            if (entry?.lecture?.module) {
              locationParts.push(entry.lecture.module);
            }
            if (locationParts.length > 0) {
              const location = document.createElement('span');
              location.textContent = locationParts.join(' • ');
              meta.appendChild(location);
            }
            listItem.appendChild(meta);

            const messageText = entry?.message || '';
            if (messageText) {
              const message = document.createElement('p');
              message.className = 'progress-entry-message';
              message.textContent = messageText;
              listItem.appendChild(message);
            }

            const ratio = Number.isFinite(entry?.ratio) ? Number(entry.ratio) : null;
            if (ratio !== null) {
              const percent = Math.max(0, Math.min(1, ratio)) * 100;
              const bar = document.createElement('div');
              bar.className = 'status-progress';
              const track = document.createElement('div');
              track.className = 'status-progress-track';
              const fill = document.createElement('div');
              fill.className = 'status-progress-fill';
              fill.style.width = `${percent}%`;
              track.appendChild(fill);
              const percentLabel = document.createElement('span');
              percentLabel.className = 'status-progress-text';
              percentLabel.textContent = `${Math.round(percent)}%`;
              bar.appendChild(track);
              bar.appendChild(percentLabel);
              listItem.appendChild(bar);
            }

            const actions = document.createElement('div');
            actions.className = 'progress-entry-actions';
            if (entry?.retryable) {
              const retryButton = document.createElement('button');
              retryButton.type = 'button';
              retryButton.dataset.progressAction = 'retry';
              retryButton.dataset.progressType = entry?.type || '';
              retryButton.dataset.lectureId = listItem.dataset.lectureId || '';
              retryButton.textContent = t('progress.retry');
              actions.appendChild(retryButton);
            }
            if (entry?.lecture && Number.isFinite(lectureId)) {
              const openButton = document.createElement('button');
              openButton.type = 'button';
              openButton.className = 'text';
              openButton.dataset.progressAction = 'open';
              openButton.dataset.progressType = entry?.type || '';
              openButton.dataset.lectureId = listItem.dataset.lectureId || '';
              openButton.textContent = t('progress.openLecture');
              actions.appendChild(openButton);
            }
            const dismissButton = document.createElement('button');
            dismissButton.type = 'button';
            dismissButton.className = 'text';
            dismissButton.dataset.progressAction = 'dismiss';
            dismissButton.dataset.progressType = entry?.type || '';
            dismissButton.dataset.lectureId = listItem.dataset.lectureId || '';
            dismissButton.textContent = t('progress.dismiss');
            actions.appendChild(dismissButton);
            listItem.appendChild(actions);

            dom.progress.list.appendChild(listItem);
          });
        }

        async function refreshProgressQueue({ force = false, silent = false } = {}) {
          if (state.progress.loading && !force) {
            return;
          }
          if (!dom.progress) {
            return;
          }
          state.progress.loading = true;
          if (!silent) {
            renderProgressQueue();
          }
          try {
            const payload = await request('/api/progress');
            state.progress.entries = Array.isArray(payload?.entries)
              ? payload.entries
              : [];
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            if (!silent && detail) {
              showStatus(detail, 'error');
            }
          } finally {
            state.progress.loading = false;
            renderProgressQueue();
          }
        }

        function stopProgressPolling() {
          if (progressStore.timer !== null) {
            window.clearInterval(progressStore.timer);
          }
          progressStore.timer = null;
          progressStore.polling = false;
        }

        function startProgressPolling() {
          stopProgressPolling();
          if (!dom.progress || !dom.progress.container) {
            return;
          }
          const poll = async () => {
            if (progressStore.polling) {
              return;
            }
            progressStore.polling = true;
            try {
              await refreshProgressQueue({ silent: true });
            } finally {
              progressStore.polling = false;
            }
          };
          void poll();
          progressStore.timer = window.setInterval(() => {
            void poll();
          }, 2500);
        }

        async function dismissProgressEntry(entry) {
          if (!entry) {
            return;
          }
          const lectureId = Number(entry.lecture_id);
          if (!Number.isFinite(lectureId)) {
            return;
          }
          const type = entry.type ? `?type=${encodeURIComponent(entry.type)}` : '';
          try {
            await request(`/api/progress/${lectureId}${type}`, { method: 'DELETE' });
            state.progress.entries = state.progress.entries.filter(
              (item) =>
                !(Number(item?.lecture_id) === lectureId && item?.type === entry.type),
            );
            renderProgressQueue();
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            showStatus(detail || t('status.processing'), 'error');
          }
        }

        async function retryProgressEntry(entry) {
          if (!entry) {
            return;
          }
          const lectureId = Number(entry.lecture_id);
          if (!Number.isFinite(lectureId)) {
            return;
          }
          try {
            if (entry.type === 'transcription') {
              const model = entry?.context?.model || state.settings?.whisper_model || 'base';
              await request(`/api/lectures/${lectureId}/transcribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model }),
              });
              startTranscriptionProgress(lectureId);
            } else if (entry.type === 'processing') {
              const operation = entry?.context?.operation || entry?.context?.type;
              if (operation === 'slide_bundle') {
                const formData = new FormData();
                if (entry?.context?.preview_token) {
                  formData.append('preview_token', entry.context.preview_token);
                }
                const pageRange = entry?.context?.page_range;
                if (pageRange?.start) {
                  formData.append('page_start', String(pageRange.start));
                }
                if (pageRange?.end) {
                  formData.append('page_end', String(pageRange.end));
                }
                await request(`/api/lectures/${lectureId}/process-slides`, {
                  method: 'POST',
                  body: formData,
                });
                startProcessingProgress(lectureId);
              } else {
                showStatus(t('progress.retryUnavailable'), 'info');
                return;
              }
            }
            await refreshProgressQueue({ force: true, silent: true });
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            showStatus(detail || t('status.processing'), 'error');
          }
        }

        async function handleProgressAction(event) {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (!target) {
            return;
          }
          const button = target.closest('button[data-progress-action]');
          if (!button) {
            return;
          }
          const action = button.dataset.progressAction || '';
          const lectureId = Number(button.dataset.lectureId);
          const type = button.dataset.progressType || '';
          const entry = state.progress.entries.find(
            (item) =>
              Number(item?.lecture_id) === lectureId &&
              (type ? item?.type === type : true),
          );
          if (action === 'retry') {
            await retryProgressEntry(entry);
            return;
          }
          if (action === 'dismiss') {
            await dismissProgressEntry(entry);
            return;
          }
          if (action === 'open' && Number.isFinite(lectureId)) {
            await selectLecture(lectureId);
            setActiveView('details');
          }
        }

        async function handlePurgeProcessedAudio() {
          if (!dom.storage || !dom.storage.purge) {
            return;
          }
          const overview = state.storage.overview;
          const eligible = Number(overview?.eligible_audio_total) || 0;
          if (!eligible || state.storage.purging) {
            return;
          }
          const lectureWord = pluralize(currentLanguage, 'counts.lecture', eligible);
          const confirmed = await confirmDialog({
            title: t('storage.dialogs.purgeTitle'),
            message: t('storage.dialogs.purgeMessage', { count: eligible, lectureWord }),
            confirmText: t('common.actions.delete'),
            cancelText: t('dialog.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          try {
            state.storage.purging = true;
            renderStorage();
            await request('/api/storage/purge-audio', { method: 'POST' });
            showStatus(t('status.storagePurged'), 'success');
            await refreshStorage();
          } catch (error) {
            const messageText = error instanceof Error ? error.message : String(error);
            showStatus(messageText || t('status.storagePurgeFailed'), 'error');
          } finally {
            state.storage.purging = false;
            renderStorage();
          }
        }

        await applyTranslations(DEFAULT_LANGUAGE);
        renderStorage();
        renderSystemUpdate();
        renderProgressQueue();
        void refreshProgressQueue({ silent: true });

        const STATUS_DEFAULT_TIMEOUT = 5000;

        function resetStatusProgress() {
          if (dom.statusProgress) {
            dom.statusProgress.hidden = true;
          }
          if (dom.statusProgressFill) {
            dom.statusProgressFill.style.width = '0%';
          }
          if (dom.statusProgressText) {
            dom.statusProgressText.textContent = '';
          }
        }

        function hideStatus() {
          if (state.statusHideTimer !== null) {
            window.clearTimeout(state.statusHideTimer);
            state.statusHideTimer = null;
          }
          if (!dom.status) {
            return;
          }
          dom.status.style.display = 'none';
          dom.status.removeAttribute('data-variant');
          if (dom.statusMessage) {
            dom.statusMessage.textContent = '';
          } else {
            dom.status.textContent = '';
          }
          resetStatusProgress();
        }

        const assetDefinitions = [
          {
            key: 'audio_path',
            labelKey: 'assets.labels.audio',
            accept: 'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.oga,.opus',
            type: 'audio',
          },
          {
            key: 'processed_audio_path',
            labelKey: 'assets.labels.masteredAudio',
            accept: null,
            type: 'processed_audio',
          },
          {
            key: 'slide_path',
            labelKey: 'assets.labels.slides',
            accept: 'application/pdf',
            type: 'slides',
          },
          {
            key: 'transcript_path',
            labelKey: 'assets.labels.transcript',
            accept: '.txt,.md,text/plain',
            type: 'transcript',
          },
          {
            key: 'notes_path',
            labelKey: 'assets.labels.notes',
            accept:
              '.txt,.md,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            type: 'notes',
          },
          {
            key: 'slide_image_dir',
            labelKey: 'assets.labels.slideBundle',
            accept: null,
            type: 'slide_bundle',
          },
        ];

        function showStatus(message, variant = 'info', options = {}) {
          if (!dom.status) {
            return;
          }

          if (state.statusHideTimer !== null) {
            window.clearTimeout(state.statusHideTimer);
            state.statusHideTimer = null;
          }

          if (!message) {
            hideStatus();
            return;
          }

          const ratioValue =
            options && typeof options.progressRatio === 'number'
              ? options.progressRatio
              : null;
          const hasRatio = Number.isFinite(ratioValue);
          const clampedRatio = hasRatio
            ? Math.max(0, Math.min(Number(ratioValue), 1))
            : null;

          dom.status.dataset.variant = variant;
          dom.status.style.display = 'block';
          if (dom.statusMessage) {
            dom.statusMessage.textContent = message;
          } else {
            dom.status.textContent = message;
          }

          if (clampedRatio !== null) {
            const percentValue = Math.round(clampedRatio * 1000) / 10;
            const label = Number.isInteger(percentValue)
              ? `${percentValue}%`
              : `${percentValue.toFixed(1)}%`;
            if (dom.statusProgress) {
              dom.statusProgress.hidden = false;
            }
            if (dom.statusProgressFill) {
              dom.statusProgressFill.style.width = `${percentValue}%`;
            }
            if (dom.statusProgressText) {
              dom.statusProgressText.textContent = label;
            }
          } else {
            resetStatusProgress();
          }

          const progressActive = clampedRatio !== null && clampedRatio < 1;
          const persistOption =
            options && Object.prototype.hasOwnProperty.call(options, 'persist')
              ? Boolean(options.persist)
              : progressActive;
          const timeoutMs =
            options && typeof options.timeoutMs === 'number' && Number.isFinite(options.timeoutMs)
              ? Math.max(0, options.timeoutMs)
              : STATUS_DEFAULT_TIMEOUT;

          if (!persistOption) {
            state.statusHideTimer = window.setTimeout(() => {
              state.statusHideTimer = null;
              hideStatus();
            }, timeoutMs);
          }
        }

        function updateGpuWhisperUI(status = {}) {
          const supported = Boolean(status.supported);
          const checked = Boolean(status.checked);
          const unavailable = Boolean(status.unavailable);
          const output = typeof status.output === 'string' ? status.output : '';
          const lastChecked = status.last_checked || null;
          let message =
            typeof status.message === 'string' && status.message.trim().length > 0
              ? status.message.trim()
              : checked
              ? t('status.gpuUnavailable')
              : t('settings.whisper.gpu.status');

          state.gpuWhisper = {
            supported,
            checked,
            message,
            output,
            lastChecked,
            unavailable,
          };

          if (dom.settingsWhisperGpuStatus) {
            let displayMessage = message;
            if (output) {
              const snippet = output.split('\n').slice(0, 5).join('\n').trim();
              if (snippet && snippet !== message) {
                displayMessage = `${message}\n${snippet}`;
              }
            }
            dom.settingsWhisperGpuStatus.textContent = displayMessage;
          }

          if (dom.settingsWhisperGpuTest) {
            dom.settingsWhisperGpuTest.disabled = unavailable;
            dom.settingsWhisperGpuTest.textContent = supported
              ? t('settings.whisper.gpu.retry')
              : t('settings.whisper.gpu.test');
          }

          if (dom.gpuModelOptions) {
            dom.gpuModelOptions.forEach((option) => {
              if (option instanceof HTMLOptionElement) {
                option.disabled = !supported;
              }
            });
          }

          const requestedModel =
            state.settings?.whisper_model_requested || state.settings?.whisper_model;
          if (!supported) {
            if (dom.settingsWhisperModel && dom.settingsWhisperModel.value === GPU_MODEL) {
              dom.settingsWhisperModel.value = DEFAULT_WHISPER_MODEL;
            }
            const transcribeSelect = getTranscribeModelSelect();
            if (transcribeSelect && transcribeSelect.value === GPU_MODEL) {
              setTranscribeModelValue(DEFAULT_WHISPER_MODEL);
            }
            if (state.settings) {
              state.settings.whisper_model = dom.settingsWhisperModel
                ? dom.settingsWhisperModel.value
                : DEFAULT_WHISPER_MODEL;
          }
          } else if (requestedModel === GPU_MODEL) {
            if (dom.settingsWhisperModel) {
              dom.settingsWhisperModel.value = GPU_MODEL;
            }
            setTranscribeModelValue(GPU_MODEL);
            if (state.settings) {
              state.settings.whisper_model = GPU_MODEL;
            }
        }
      }

      function ensureDebugPlaceholder() {
        if (!dom.debugLog || !dom.debugEmpty) {
          return;
        }
        if (!dom.debugEmpty.parentElement) {
          dom.debugLog.appendChild(dom.debugEmpty);
        }
      }

      function normalizeCorrelationValue(value) {
        if (typeof value === 'string') {
          return value.trim();
        }
        if (value == null) {
          return '';
        }
        return String(value).trim();
      }

      function getEntryCorrelation(entry, key) {
        if (!entry || typeof entry !== 'object') {
          return '';
        }
        const sources = [entry[key], entry?.context?.[key], entry?.payload?.[key]];
        for (const source of sources) {
          const normalized = normalizeCorrelationValue(source);
          if (normalized) {
            return normalized;
          }
        }
        return '';
      }

      function normalizeFilterValue(value) {
        if (typeof value === 'string') {
          return value.trim().toLowerCase();
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return String(value).trim().toLowerCase();
        }
        return '';
      }

      function hasActiveFilters() {
        const filters = state.debug.filters || {};
        if (normalizeFilterValue(filters.severity) && normalizeFilterValue(filters.severity) !== 'all') {
          return true;
        }
        if (normalizeFilterValue(filters.category) && normalizeFilterValue(filters.category) !== 'all') {
          return true;
        }
        return Boolean(
          normalizeFilterValue(filters.correlationId) ||
            normalizeFilterValue(filters.taskId) ||
            normalizeFilterValue(filters.query),
        );
      }

      function getEntrySeverity(entry) {
        const sources = [entry?.severity, entry?.level, entry?.status];
        for (const source of sources) {
          if (typeof source === 'string') {
            const normalized = source.trim().toLowerCase();
            if (!normalized) {
              continue;
            }
            if (normalized === 'failed' || normalized === 'failure') {
              return 'error';
            }
            return normalized;
          }
        }
        if (typeof entry?.context?.severity === 'string') {
          const normalized = entry.context.severity.trim().toLowerCase();
          if (normalized) {
            return normalized;
          }
        }
        if (typeof entry?.payload?.severity === 'string') {
          const normalized = entry.payload.severity.trim().toLowerCase();
          if (normalized) {
            return normalized;
          }
        }
        return 'info';
      }

      function getEntryCategory(entry) {
        const category = normalizeFilterValue(entry?.category);
        if (category) {
          return category;
        }
        const hasTaskId = Boolean(getEntryCorrelation(entry, 'task_id') || getEntryCorrelation(entry, 'taskId'));
        if (hasTaskId) {
          return 'task';
        }
        return 'app';
      }

      function getEntryTaskId(entry) {
        const taskKeys = ['task_id', 'taskId', 'job_id', 'jobId'];
        for (const key of taskKeys) {
          const value = getEntryCorrelation(entry, key);
          if (value) {
            return value;
          }
        }
        if (typeof entry?.task === 'string' && entry.task.trim()) {
          return entry.task.trim();
        }
        return '';
      }

      function collectEntryCorrelations(entry) {
        const values = new Set();
        const append = (value) => {
          const normalized = normalizeCorrelationValue(value);
          if (normalized) {
            values.add(normalized);
          }
        };
        const correlationKeys = [
          'correlation_id',
          'correlationId',
          'request_id',
          'requestId',
          'job_id',
          'jobId',
          'actor',
          'task_id',
          'taskId',
          'trace_id',
          'span_id',
          'parent_request_id',
        ];
        correlationKeys.forEach((key) => {
          append(getEntryCorrelation(entry, key));
        });
        if (Array.isArray(entry?.correlation_ids)) {
          entry.correlation_ids.forEach((value) => append(value));
        }
        if (typeof entry?.correlation_id === 'string') {
          append(entry.correlation_id);
        }
        return Array.from(values);
      }

      function entryMatchesQuery(entry, query) {
        const normalizedQuery = normalizeFilterValue(query);
        if (!normalizedQuery) {
          return true;
        }
        const segments = [];
        const append = (value) => {
          if (value == null) {
            return;
          }
          if (typeof value === 'string') {
            const normalized = value.toLowerCase();
            if (normalized) {
              segments.push(normalized);
            }
            return;
          }
          if (typeof value === 'number' || typeof value === 'boolean') {
            segments.push(String(value).toLowerCase());
            return;
          }
          if (typeof value === 'object') {
            try {
              const serialized = JSON.stringify(value);
              if (serialized) {
                segments.push(serialized.toLowerCase());
              }
            } catch (error) {
              console.warn('Unable to serialize log entry for search', error);
            }
          }
        };

        append(entry?.message);
        append(entry?.rendered);
        append(entry?.event_type);
        append(entry?.logger);
        append(entry?.category);
        append(entry?.context);
        append(entry?.payload);
        append(entry?.stack);
        append(entry?.error);
        append(entry?.exception);

        return segments.some((segment) => segment.includes(normalizedQuery));
      }

      function isEntryFailure(entry) {
        const severity = getEntrySeverity(entry);
        if (severity === 'error' || severity === 'critical') {
          return true;
        }
        const status = normalizeFilterValue(entry?.status);
        if (status === 'failed' || status === 'error') {
          return true;
        }
        const contextStatus = normalizeFilterValue(entry?.context?.status);
        if (contextStatus === 'failed' || contextStatus === 'error') {
          return true;
        }
        const payloadStatus = normalizeFilterValue(entry?.payload?.status);
        if (payloadStatus === 'failed' || payloadStatus === 'error') {
          return true;
        }
        if (typeof entry?.error === 'string' && entry.error.trim()) {
          return true;
        }
        if (typeof entry?.exception === 'string' && entry.exception.trim()) {
          return true;
        }
        return false;
      }

      function formatTimestamp(value) {
        if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
          return '';
        }
        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toLocaleTimeString([], {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
        }
        if (typeof value === 'string') {
          return value;
        }
        return '';
      }

      function matchesDebugFilters(entry) {
        const filters = state.debug.filters || {};
        const severityFilter = normalizeFilterValue(filters.severity);
        if (severityFilter && severityFilter !== 'all') {
          const entrySeverity = getEntrySeverity(entry);
          if (severityFilter === 'error') {
            if (entrySeverity !== 'error' && entrySeverity !== 'critical') {
              return false;
            }
          } else if (entrySeverity !== severityFilter) {
            return false;
          }
        }

        const categoryFilter = normalizeFilterValue(filters.category);
        if (categoryFilter && categoryFilter !== 'all') {
          const entryCategory = getEntryCategory(entry);
          if (entryCategory !== categoryFilter) {
            return false;
          }
        }

        const correlationFilter = normalizeFilterValue(filters.correlationId);
        if (correlationFilter) {
          const correlations = collectEntryCorrelations(entry).map((value) => value.toLowerCase());
          const match = correlations.some((value) => value.includes(correlationFilter));
          if (!match) {
            return false;
          }
        }

        const taskFilter = normalizeFilterValue(filters.taskId);
        if (taskFilter) {
          const taskId = normalizeFilterValue(getEntryTaskId(entry));
          if (!taskId || !taskId.includes(taskFilter)) {
            return false;
          }
        }

        const query = filters.query;
        if (typeof query === 'string' && normalizeFilterValue(query)) {
          if (!entryMatchesQuery(entry, query)) {
            return false;
          }
        }

        return true;
      }

      function applyDebugFilters(entries) {
        const list = Array.isArray(entries) ? entries : [];
        return list.filter((entry) => matchesDebugFilters(entry));
      }

      function summarizeEntryDetails(entry) {
        const ignore = new Set([
          'request_id',
          'requestId',
          'job_id',
          'jobId',
          'actor',
          'correlation_id',
          'correlationId',
          'task_id',
          'taskId',
          'retry',
          'retry_count',
          'attempt',
          'duplicate',
          'is_duplicate',
        ]);
        const segments = [];
        const seen = new Set();
        const appendFrom = (source) => {
          if (!source || typeof source !== 'object') {
            return;
          }
          Object.entries(source).forEach(([key, value]) => {
            if (!key || ignore.has(key)) {
              return;
            }
            const normalized = normalizeCorrelationValue(value);
            if (!normalized) {
              return;
            }
            const label = `${key}: ${normalized}`;
            if (seen.has(label)) {
              return;
            }
            seen.add(label);
            segments.push(label);
          });
        };
        appendFrom(entry?.context);
        appendFrom(entry?.payload);
        if (typeof entry?.count === 'number' && entry.count > 1) {
          const label = `occurrences: ${entry.count}`;
          if (!seen.has(label)) {
            seen.add(label);
            segments.push(label);
          }
        }
        if (typeof entry?.last_duration_ms === 'number') {
          const last = entry.last_duration_ms.toFixed(1).replace(/\.0$/, '');
          const label = `last ${last} ms`;
          if (!seen.has(label)) {
            seen.add(label);
            segments.push(label);
          }
        }
        if (typeof entry?.average_duration_ms === 'number' && entry.average_duration_ms > 0) {
          const avg = entry.average_duration_ms.toFixed(1).replace(/\.0$/, '');
          const label = `avg ${avg} ms`;
          if (!seen.has(label)) {
            seen.add(label);
            segments.push(label);
          }
        }
        return segments;
      }

      function extractStackTrace(entry) {
        const candidates = [
          entry?.stack,
          entry?.exception?.stack,
          entry?.exception?.stacktrace,
          entry?.exception?.traceback,
          entry?.traceback,
          entry?.context?.stack,
          entry?.context?.stacktrace,
          entry?.context?.traceback,
          entry?.payload?.stack,
          entry?.payload?.stacktrace,
          entry?.payload?.trace,
        ];
        for (const candidate of candidates) {
          if (typeof candidate === 'string' && candidate.trim()) {
            return candidate.trim();
          }
          if (Array.isArray(candidate) && candidate.length) {
            return candidate.join('\n');
          }
        }
        return '';
      }

      function extractCombinedContext(entry) {
        const combined = {};
        let hasValues = false;
        const merge = (source) => {
          if (!source || typeof source !== 'object') {
            return;
          }
          Object.entries(source).forEach(([key, value]) => {
            if (value === undefined) {
              return;
            }
            if (typeof key !== 'string' || !key) {
              return;
            }
            combined[key] = value;
            hasValues = true;
          });
        };
        merge(entry?.context);
        merge(entry?.payload);
        merge(entry?.extra);
        if (!hasValues) {
          return '';
        }
        try {
          return JSON.stringify(combined, null, 2);
        } catch (error) {
          console.warn('Unable to stringify log context', error);
          return String(combined);
        }
      }

      function extractEntryBadges(entry) {
        const badges = [];
        const retryCandidates = [
          entry?.retry,
          entry?.context?.retry,
          entry?.context?.retry_count,
          entry?.payload?.retry,
          entry?.payload?.retry_count,
          entry?.attempt,
          entry?.context?.attempt,
          entry?.payload?.attempt,
        ];
        let retryCount = null;
        retryCandidates.forEach((value) => {
          if (Number.isFinite(value)) {
            const numeric = Number(value);
            if (numeric > 0) {
              retryCount = retryCount === null ? numeric : Math.max(retryCount, numeric);
            }
          } else if (typeof value === 'string' && value.trim()) {
            const numeric = Number.parseInt(value.trim(), 10);
            if (!Number.isNaN(numeric) && numeric > 0) {
              retryCount = retryCount === null ? numeric : Math.max(retryCount, numeric);
            }
          }
        });
        if (retryCount !== null) {
          badges.push({ label: `retry ×${retryCount}`, variant: 'warning' });
        } else {
          const retryFlag = retryCandidates.some((value) => {
            if (typeof value === 'boolean') {
              return value;
            }
            if (typeof value === 'string') {
              const normalized = value.trim().toLowerCase();
              return normalized === 'true' || normalized === 'retry';
            }
            return false;
          });
          if (retryFlag) {
            badges.push({ label: 'retry', variant: 'warning' });
          }
        }

        const duplicateCandidates = [
          entry?.duplicate,
          entry?.is_duplicate,
          entry?.context?.duplicate,
          entry?.context?.is_duplicate,
          entry?.payload?.duplicate,
          entry?.payload?.is_duplicate,
        ];
        const hasDuplicate = duplicateCandidates.some((value) => {
          if (typeof value === 'boolean') {
            return value;
          }
          if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized === 'true' || normalized === 'duplicate';
          }
          return false;
        });
        if (hasDuplicate) {
          badges.push({ label: 'duplicate', variant: 'accent' });
        }

        return badges;
      }

      async function copyTextToClipboard(text) {
        if (!text) {
          throw new Error('Nothing to copy');
        }
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
          return;
        }

        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        try {
          const successful = document.execCommand('copy');
          if (!successful) {
            throw new Error('execCommand copy failed');
          }
        } finally {
          document.body.removeChild(textarea);
        }
      }

      function createCopyButton(getText) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'debug-copy-button';
        button.textContent = 'Copy';
        button.setAttribute('aria-label', 'Copy message');
        button.title = 'Copy message';

        const updateDisabledState = () => {
          try {
            const text = getText();
            button.disabled = !text;
          } catch (error) {
            button.disabled = true;
          }
        };

        updateDisabledState();

        let resetTimer = null;
        button.addEventListener('click', async () => {
          const originalText = 'Copy';
          const copiedText = 'Copied!';
          const errorText = 'Copy failed';
          window.clearTimeout(resetTimer);
          try {
            const text = getText();
            if (!text) {
              throw new Error('Nothing to copy');
            }
            await copyTextToClipboard(text);
            button.dataset.state = 'copied';
            button.textContent = copiedText;
          } catch (error) {
            console.error('Failed to copy message', error);
            button.dataset.state = 'error';
            button.textContent = errorText;
          }
          resetTimer = window.setTimeout(() => {
            button.dataset.state = '';
            button.textContent = originalText;
            updateDisabledState();
          }, 2000);
        });

        return button;
      }

      function buildDebugLogEntry(entry, { isFirstFailure = false } = {}) {
        const severity = getEntrySeverity(entry);
        const category = getEntryCategory(entry);
        const element = document.createElement('article');
        element.className = 'debug-log-entry';
        element.dataset.severity = severity;
        element.dataset.category = category;
        if (entry && typeof entry === 'object' && entry.id != null) {
          element.dataset.entryId = String(entry.id);
        }
        if (isFirstFailure) {
          element.classList.add('is-first-failure');
        }

        const timeline = document.createElement('div');
        timeline.className = 'debug-log-entry-timeline';
        const dot = document.createElement('div');
        dot.className = 'debug-log-entry-dot';
        timeline.appendChild(dot);
        element.appendChild(timeline);

        const body = document.createElement('div');
        body.className = 'debug-log-entry-body';
        element.appendChild(body);

        const header = document.createElement('header');
        header.className = 'debug-log-entry-header';
        body.appendChild(header);

        const title = document.createElement('div');
        title.className = 'debug-log-entry-title';
        header.appendChild(title);

        const severityBadge = document.createElement('span');
        severityBadge.className = 'debug-log-severity';
        severityBadge.dataset.variant = severity;
        severityBadge.textContent = severity;
        title.appendChild(severityBadge);

        const eventType = normalizeCorrelationValue(entry?.event_type || entry?.logger || entry?.category);
        if (eventType) {
          const badge = document.createElement('span');
          badge.className = 'debug-log-badge';
          badge.dataset.variant = 'accent';
          badge.textContent = eventType;
          title.appendChild(badge);
        }

        if (entry?.level != null && entry.level !== '') {
          const levelText =
            typeof entry.level === 'string' && entry.level.trim()
              ? entry.level.trim()
              : String(entry.level);
          if (levelText) {
            const levelBadge = document.createElement('span');
            levelBadge.className = 'debug-log-tag';
            levelBadge.textContent = levelText;
            title.appendChild(levelBadge);
          }
        }

        if (category && category !== 'app') {
          const categoryBadge = document.createElement('span');
          categoryBadge.className = 'debug-log-tag';
          categoryBadge.textContent = category;
          title.appendChild(categoryBadge);
        }

        const timestampSource =
          entry?.last_seen || entry?.first_seen || entry?.timestamp || entry?.time || entry?.created_at;
        const formattedTime = formatTimestamp(timestampSource);
        if (formattedTime) {
          const timeElement = document.createElement('span');
          timeElement.className = 'debug-log-time';
          timeElement.textContent = formattedTime;
          header.appendChild(timeElement);
        }

        const renderedValue =
          typeof entry?.rendered === 'string' && entry.rendered
            ? entry.rendered
            : entry?.message != null
            ? entry.message
            : '';
        const messageText =
          typeof renderedValue === 'string' ? renderedValue : String(renderedValue ?? '');
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'debug-log-message-wrapper';
        const messageElement = document.createElement('div');
        messageElement.className = 'debug-log-message';
        messageElement.textContent = messageText;
        messageWrapper.appendChild(messageElement);
        const copyButton = createCopyButton(() => messageElement.textContent || '');
        messageWrapper.appendChild(copyButton);
        body.appendChild(messageWrapper);

        const meta = document.createElement('div');
        meta.className = 'debug-log-entry-meta';
        const correlationLabels = [
          ['request_id', 'req'],
          ['job_id', 'job'],
          ['actor', 'actor'],
          ['correlation_id', 'corr'],
          ['task_id', 'task'],
          ['trace_id', 'trace'],
        ];
        const seenCorrelation = new Set();
        correlationLabels.forEach(([key, label]) => {
          const value = getEntryCorrelation(entry, key);
          if (value && !seenCorrelation.has(`${key}:${value}`)) {
            seenCorrelation.add(`${key}:${value}`);
            const tag = document.createElement('span');
            tag.className = 'debug-log-tag';
            tag.textContent = `${label} ${value}`;
            meta.appendChild(tag);
          }
        });

        const correlations = collectEntryCorrelations(entry);
        correlations.forEach((value) => {
          if (!seenCorrelation.has(value)) {
            seenCorrelation.add(value);
            const tag = document.createElement('span');
            tag.className = 'debug-log-tag';
            tag.textContent = value;
            meta.appendChild(tag);
          }
        });

        const badges = extractEntryBadges(entry);
        if (badges.length) {
          const badgeRow = document.createElement('div');
          badgeRow.className = 'debug-log-entry-badges';
          badges.forEach((badge) => {
            const badgeElement = document.createElement('span');
            badgeElement.className = 'debug-log-badge';
            if (badge.variant) {
              badgeElement.dataset.variant = badge.variant;
            }
            badgeElement.textContent = badge.label;
            badgeRow.appendChild(badgeElement);
          });
          meta.appendChild(badgeRow);
        }

        if (meta.childElementCount > 0) {
          body.appendChild(meta);
        }

        const detailTags = summarizeEntryDetails(entry);
        if (detailTags.length) {
          const detailRow = document.createElement('div');
          detailRow.className = 'debug-log-context';
          detailTags.slice(0, 8).forEach((detail) => {
            const detailTag = document.createElement('span');
            detailTag.className = 'debug-log-tag';
            detailTag.textContent = detail;
            detailRow.appendChild(detailTag);
          });
          body.appendChild(detailRow);
        }

        const stackTrace = extractStackTrace(entry);
        const contextJson = extractCombinedContext(entry);
        if (stackTrace || contextJson) {
          const expandable = document.createElement('details');
          expandable.className = 'debug-log-entry-expandable';
          if (severity === 'error' || severity === 'critical') {
            expandable.dataset.variant = 'error';
          }
          const summary = document.createElement('summary');
          if (stackTrace && contextJson) {
            summary.textContent = 'View stack trace & context';
          } else if (stackTrace) {
            summary.textContent = 'View stack trace';
          } else {
            summary.textContent = 'View context';
          }
          expandable.appendChild(summary);

          if (stackTrace) {
            const stackBlock = document.createElement('div');
            stackBlock.className = 'debug-log-entry-expandable-block';
            const stackLabel = document.createElement('div');
            stackLabel.className = 'debug-log-entry-expandable-label';
            stackLabel.textContent = 'Stack trace';
            const stackPre = document.createElement('pre');
            stackPre.textContent = stackTrace;
            stackBlock.appendChild(stackLabel);
            stackBlock.appendChild(stackPre);
            expandable.appendChild(stackBlock);
          }

          if (contextJson) {
            const contextBlock = document.createElement('div');
            contextBlock.className = 'debug-log-entry-expandable-block';
            const contextLabel = document.createElement('div');
            contextLabel.className = 'debug-log-entry-expandable-label';
            contextLabel.textContent = 'Context';
            const contextPre = document.createElement('pre');
            contextPre.textContent = contextJson;
            contextBlock.appendChild(contextLabel);
            contextBlock.appendChild(contextPre);
            expandable.appendChild(contextBlock);
          }

          body.appendChild(expandable);
        }

        return element;
      }

      function buildDebugStreamEntry(entry) {
        const severity = getEntrySeverity(entry);
        const element = document.createElement('div');
        element.className = 'debug-stream-entry';
        element.dataset.severity = severity;

        const header = document.createElement('div');
        header.className = 'debug-stream-entry-header';
        const title = document.createElement('span');
        title.className = 'debug-stream-entry-title';
        title.textContent = normalizeCorrelationValue(
          entry?.event_type || entry?.logger || entry?.category || 'event',
        );
        header.appendChild(title);

        const timestamp =
          entry?.timestamp || entry?.last_seen || entry?.first_seen || entry?.time || entry?.created_at;
        const formattedTime = formatTimestamp(timestamp);
        if (formattedTime) {
          const timeElement = document.createElement('span');
          timeElement.className = 'debug-stream-entry-time';
          timeElement.textContent = formattedTime;
          header.appendChild(timeElement);
        }
        element.appendChild(header);

        const rendered =
          typeof entry?.message === 'string' && entry.message
            ? entry.message
            : typeof entry?.rendered === 'string'
            ? entry.rendered
            : entry?.message != null
            ? String(entry.message)
            : '';
        const messageWrapper = document.createElement('div');
        messageWrapper.className = 'debug-stream-entry-message-wrapper';
        const messageElement = document.createElement('div');
        messageElement.className = 'debug-stream-entry-message';
        messageElement.textContent =
          typeof rendered === 'string' ? rendered : String(rendered ?? '');
        messageWrapper.appendChild(messageElement);
        const copyButton = createCopyButton(() => messageElement.textContent || '');
        messageWrapper.appendChild(copyButton);
        element.appendChild(messageWrapper);

        const meta = document.createElement('div');
        meta.className = 'debug-stream-entry-meta';
        const statusValue =
          entry?.status != null ? entry.status : entry?.context?.status ?? entry?.payload?.status;
        const statusText =
          typeof statusValue === 'string'
            ? statusValue
            : statusValue != null
            ? String(statusValue)
            : '';
        if (statusText) {
          const statusTag = document.createElement('span');
          statusTag.className = 'debug-log-tag';
          statusTag.textContent = `status ${statusText}`;
          meta.appendChild(statusTag);
        }
        const phaseValue = entry?.context?.phase || entry?.payload?.phase || entry?.phase;
        const phaseText =
          typeof phaseValue === 'string'
            ? phaseValue
            : phaseValue != null
            ? String(phaseValue)
            : '';
        if (phaseText) {
          const phaseTag = document.createElement('span');
          phaseTag.className = 'debug-log-tag';
          phaseTag.textContent = `phase ${phaseText}`;
          meta.appendChild(phaseTag);
        }
        const correlations = collectEntryCorrelations(entry);
        correlations.slice(0, 3).forEach((value) => {
          const tag = document.createElement('span');
          tag.className = 'debug-log-tag';
          tag.textContent = value;
          meta.appendChild(tag);
        });
        const badges = extractEntryBadges(entry);
        badges.forEach((badge) => {
          const badgeElement = document.createElement('span');
          badgeElement.className = 'debug-log-badge';
          if (badge.variant) {
            badgeElement.dataset.variant = badge.variant;
          }
          badgeElement.textContent = badge.label;
          meta.appendChild(badgeElement);
        });
        if (meta.childElementCount > 0) {
          element.appendChild(meta);
        }

        if (entry?.error != null && entry.error !== '') {
          const errorText =
            typeof entry.error === 'string' ? entry.error : String(entry.error);
          const errorLine = document.createElement('div');
          errorLine.className = 'debug-stream-entry-error';
          errorLine.textContent = errorText;
          element.appendChild(errorLine);
        }

        return element;
      }

      function renderDebugHeartbeat(entries, firstFailureIndex) {
        if (!dom.debugHeartbeat || !dom.debugHeartbeatTrack) {
          return;
        }
        const track = dom.debugHeartbeatTrack;
        track.innerHTML = '';
        if (!Array.isArray(entries) || entries.length === 0) {
          dom.debugHeartbeat.dataset.state = 'idle';
          return;
        }
        dom.debugHeartbeat.dataset.state = 'active';
        const maxDots = 60;
        const startIndex = Math.max(0, entries.length - maxDots);
        const visible = entries.slice(startIndex);
        let highlightIndex = firstFailureIndex;
        if (highlightIndex < startIndex) {
          highlightIndex = -1;
          for (let index = startIndex; index < entries.length; index += 1) {
            if (isEntryFailure(entries[index])) {
              highlightIndex = index;
              break;
            }
          }
        }
        const fragment = document.createDocumentFragment();
        visible.forEach((entry, index) => {
          const absoluteIndex = startIndex + index;
          const dot = document.createElement('span');
          dot.className = 'debug-heartbeat-dot';
          dot.dataset.severity = getEntrySeverity(entry);
          const timestampSource = entry?.last_seen || entry?.first_seen || entry?.timestamp || entry?.time;
          const formattedTime = formatTimestamp(timestampSource);
          const eventType = normalizeCorrelationValue(entry?.event_type || entry?.logger || entry?.category);
          const messageSource =
            typeof entry?.message === 'string'
              ? entry.message
              : entry?.message != null
              ? String(entry.message)
              : '';
          const messageSnippet = messageSource ? messageSource.slice(0, 80) : '';
          const parts = [formattedTime, eventType, messageSnippet].filter(Boolean);
          if (parts.length) {
            dot.title = parts.join(' · ');
          }
          if (absoluteIndex === highlightIndex) {
            dot.classList.add('is-failure');
          }
          fragment.appendChild(dot);
        });
        track.appendChild(fragment);
      }

      function renderDebugLogs() {
        if (!dom.debugLog) {
          return;
        }
        ensureDebugPlaceholder();
        const entries = Array.isArray(state.debug.entries)
          ? filterRecentDebugEntries(state.debug.entries)
          : [];
        state.debug.entries = entries;
        const filtered = applyDebugFilters(entries);
        const firstFailureIndex = filtered.findIndex((entry) => isEntryFailure(entry));
        renderDebugHeartbeat(filtered, firstFailureIndex);
        const container = dom.debugLog;
        const existing = Array.from(container.children).filter((child) => child !== dom.debugEmpty);
        existing.forEach((child) => {
          container.removeChild(child);
        });
        const hasServerEntries = Array.isArray(state.debug.serverEntries)
          ? state.debug.serverEntries.length > 0
          : false;
        const hasTaskEntries = Array.isArray(state.debug.tasks)
          ? state.debug.tasks.length > 0
          : false;
        if (!filtered.length) {
          if (dom.debugEmpty) {
            if (hasActiveFilters()) {
              dom.debugEmpty.textContent = FILTERED_DEBUG_EMPTY_TEXT;
              dom.debugEmpty.hidden = false;
            } else {
              dom.debugEmpty.textContent = DEFAULT_DEBUG_EMPTY_TEXT;
              dom.debugEmpty.hidden = hasServerEntries || hasTaskEntries;
            }
          }
          if (state.debug.autoScroll) {
            container.scrollTop = container.scrollHeight;
          }
          return;
        }

        if (dom.debugEmpty) {
          dom.debugEmpty.textContent = DEFAULT_DEBUG_EMPTY_TEXT;
          dom.debugEmpty.hidden = true;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach((entry, index) => {
          fragment.appendChild(
            buildDebugLogEntry(entry, { isFirstFailure: index === firstFailureIndex }),
          );
        });
        container.appendChild(fragment);

        if (state.debug.autoScroll) {
          container.scrollTop = container.scrollHeight;
        }
      }

      function setDebugFilter(field, value) {
        const filters = state.debug.filters || {
          severity: 'all',
          category: 'all',
          correlationId: '',
          taskId: '',
          query: '',
        };
        let next = typeof value === 'string' ? value.trim() : '';
        if ((field === 'severity' || field === 'category') && !next) {
          next = 'all';
        }
        if (filters[field] === next) {
          return;
        }
        state.debug.filters = {
          ...filters,
          [field]: next,
        };
        renderDebugLogs();
      }

      function normalizeServerEntry(entry) {
        if (entry == null) {
          return null;
        }
        if (typeof entry === 'string') {
          return {
            id: `server-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            category: SERVER_LOG_CATEGORY,
            severity: 'info',
            event_type: 'server',
            timestamp: new Date().toISOString(),
            message: entry,
            context: {},
            payload: {},
          };
        }
        if (typeof entry !== 'object') {
          return null;
        }
        const message =
          typeof entry.message === 'string' && entry.message
            ? entry.message
            : typeof entry.rendered === 'string'
            ? entry.rendered
            : '';
        const timestamp =
          entry.last_seen ||
          entry.first_seen ||
          entry.timestamp ||
          entry.time ||
          entry.created_at ||
          '';
        return {
          id:
            entry.id != null
              ? `server-${entry.id}`
              : `server-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          category: normalizeFilterValue(entry.category) || SERVER_LOG_CATEGORY,
          severity: getEntrySeverity(entry),
          event_type: entry.event_type || entry.logger || 'server',
          timestamp,
          message,
          context: typeof entry.context === 'object' && entry.context ? entry.context : {},
          payload: typeof entry.payload === 'object' && entry.payload ? entry.payload : {},
          error: entry.error,
          stack: entry.stack,
        };
      }

      function normalizeTaskEntry(entry) {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const payload = typeof entry.payload === 'object' && entry.payload ? entry.payload : {};
        const rawTaskId =
          payload.task_id ||
          entry.task_id ||
          entry.taskId ||
          payload.job_id ||
          entry.id;
        const taskId = normalizeCorrelationValue(rawTaskId) || `task-${Date.now()}`;
        const statusValue = payload.status || payload.phase || entry.status || entry.level || '';
        const normalizedStatus = normalizeFilterValue(statusValue);
        let severity = getEntrySeverity(entry);
        if (normalizedStatus === 'failed' || normalizedStatus === 'failure' || normalizedStatus === 'error') {
          severity = 'error';
        } else if (normalizedStatus === 'warning' || normalizedStatus === 'warn') {
          severity = 'warning';
        }
        const timestamp =
          payload.updated_at ||
          payload.completed_at ||
          payload.started_at ||
          entry.last_seen ||
          entry.timestamp ||
          entry.time ||
          entry.created_at ||
          '';
        const message =
          payload.message ||
          payload.step ||
          entry.message ||
          entry.rendered ||
          '';
        const context = {
          status: statusValue || '',
          phase: payload.phase || '',
          task_id: taskId,
          lecture_id: payload.lecture_id || '',
        };
        const updatedAt = (() => {
          const candidate = Date.parse(timestamp || '');
          if (!Number.isNaN(candidate)) {
            return candidate;
          }
          return Date.now();
        })();
        const normalized = {
          id: taskId,
          taskId,
          category: 'task',
          severity,
          status: statusValue || '',
          event_type: payload.operation || entry.event_type || 'task',
          timestamp,
          message,
          context,
          payload,
          updatedAt,
        };
        if (payload.error || entry.error) {
          normalized.error = payload.error || entry.error;
        }
        if (entry.exception) {
          normalized.exception = entry.exception;
        }
        return normalized;
      }

      function getDebugEntryTimestamp(entry) {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const sources = [
          entry.updatedAt,
          entry.timestamp,
          entry.last_seen,
          entry.first_seen,
          entry.time,
          entry.created_at,
        ];
        for (let index = 0; index < sources.length; index += 1) {
          const value = sources[index];
          if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
          }
          if (typeof value === 'string' && value) {
            const parsed = Date.parse(value);
            if (!Number.isNaN(parsed)) {
              return parsed;
            }
          }
        }
        return null;
      }

      function filterRecentDebugEntries(entries) {
        const retention = Math.max(0, state.debug.retentionMs || DEBUG_RETENTION_MS);
        if (!Array.isArray(entries)) {
          return [];
        }
        if (retention <= 0) {
          return entries.slice();
        }
        const cutoff = Date.now() - retention;
        return entries.filter((entry) => {
          const timestamp = getDebugEntryTimestamp(entry);
          return timestamp === null || timestamp >= cutoff;
        });
      }

      function mergeDebugEntries(existing, incoming) {
        const merged = new Map();
        const append = (collection) => {
          if (!Array.isArray(collection)) {
            return;
          }
          collection.forEach((entry) => {
            if (!entry || typeof entry !== 'object') {
              return;
            }
            const key = entry.id != null ? String(entry.id) : `anon-${merged.size}`;
            merged.set(key, entry);
          });
        };
        append(existing);
        append(incoming);
        return Array.from(merged.values());
      }

      function sortDebugEntries(entries) {
        if (!Array.isArray(entries)) {
          return [];
        }
        return entries
          .slice()
          .sort((a, b) => {
            const timeA = getDebugEntryTimestamp(a);
            const timeB = getDebugEntryTimestamp(b);
            if (timeA !== null && timeB !== null && timeA !== timeB) {
              return timeA - timeB;
            }
            const idA = a && a.id != null ? String(a.id) : '';
            const idB = b && b.id != null ? String(b.id) : '';
            return idA.localeCompare(idB);
          });
      }

      function updateDebugStatus(message) {
        if (!dom.debugStatus) {
          return;
        }
        if (message) {
          dom.debugStatus.hidden = false;
          dom.debugStatus.textContent = message;
        } else {
          dom.debugStatus.hidden = true;
          dom.debugStatus.textContent = '';
        }
      }

      function updateServerStream(serverEntries, taskEntries, { reset = false } = {}) {
        const normalizedServerEntries = Array.isArray(serverEntries)
          ? serverEntries.map((entry) => normalizeServerEntry(entry)).filter(Boolean)
          : [];
        const normalizedTaskEntries = Array.isArray(taskEntries)
          ? taskEntries.map((entry) => normalizeTaskEntry(entry)).filter(Boolean)
          : [];

        const existingServerEntries = !reset && Array.isArray(state.debug.serverEntries)
          ? state.debug.serverEntries
          : [];
        const existingTasks = !reset && Array.isArray(state.debug.tasks)
          ? state.debug.tasks
          : [];

        const mergedServerEntries = mergeDebugEntries(
          existingServerEntries,
          normalizedServerEntries,
        );
        const mergedTaskEntries = mergeDebugEntries(existingTasks, normalizedTaskEntries);

        state.debug.serverEntries = sortDebugEntries(
          filterRecentDebugEntries(mergedServerEntries),
        );
        state.debug.tasks = sortDebugEntries(filterRecentDebugEntries(mergedTaskEntries));

        if (!dom.debugStreamEntries) {
          return;
        }

        const hasTasks = state.debug.tasks.length > 0;
        const hasServerMessages = state.debug.serverEntries.length > 0;

        dom.debugStreamEntries.innerHTML = '';
        if (!hasTasks && !hasServerMessages) {
          if (dom.debugStreamEmpty) {
            dom.debugStreamEmpty.hidden = false;
            dom.debugStreamEntries.appendChild(dom.debugStreamEmpty);
          }
          return;
        }

        if (dom.debugStreamEmpty) {
          dom.debugStreamEmpty.hidden = true;
        }

        const fragment = document.createDocumentFragment();
        state.debug.tasks.forEach((task) => {
          fragment.appendChild(buildDebugStreamEntry(task));
        });
        state.debug.serverEntries.forEach((entry) => {
          fragment.appendChild(buildDebugStreamEntry(entry));
        });
        dom.debugStreamEntries.appendChild(fragment);
      }

        function appendDebugLogs(entries, { reset = false } = {}) {
          if (!dom.debugLog) {
            return;
          }
          const list = Array.isArray(entries) ? entries : [];
          const serverLogs = [];
          const taskLogs = [];
        const regularLogs = [];
        list.forEach((entry) => {
          if (!entry || typeof entry !== 'object') {
            return;
          }
          if (entry.category === SERVER_LOG_CATEGORY) {
            serverLogs.push(entry);
            return;
          }
          if (entry.category === 'task') {
            taskLogs.push(entry);
            return;
          }
          regularLogs.push(entry);
        });

        updateServerStream(serverLogs, taskLogs, { reset });
        const baseEntries =
          !reset && Array.isArray(state.debug.entries) ? state.debug.entries : [];
        const mergedEntries = mergeDebugEntries(baseEntries, regularLogs);
        state.debug.entries = sortDebugEntries(filterRecentDebugEntries(mergedEntries));

        renderDebugLogs();
      }

      function scheduleDebugAck(latestId) {
        const target = Number(latestId);
        if (!state.debug.enabled || !Number.isFinite(target) || target <= 0) {
          return;
        }
        state.debug.pendingAck = Math.max(state.debug.pendingAck || 0, target);
        if (state.debug.ackTimer !== null) {
          return;
        }
        state.debug.ackTimer = window.setTimeout(() => {
          void flushDebugAck();
        }, DEBUG_ACK_DEBOUNCE_MS);
      }

      async function flushDebugAck() {
        if (state.debug.ackTimer !== null) {
          window.clearTimeout(state.debug.ackTimer);
          state.debug.ackTimer = null;
        }
        const lastId = Number(state.debug.pendingAck);
        if (!state.debug.enabled || !Number.isFinite(lastId) || lastId <= 0) {
          return;
        }
        try {
          await request('/api/debug/logs/ack', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ last_id: lastId }),
          });
          state.debug.pendingAck = 0;
        } catch (error) {
          console.warn('Failed to acknowledge debug logs', error);
          scheduleDebugAck(lastId);
        }
      }

      function disconnectDebugStream() {
        const source = state.debug.streamSource;
        if (!source) {
          return;
        }
        try {
          source.removeEventListener('open', handleDebugStreamOpen);
          source.removeEventListener('error', handleDebugStreamError);
          source.removeEventListener('message', handleDebugStreamMessage);
          source.close();
        } catch (error) {
          // Ignore close errors.
        }
        state.debug.streamSource = null;
      }

      function handleDebugStreamOpen() {
        state.debug.connecting = false;
        if (state.debug.streamRetryTimer !== null) {
          window.clearTimeout(state.debug.streamRetryTimer);
          state.debug.streamRetryTimer = null;
        }
        updateDebugStatus('');
      }

      function handleDebugStreamMessage(event) {
        if (!event || typeof event.data !== 'string') {
          return;
        }
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch (error) {
          console.warn('Failed to parse debug stream payload', error);
          return;
        }

        const reset = Boolean(payload?.reset);
        const logs = Array.isArray(payload?.logs) ? payload.logs : [];
        appendDebugLogs(logs, { reset });

        if (typeof payload?.enabled === 'boolean') {
          state.debug.enabled = payload.enabled;
        }

        const nextId = Number(payload?.next || 0);
        if (Number.isFinite(nextId) && nextId > 0) {
          state.debug.lastId = nextId;
          scheduleDebugAck(nextId);
        }

        state.debug.connecting = false;
        updateDebugStatus('');
      }

      function handleDebugStreamError() {
        if (!state.debug.enabled) {
          return;
        }
        disconnectDebugStream();
        updateDebugStatus(t('debug.stream.disconnected'));
        if (state.debug.streamRetryTimer !== null) {
          return;
        }
        state.debug.streamRetryTimer = window.setTimeout(() => {
          state.debug.streamRetryTimer = null;
          connectDebugStream({ after: state.debug.lastId || 0 });
        }, DEBUG_STREAM_RETRY_DELAY_MS);
      }

      function connectDebugStream({ after = 0 } = {}) {
        if (!state.debug.enabled) {
          return;
        }
        disconnectDebugStream();
        state.debug.connecting = true;
        updateDebugStatus(t('debug.stream.connecting'));
        try {
          const baseUrl = resolveAppUrl('/api/debug/logs/stream');
          const url = new URL(baseUrl, window.location.origin);
          if (after > 0) {
            url.searchParams.set('after', String(after));
          }
          const source = new EventSource(url.toString());
          state.debug.streamSource = source;
          source.addEventListener('open', handleDebugStreamOpen);
          source.addEventListener('error', handleDebugStreamError);
          source.addEventListener('message', handleDebugStreamMessage);
        } catch (error) {
          console.warn('Failed to start debug stream', error);
          updateDebugStatus(t('debug.error'));
        }
      }

      function startLegacyDebugPolling() {
        fetchDebugLogs(state.debug.lastId === 0);
        state.debug.timer = window.setInterval(() => {
          fetchDebugLogs(false);
        }, LEGACY_DEBUG_POLL_INTERVAL_MS);
      }

      async function handleExportClick(event) {
        event?.preventDefault?.();
        if (!dom.debugExport) {
          return;
        }
        const button = dom.debugExport;
        if (button.disabled) {
          return;
        }
        button.disabled = true;
        try {
          const response = await fetch(resolveAppUrl('/api/debug/logs/export'));
          if (!response.ok) {
            const detail = await response.text();
            throw new Error(detail || t('debug.error'));
          }
          const blob = await response.blob();
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `lecture-tools-debug-${timestamp}.json`;
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = url;
          anchor.download = filename;
          document.body.appendChild(anchor);
          anchor.click();
          anchor.remove();
          window.setTimeout(() => {
            URL.revokeObjectURL(url);
          }, 2000);
          updateDebugStatus(t('debug.exportSuccess'));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error || '');
          updateDebugStatus(t('debug.exportError', { message }));
        } finally {
          button.disabled = false;
        }
      }

        async function fetchDebugLogs(reset = false) {
          if (!state.debug.enabled || state.debug.pending) {
            return;
          }
          state.debug.pending = true;
          try {
            let url = '/api/debug/logs';
            if (!reset && state.debug.lastId) {
              url += `?after=${encodeURIComponent(state.debug.lastId)}`;
            }
            const payload = await request(url);
            const logs = Array.isArray(payload?.logs) ? payload.logs : [];
            appendDebugLogs(logs, { reset });
            if (typeof payload?.next === 'number') {
              state.debug.lastId = payload.next;
            } else if (logs.length) {
              const lastEntry = logs[logs.length - 1];
              if (lastEntry && typeof lastEntry.id === 'number') {
                state.debug.lastId = lastEntry.id;
              }
            }
            scheduleDebugAck(state.debug.lastId);
            if (typeof window.EventSource !== 'undefined') {
              updateDebugStatus('');
            }
          } catch (error) {
            const base = t('debug.error');
            const detail = error instanceof Error ? error.message : String(error || '');
            updateDebugStatus(detail ? `${base} ${detail}` : base);
          } finally {
            state.debug.pending = false;
          }
        }

        function startDebugPolling() {
          stopDebugPolling();
          if (!state.debug.enabled) {
            return;
          }
          if (typeof window.EventSource === 'undefined') {
            updateDebugStatus(t('debug.stream.unsupported'));
            startLegacyDebugPolling();
            return;
          }
          connectDebugStream({ after: state.debug.lastId || 0 });
        }

        function stopDebugPolling() {
          if (state.debug.timer) {
            window.clearInterval(state.debug.timer);
            state.debug.timer = null;
          }
          if (state.debug.streamRetryTimer !== null) {
            window.clearTimeout(state.debug.streamRetryTimer);
            state.debug.streamRetryTimer = null;
          }
          if (state.debug.ackTimer !== null) {
            window.clearTimeout(state.debug.ackTimer);
            state.debug.ackTimer = null;
          }
          state.debug.pendingAck = 0;
          state.debug.pending = false;
          state.debug.connecting = false;
          disconnectDebugStream();
        }

        function setDebugMode(enabled) {
          const active = Boolean(enabled);
          if (state.debug.enabled === active) {
            document.body.classList.toggle('debug-enabled', active);
            if (dom.debugPane) {
              dom.debugPane.hidden = !active;
            }
            if (
              active &&
              state.debug.timer === null &&
              state.debug.streamSource === null
            ) {
              debugStore.activate();
              startDebugPolling();
            } else if (!active) {
              debugStore.deactivate();
            }
            return;
          }

          state.debug.enabled = active;
          document.body.classList.toggle('debug-enabled', active);
          if (dom.debugPane) {
            dom.debugPane.hidden = !active;
          }

          if (active) {
            debugStore.activate();
            state.debug.lastId = 0;
            state.debug.autoScroll = true;
            state.debug.pending = false;
            state.debug.pendingAck = 0;
            state.debug.streamRetryTimer = null;
            state.debug.ackTimer = null;
            state.debug.timer = null;
            disconnectDebugStream();
            appendDebugLogs([], { reset: true });
            updateDebugStatus(t('debug.stream.connecting'));
            startDebugPolling();
          } else {
            stopDebugPolling();
            debugStore.deactivate();
            updateDebugStatus('');
            updateServerStream([], [], { reset: true });
            state.debug.entries = [];
            renderDebugLogs();
            if (dom.debugEmpty) {
              ensureDebugPlaceholder();
              dom.debugEmpty.hidden = false;
            }
          }
        }

        const dialogState = { active: false, uploadActive: false };

        let pdfjsLibPromise = null;

        function loadPdfjsLib() {
          if (window.pdfjsLib) {
            return Promise.resolve(window.pdfjsLib);
          }
          if (pdfjsLibPromise) {
            return pdfjsLibPromise;
          }

          const scriptUrl = window.__LECTURE_TOOLS_PDFJS_SCRIPT_URL__;
          if (typeof scriptUrl !== 'string' || !scriptUrl) {
            return Promise.reject(new Error('PDF.js script URL not configured.'));
          }

          const existingScript = document.querySelector('script[data-pdfjs-loader="true"]');
          if (existingScript && !window.pdfjsLib) {
            pdfjsLibPromise = new Promise((resolve, reject) => {
              const handleLoad = () => {
                if (window.pdfjsLib) {
                  try {
                    const workerUrl = window.__LECTURE_TOOLS_PDFJS_WORKER_URL__;
                    if (workerUrl) {
                      window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                    }
                  } catch (workerError) {
                    console.warn('Unable to configure PDF.js worker', workerError);
                  }
                  resolve(window.pdfjsLib);
                } else {
                  reject(new Error('PDF.js did not expose pdfjsLib.'));
                }
              };
              existingScript.addEventListener('load', handleLoad, { once: true });
              existingScript.addEventListener(
                'error',
                () => reject(new Error('Failed to load PDF.js script.')),
                { once: true },
              );
            }).catch((error) => {
              pdfjsLibPromise = null;
              throw error;
            });
            return pdfjsLibPromise;
          }

          pdfjsLibPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.async = true;
            script.dataset.pdfjsLoader = 'true';
            script.onload = () => {
              if (window.pdfjsLib) {
                try {
                  const workerUrl = window.__LECTURE_TOOLS_PDFJS_WORKER_URL__;
                  if (workerUrl) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                  }
                } catch (workerError) {
                  console.warn('Unable to configure PDF.js worker', workerError);
                }
                resolve(window.pdfjsLib);
              } else {
                reject(new Error('PDF.js did not expose pdfjsLib.'));
              }
            };
            script.onerror = () => {
              reject(new Error('Failed to load PDF.js script.'));
            };
            document.head.appendChild(script);
          }).catch((error) => {
            pdfjsLibPromise = null;
            throw error;
          });

          return pdfjsLibPromise;
        }

        async function extractPdfPageCountFromBlob(blob) {
          if (!(blob instanceof Blob)) {
            return null;
          }
          try {
            const pdfjs = await loadPdfjsLib();
            const data = await blob.arrayBuffer();
            const loadingTask = pdfjs.getDocument({ data });
            try {
              const pdfDocument = await loadingTask.promise;
              const totalPages = pdfDocument?.numPages;
              if (typeof pdfDocument?.destroy === 'function') {
                try {
                  await pdfDocument.destroy();
                } catch (destroyError) {
                  console.warn('Failed to destroy PDF document', destroyError);
                }
              }
              if (Number.isFinite(totalPages) && totalPages > 0) {
                return Math.round(totalPages);
              }
            } finally {
              if (typeof loadingTask.destroy === 'function') {
                try {
                  await loadingTask.destroy();
                } catch (taskError) {
                  // Ignore cleanup failures.
                }
              }
            }
          } catch (error) {
            console.warn('Failed to read PDF page count from blob', error);
          }
          return null;
        }

        async function extractPdfPageCountFromUrl(url, { withCredentials = false } = {}) {
          if (typeof url !== 'string' || !url) {
            return null;
          }
          try {
            const pdfjs = await loadPdfjsLib();
            const loadingTask = pdfjs.getDocument({ url, withCredentials });
            try {
              const pdfDocument = await loadingTask.promise;
              const totalPages = pdfDocument?.numPages;
              if (typeof pdfDocument?.destroy === 'function') {
                try {
                  await pdfDocument.destroy();
                } catch (destroyError) {
                  console.warn('Failed to destroy PDF document', destroyError);
                }
              }
              if (Number.isFinite(totalPages) && totalPages > 0) {
                return Math.round(totalPages);
              }
            } finally {
              if (typeof loadingTask.destroy === 'function') {
                try {
                  await loadingTask.destroy();
                } catch (taskError) {
                  // Ignore cleanup failures.
                }
              }
            }
          } catch (error) {
            console.warn('Failed to read PDF page count from URL', error);
          }
          return null;
        }

        function showPendingOverlay(message = '') {
          const pending = dom.pendingDialog;
          if (!pending || !pending.root) {
            return;
          }
          if (pending.message) {
            pending.message.textContent = message || '';
          }
          pending.root.classList.remove('hidden');
          pending.root.setAttribute('aria-hidden', 'false');
        }

        function hidePendingOverlay() {
          const pending = dom.pendingDialog;
          if (!pending || !pending.root) {
            return;
          }
          pending.root.classList.add('hidden');
          pending.root.setAttribute('aria-hidden', 'true');
          if (pending.message) {
            pending.message.textContent = '';
          }
        }


        async function syncSettingsForm(settings) {
          const themeValue = settings?.theme ?? 'system';
          const languageValue = normalizeLanguage(settings?.language);
          const requestedModel = normalizeWhisperModel(settings?.whisper_model);
          const computeRaw = settings?.whisper_compute_type ?? 'int8';
          const computeValue =
            typeof computeRaw === 'string' ? computeRaw.trim() || 'int8' : 'int8';
          const beamNumber = Math.max(
            1,
            Math.min(10, Number(settings?.whisper_beam_size) || 5),
          );
          const dpiValue = normalizeSlideDpi(settings?.slide_dpi);
          const masteringEnabled = settings?.audio_mastering_enabled !== false;
          const debugEnabled = Boolean(settings?.debug_enabled);

          const effectiveModel =
            requestedModel === GPU_MODEL && !state.gpuWhisper.supported
              ? DEFAULT_WHISPER_MODEL
              : requestedModel;

          dom.settingsTheme.value = themeValue;
          dom.settingsLanguage.value = languageValue;
          dom.settingsWhisperModel.value = effectiveModel;
          dom.settingsWhisperCompute.value = computeValue;
          dom.settingsWhisperBeam.value = String(beamNumber);
          dom.settingsSlideDpi.value = dpiValue;
          if (dom.settingsAudioMastering) {
            dom.settingsAudioMastering.checked = masteringEnabled;
          }
          if (dom.settingsDebugEnabled) {
            dom.settingsDebugEnabled.checked = debugEnabled;
          }
          setTranscribeModelValue(effectiveModel);

          state.settings = {
            theme: themeValue,
            language: languageValue,
            whisper_model: effectiveModel,
            whisper_model_requested: requestedModel,
            whisper_compute_type: computeValue,
            whisper_beam_size: beamNumber,
            slide_dpi: Number(dpiValue),
            audio_mastering_enabled: masteringEnabled,
            debug_enabled: debugEnabled,
          };

          applyTheme(themeValue);
          updateGpuWhisperUI({ ...state.gpuWhisper });
          await applyTranslations(languageValue);
          renderStorage();
          updateEditModeUI();
          setDebugMode(debugEnabled);
        }

        function showDialog({
          title = '',
          message = '',
          confirmText = t('dialog.confirm'),
          cancelText = t('dialog.cancel'),
          variant = 'primary',
          input = false,
          placeholder = '',
          defaultValue = '',
          required = false,
        } = {}) {
          return new Promise((resolve) => {
            const dialog = dom.dialog;
            if (!dialog.root || dialogState.active || dialogState.uploadActive) {
              resolve({ confirmed: false, value: null });
              return;
            }

            dialogState.active = true;
            const previousActive =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            const requireValue = Boolean(required && input);
            const variantClass = variant === 'danger' ? 'danger' : 'primary';

            dialog.title.textContent = title || '';
            dialog.message.textContent = message || '';
            dialog.message.style.display = message ? 'block' : 'none';

            if (input) {
              dialog.inputWrapper.classList.remove('hidden');
              dialog.input.value = defaultValue ?? '';
              dialog.input.placeholder = placeholder ?? '';
            } else {
              dialog.inputWrapper.classList.add('hidden');
              dialog.input.value = '';
              dialog.input.placeholder = '';
            }

            dialog.confirm.textContent = confirmText;
            dialog.cancel.textContent = cancelText;
            dialog.confirm.classList.remove('primary', 'danger');
            dialog.confirm.classList.add(variantClass);
            dialog.confirm.disabled = false;

            const focusOrder = [];
            if (input) {
              focusOrder.push(dialog.input);
            }
            focusOrder.push(dialog.cancel, dialog.confirm);

            function updateConfirmState() {
              if (!requireValue) {
                dialog.confirm.disabled = false;
                return;
              }
              dialog.confirm.disabled = dialog.input.value.trim().length === 0;
            }

            function cleanup() {
              dialog.confirm.removeEventListener('click', handleConfirm);
              dialog.cancel.removeEventListener('click', handleCancel);
              dialog.backdrop.removeEventListener('click', handleCancel);
              dialog.window.removeEventListener('keydown', handleKeyDown);
              if (input) {
                dialog.input.removeEventListener('input', updateConfirmState);
              }
              dialog.root.classList.add('hidden');
              dialog.root.setAttribute('aria-hidden', 'true');
              document.body.classList.remove('dialog-open');
              dialogState.active = false;
              if (previousActive) {
                previousActive.focus({ preventScroll: true });
              }
            }

            function resolveAndClose(result) {
              cleanup();
              resolve(result);
            }

            function handleConfirm(event) {
              event.preventDefault();
              if (dialog.confirm.disabled) {
                return;
              }
              const value = input ? dialog.input.value : null;
              resolveAndClose({ confirmed: true, value });
            }

            function handleCancel(event) {
              event.preventDefault();
              resolveAndClose({ confirmed: false, value: null });
            }

            function handleKeyDown(event) {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel(event);
                return;
              }
              if (event.key === 'Enter') {
                if (input) {
                  if (requireValue && dialog.input.value.trim().length === 0) {
                    return;
                  }
                  if (document.activeElement !== dialog.cancel) {
                    event.preventDefault();
                    handleConfirm(event);
                  }
                } else if (
                  document.activeElement !== dialog.confirm &&
                  document.activeElement !== dialog.cancel
                ) {
                  event.preventDefault();
                  handleConfirm(event);
                }
                return;
              }
              if (event.key === 'Tab') {
                const focusable = focusOrder.filter(
                  (element) => element instanceof HTMLElement && !element.disabled,
                );
                if (!focusable.length) {
                  return;
                }
                const currentIndex = focusable.indexOf(document.activeElement);
                if (event.shiftKey) {
                  const previousIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1;
                  focusable[previousIndex].focus();
                } else {
                  const nextIndex = currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;
                  focusable[nextIndex].focus();
                }
                event.preventDefault();
              }
            }

            dialog.confirm.addEventListener('click', handleConfirm);
            dialog.cancel.addEventListener('click', handleCancel);
            dialog.backdrop.addEventListener('click', handleCancel);
            dialog.window.addEventListener('keydown', handleKeyDown);
            if (input) {
              dialog.input.addEventListener('input', updateConfirmState);
            }

            dialog.root.classList.remove('hidden');
            dialog.root.setAttribute('aria-hidden', 'false');
            document.body.classList.add('dialog-open');
            updateConfirmState();

            const initialFocus = input ? dialog.input : dialog.confirm;
            window.requestAnimationFrame(() => {
              initialFocus.focus({ preventScroll: true });
              if (input) {
                const valueLength = dialog.input.value.length;
                dialog.input.setSelectionRange(valueLength, valueLength);
              }
            });
          });
        }

        async function confirmDialog(options = {}) {
          const result = await showDialog({ ...options, input: false });
          return Boolean(result.confirmed);
        }

        async function promptDialog(options = {}) {
          const result = await showDialog({ ...options, input: true });
          if (!result.confirmed) {
            return null;
          }
          return typeof result.value === 'string' ? result.value : '';
        }

        async function showUploadDialog(options = {}) {
          return new Promise((resolve) => {
            const dialog = dom.uploadDialog;
            if (!dialog || !dialog.root || dialogState.uploadActive) {
              resolve({ confirmed: false, uploaded: false, file: null, result: null, meta: null });
              return;
            }

            dialogState.uploadActive = true;
            let closed = false;
            let selectedFile = null;
            let selectedMeta = null;
            let selectedCleanup = null;
            let selecting = false;
            let uploading = false;
            let uploadComplete = false;
            let uploadResult = null;
            let uploadStage = 'idle';
            let processingInBackground = false;
            let autoCloseOnComplete = false;

            const allowBackgroundProcessing = options.allowBackgroundProcessing === true;
            const enableProcessingStage = options.enableProcessingStage !== false;
            const backgroundProcessingMessage =
              typeof options.backgroundProcessing === 'string' ? options.backgroundProcessing : '';

            const actionLabelCandidate =
              options.uploadLabel ||
              t('dialogs.upload.action') ||
              t('common.actions.upload');
            const labels = {
              title: options.title || t('dialogs.upload.title'),
              description: options.description || t('dialogs.upload.description'),
              prompt: options.prompt || t('dialogs.upload.prompt'),
              help: options.help || t('dialogs.upload.help'),
              browse: options.browseLabel || t('dialogs.upload.browse'),
              clear: options.clearLabel || t('dialogs.upload.clear'),
              waiting: options.waiting || t('dialogs.upload.waiting'),
              preparing: options.preparing || t('dialogs.upload.preparing'),
              uploading: options.uploading || t('dialogs.upload.uploading'),
              processing: options.processing || t('dialogs.upload.processing'),
              processingAction:
                options.processingAction || t('dialogs.upload.processingAction'),
              backgroundProcessing:
                backgroundProcessingMessage || t('dialogs.upload.backgroundProcessing'),
              success: options.success || t('dialogs.upload.success'),
              failure: options.failure || t('dialogs.upload.failure'),
              progress: options.progressLabel || t('dialogs.upload.progress'),
              action: actionLabelCandidate || 'Upload',
              close: options.closeLabel || t('common.actions.close') || 'Close',
            };

            const accept = typeof options.accept === 'string' ? options.accept : '';
            const uploadHandler = typeof options.onUpload === 'function' ? options.onUpload : null;
            const fileSelectedHandler =
              typeof options.onFileSelected === 'function' ? options.onFileSelected : null;

            const previousActive =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;

            function cleanup() {
              closed = true;
              if (dialog.confirm) {
                dialog.confirm.removeEventListener('click', handleConfirm);
              }
              if (dialog.cancel) {
                dialog.cancel.removeEventListener('click', handleCancel);
              }
              if (dialog.backdrop) {
                dialog.backdrop.removeEventListener('click', handleCancel);
              }
              if (dialog.window) {
                dialog.window.removeEventListener('keydown', handleKeyDown);
              }
              if (dialog.dropzone) {
                dialog.dropzone.removeEventListener('click', handleBrowseClick);
                dialog.dropzone.removeEventListener('keydown', handleDropzoneKeyDown);
                dialog.dropzone.removeEventListener('dragover', handleDragOver);
                dialog.dropzone.removeEventListener('dragleave', handleDragLeave);
                dialog.dropzone.removeEventListener('drop', handleDrop);
              }
              if (dialog.browse) {
                dialog.browse.removeEventListener('click', handleBrowseClick);
                dialog.browse.removeEventListener('keydown', handleDropzoneKeyDown);
              }
              if (dialog.input) {
                dialog.input.removeEventListener('change', handleInputChange);
              }
              if (dialog.clear) {
                dialog.clear.removeEventListener('click', handleClearSelection);
              }
              resetProgress();
              setStatus('');
              if (dialog.fileInfo) {
                dialog.fileInfo.classList.add('hidden');
              }
              if (dialog.fileName) {
                dialog.fileName.textContent = '';
              }
              if (dialog.fileSize) {
                dialog.fileSize.textContent = '';
              }
              if (dialog.dropzone) {
                dialog.dropzone.classList.remove('active');
              }
              if (dialog.input) {
                dialog.input.value = '';
              }
              if (dialog.root) {
                dialog.root.classList.add('hidden');
                dialog.root.classList.remove('upload-dialog-hidden');
                dialog.root.setAttribute('aria-hidden', 'true');
              }
              document.body.classList.remove('dialog-open');
              dialogState.uploadActive = false;
              selectedCleanup = null;
              if (previousActive) {
                previousActive.focus({ preventScroll: true });
              }
            }

            async function resolveAndClose(payload) {
              if (!payload || payload.uploaded !== true) {
                await runSelectedCleanup();
              }
              cleanup();
              resolve(payload);
            }

            function setStatus(message, variant = '') {
              if (!dialog.status) {
                return;
              }
              dialog.status.classList.remove('error', 'success');
              if (variant) {
                dialog.status.classList.add(variant);
              }
              dialog.status.textContent = message || '';
            }

            function resetProgress() {
              if (dialog.progressContainer) {
                dialog.progressContainer.classList.add('hidden');
              }
              if (dialog.progressFill) {
                dialog.progressFill.style.width = '0%';
              }
              if (dialog.progressText) {
                dialog.progressText.textContent = '';
              }
              if (dialog.progress) {
                dialog.progress.setAttribute('aria-valuenow', '0');
                dialog.progress.setAttribute('aria-label', labels.progress);
              }
              uploadStage = 'idle';
              processingInBackground = false;
              autoCloseOnComplete = false;
            }

            function updateProgress(ratio) {
              const value = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
              const percent = Math.round(value * 100);
              if (dialog.progressContainer) {
                dialog.progressContainer.classList.remove('hidden');
              }
              if (dialog.progressFill) {
                dialog.progressFill.style.width = `${percent}%`;
              }
              if (dialog.progressText) {
                dialog.progressText.textContent = `${percent}%`;
              }
              if (dialog.progress) {
                dialog.progress.setAttribute('aria-valuenow', String(percent));
              }
              if (percent >= 100) {
                autoCloseOnComplete = true;
                if (uploading && uploadStage === 'uploading') {
                  setStatus(labels.success, 'success');
                }
              }
              if (
                enableProcessingStage &&
                labels.processing &&
                uploading &&
                uploadStage !== 'processing' &&
                percent >= 100 &&
                !autoCloseOnComplete
              ) {
                uploadStage = 'processing';
                if (allowBackgroundProcessing) {
                  enterProcessingStage();
                } else {
                  setStatus(labels.processing);
                  updateActionState();
                }
              }
            }

            function enterProcessingStage() {
              if (processingInBackground || !allowBackgroundProcessing) {
                return;
              }
              processingInBackground = true;
              const message = labels.backgroundProcessing || labels.processing || labels.uploading;
              setStatus(message, 'info');
              updateActionState();
            }

            function updateActionState() {
              if (!dialog.confirm) {
                return;
              }
              dialog.confirm.classList.remove('hidden');
              dialog.confirm.style.display = '';
              if (processingInBackground && allowBackgroundProcessing && uploading) {
                dialog.confirm.textContent = labels.close;
                dialog.confirm.disabled = false;
                if (dialog.cancel) {
                  dialog.cancel.textContent = labels.close;
                  dialog.cancel.disabled = false;
                }
                return;
              }
              if (uploading) {
                const buttonLabel =
                  uploadStage === 'processing'
                    ? labels.processingAction || labels.processing || labels.uploading
                    : labels.uploading;
                dialog.confirm.textContent = buttonLabel;
                dialog.confirm.disabled = true;
                if (dialog.cancel) {
                  dialog.cancel.textContent = t('dialog.cancel');
                  dialog.cancel.disabled = true;
                }
                return;
              }
              if (uploadComplete) {
                dialog.confirm.textContent = t('dialog.confirm');
                dialog.confirm.disabled = false;
                if (dialog.cancel) {
                  dialog.cancel.textContent = t('dialog.cancel');
                  dialog.cancel.disabled = false;
                }
                return;
              }
              const readyLabel =
                labels.action || t('dialogs.upload.action') || t('common.actions.upload') || 'Upload';
              dialog.confirm.textContent = readyLabel;
              dialog.confirm.disabled = !selectedFile || !uploadHandler;
              if (dialog.cancel) {
                dialog.cancel.textContent = t('dialog.cancel');
                dialog.cancel.disabled = false;
              }
            }

            async function runWithSuspendedDialog(task) {
              if (typeof task !== 'function') {
                return null;
              }
              const pendingMessage =
                t('dialogs.slideRange.loading') ||
                labels.processing ||
                labels.uploading ||
                'Preparing document…';
              showPendingOverlay(pendingMessage);
              if (dialog.root) {
                dialog.root.classList.add('upload-dialog-hidden');
                dialog.root.setAttribute('aria-hidden', 'true');
              }
              document.body.classList.remove('dialog-open');
              dialogState.uploadActive = false;
              try {
                return await task();
              } finally {
                hidePendingOverlay();
                if (!closed) {
                  dialogState.uploadActive = true;
                  if (dialog.root) {
                    dialog.root.classList.remove('upload-dialog-hidden');
                    dialog.root.classList.remove('hidden');
                    dialog.root.setAttribute('aria-hidden', 'false');
                  }
                  document.body.classList.add('dialog-open');
                  window.requestAnimationFrame(() => {
                    if (!closed && dialog.dropzone instanceof HTMLElement) {
                      dialog.dropzone.focus({ preventScroll: true });
                    }
                  });
                } else {
                  document.body.classList.remove('dialog-open');
                }
              }
            }

            async function runSelectedCleanup() {
              const cleanupFn = selectedCleanup;
              selectedCleanup = null;
              if (typeof cleanupFn !== 'function') {
                return;
              }
              try {
                await cleanupFn();
              } catch (error) {
                console.warn('Failed to clear upload selection metadata', error);
              }
            }

            async function setSelectedFile(file) {
              if (selecting) {
                return;
              }
              selecting = true;
              try {
                if (!file) {
                  await runSelectedCleanup();
                  selectedFile = null;
                  selectedMeta = null;
                  if (dialog.fileInfo) {
                    dialog.fileInfo.classList.add('hidden');
                  }
                  if (dialog.fileName) {
                    dialog.fileName.textContent = '';
                  }
                  if (dialog.fileSize) {
                    dialog.fileSize.textContent = '';
                  }
                  if (dialog.input) {
                    dialog.input.value = '';
                  }
                  resetProgress();
                  setStatus(labels.waiting);
                  uploadComplete = false;
                  updateActionState();
                  return;
                }

                if (selectedCleanup) {
                  await runSelectedCleanup();
                }

                let meta = null;
                let summary = '';
                let cleanupFn = null;
                if (fileSelectedHandler) {
                  setStatus(labels.preparing);
                  try {
                    const result = await runWithSuspendedDialog(() => fileSelectedHandler(file));
                    if (closed) {
                      return;
                    }
                    if (
                      result === false ||
                      (result && result.cancelled === true) ||
                      (result && result.confirmed === false)
                    ) {
                      if (dialog.input) {
                        dialog.input.value = '';
                      }
                      setStatus(labels.waiting);
                      uploadComplete = false;
                      selectedFile = null;
                      selectedMeta = null;
                      updateActionState();
                      return;
                    }
                    if (result && typeof result === 'object' && 'meta' in result) {
                      meta = result.meta;
                      if (typeof result.summary === 'string') {
                        summary = result.summary;
                      }
                      if (typeof result.cleanup === 'function') {
                        cleanupFn = result.cleanup;
                      } else {
                        cleanupFn = null;
                      }
                    } else if (result && typeof result === 'object') {
                      meta = result;
                      if (typeof result.cleanup === 'function') {
                        cleanupFn = result.cleanup;
                      } else {
                        cleanupFn = null;
                      }
                    }
                  } catch (error) {
                    const message =
                      error instanceof Error && error.message ? error.message : labels.failure;
                    setStatus(message, 'error');
                    uploadComplete = false;
                    selectedFile = null;
                    selectedMeta = null;
                    selectedCleanup = null;
                    updateActionState();
                    return;
                  }
                }

                selectedFile = file;
                selectedMeta = meta && typeof meta === 'object' ? meta : null;
                selectedCleanup = cleanupFn;
                if (dialog.fileInfo) {
                  dialog.fileInfo.classList.remove('hidden');
                }
                if (dialog.fileName) {
                  dialog.fileName.textContent = file.name;
                }
                if (dialog.fileSize) {
                  const sizeText =
                    typeof file.size === 'number' && Number.isFinite(file.size)
                      ? formatBytes(file.size)
                      : '';
                  dialog.fileSize.textContent = sizeText;
                }
                if (dialog.input) {
                  dialog.input.value = '';
                }
                uploadComplete = false;
                resetProgress();
                if (summary) {
                  setStatus(summary);
                } else {
                  setStatus(labels.waiting);
                }
                updateActionState();
              } finally {
                selecting = false;
              }
            }

            async function handleDrop(event) {
              event.preventDefault();
              if (dialog.dropzone) {
                dialog.dropzone.classList.remove('active');
              }
              const files = event.dataTransfer?.files;
              if (files && files.length > 0) {
                await setSelectedFile(files[0]);
              }
            }

            async function handleInputChange(event) {
              const files = event.target?.files;
              if (files && files.length > 0) {
                await setSelectedFile(files[0]);
              }
            }

            async function handleClearSelection(event) {
              event.preventDefault();
              await setSelectedFile(null);
            }

            function openFilePicker(input) {
              if (!input) {
                return;
              }
              try {
                if (typeof input.showPicker === 'function') {
                  input.showPicker();
                  return;
                }
              } catch (error) {
                // Ignore errors from showPicker to allow fallback behaviour.
              }
              try {
                input.click();
              } catch (error) {
                // Swallow blocked click attempts quietly for keyboard activation.
              }
            }

            function handleBrowseClick(event) {
              if (!dialog.input) {
                return;
              }
              if (typeof event?.detail === 'number' && event.detail > 0) {
                return;
              }
              event?.preventDefault?.();
              event?.stopPropagation?.();
              openFilePicker(dialog.input);
            }

            function handleDropzoneKeyDown(event) {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                handleBrowseClick(event);
              }
            }

            function handleDragOver(event) {
              event.preventDefault();
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = 'copy';
              }
              if (dialog.dropzone) {
                dialog.dropzone.classList.add('active');
              }
            }

            function handleDragLeave(event) {
              event.preventDefault();
              if (dialog.dropzone) {
                dialog.dropzone.classList.remove('active');
              }
            }

            async function performUpload() {
              if (!uploadHandler || !selectedFile || uploading) {
                return;
              }
              uploading = true;
              uploadComplete = false;
              resetProgress();
              uploadStage = 'uploading';
              updateActionState();
              setStatus(labels.uploading);
              try {
                const result = await uploadHandler(selectedFile, {
                  reportProgress: (ratio) => {
                    if (typeof ratio === 'number') {
                      updateProgress(ratio);
                    }
                  },
                  meta: selectedMeta,
                });
                uploadResult = result ?? null;
                uploadComplete = true;
                uploading = false;
                uploadStage = 'idle';
                processingInBackground = false;
                updateProgress(1);
                setStatus(labels.success, 'success');
                updateActionState();
                if (autoCloseOnComplete) {
                  autoCloseOnComplete = false;
                  void resolveAndClose({
                    confirmed: true,
                    uploaded: true,
                    file: selectedFile,
                    result: uploadResult,
                    meta: selectedMeta,
                  });
                  return;
                }
              } catch (error) {
                uploading = false;
                uploadComplete = false;
                uploadResult = null;
                uploadStage = 'idle';
                processingInBackground = false;
                autoCloseOnComplete = false;
                const message =
                  error instanceof Error && error.message ? error.message : labels.failure;
                setStatus(message, 'error');
                resetProgress();
                updateActionState();
              }
            }

            function getFocusableElements() {
              const elements = [];
              if (dialog.dropzone instanceof HTMLElement) {
                elements.push(dialog.dropzone);
              }
              if (
                dialog.fileInfo &&
                !dialog.fileInfo.classList.contains('hidden') &&
                dialog.clear instanceof HTMLElement
              ) {
                elements.push(dialog.clear);
              }
              if (dialog.cancel instanceof HTMLElement) {
                elements.push(dialog.cancel);
              }
              if (dialog.confirm instanceof HTMLElement) {
                elements.push(dialog.confirm);
              }
              return elements.filter((element) => !element.disabled);
            }

            function handleKeyDown(event) {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel(event);
                return;
              }
              if (event.key === 'Tab') {
                const focusable = getFocusableElements();
                if (!focusable.length) {
                  return;
                }
                const index = focusable.indexOf(document.activeElement);
                const nextIndex = event.shiftKey
                  ? index <= 0
                    ? focusable.length - 1
                    : index - 1
                  : index === focusable.length - 1
                  ? 0
                  : index + 1;
                focusable[nextIndex].focus();
                event.preventDefault();
              }
            }

            function handleConfirm(event) {
              event.preventDefault();
              if (processingInBackground && allowBackgroundProcessing && uploading) {
                void resolveAndClose({
                  confirmed: false,
                  uploaded: uploadComplete,
                  file: selectedFile,
                  result: uploadResult,
                  meta: selectedMeta,
                  processing: true,
                });
                return;
              }
              if (uploadComplete) {
                void resolveAndClose({
                  confirmed: true,
                  uploaded: true,
                  file: selectedFile,
                  result: uploadResult,
                  meta: selectedMeta,
                });
                return;
              }
              performUpload();
            }

            function handleCancel(event) {
              event?.preventDefault?.();
              void resolveAndClose({
                confirmed: false,
                uploaded: uploadComplete,
                file: selectedFile,
                result: uploadResult,
                meta: selectedMeta,
                processing: processingInBackground && uploading,
              });
            }

            if (dialog.root) {
              dialog.root.classList.remove('hidden');
              dialog.root.classList.remove('upload-dialog-hidden');
              dialog.root.setAttribute('aria-hidden', 'false');
            }
            document.body.classList.add('dialog-open');

            if (dialog.title) {
              dialog.title.textContent = labels.title;
            }
            if (dialog.description) {
              dialog.description.textContent = labels.description;
            }
            if (dialog.prompt) {
              dialog.prompt.textContent = labels.prompt;
            }
            if (dialog.dropzone) {
              dialog.dropzone.setAttribute('aria-label', labels.prompt);
            }
            if (dialog.help) {
              dialog.help.textContent = labels.help;
            }
            if (dialog.browse) {
              dialog.browse.textContent = labels.browse;
            }
            if (dialog.clear) {
              dialog.clear.textContent = labels.clear;
            }
            if (dialog.input) {
              dialog.input.accept = accept;
              dialog.input.value = '';
            }
            if (dialog.progress) {
              dialog.progress.setAttribute('aria-label', labels.progress);
              dialog.progress.setAttribute('aria-valuenow', '0');
            }
            if (dialog.status) {
              dialog.status.classList.remove('error', 'success');
              dialog.status.textContent = '';
            }
            if (dialog.fileInfo) {
              dialog.fileInfo.classList.add('hidden');
            }
            selectedFile = null;
            selectedMeta = null;
            uploading = false;
            uploadComplete = false;
            uploadResult = null;
            resetProgress();
            setStatus(labels.waiting);
            updateActionState();

            if (dialog.confirm) {
              dialog.confirm.addEventListener('click', handleConfirm);
            }
            if (dialog.cancel) {
              dialog.cancel.textContent = t('dialog.cancel');
              dialog.cancel.addEventListener('click', handleCancel);
            }
            if (dialog.backdrop) {
              dialog.backdrop.addEventListener('click', handleCancel);
            }
            if (dialog.window) {
              dialog.window.addEventListener('keydown', handleKeyDown);
            }
            if (dialog.dropzone) {
              dialog.dropzone.addEventListener('click', handleBrowseClick);
              dialog.dropzone.addEventListener('keydown', handleDropzoneKeyDown);
              dialog.dropzone.addEventListener('dragover', handleDragOver);
              dialog.dropzone.addEventListener('dragleave', handleDragLeave);
              dialog.dropzone.addEventListener('drop', handleDrop);
            }
            if (dialog.browse) {
              dialog.browse.addEventListener('click', handleBrowseClick);
              dialog.browse.addEventListener('keydown', handleDropzoneKeyDown);
            }
            if (dialog.input) {
              dialog.input.addEventListener('change', handleInputChange);
            }
            if (dialog.clear) {
              dialog.clear.addEventListener('click', handleClearSelection);
            }

            window.requestAnimationFrame(() => {
              const target = dialog.dropzone instanceof HTMLElement ? dialog.dropzone : dialog.confirm;
              target?.focus?.({ preventScroll: true });
            });
          });
        }

        async function showSlideRangeDialog(source) {
          return new Promise((resolve) => {
            const dialog = dom.slideRangeDialog;
            if (!dialog || !dialog.root || dialogState.active || dialogState.uploadActive) {
              resolve({ confirmed: false, pageStart: null, pageEnd: null, pageTotal: null });
              return;
            }

            hidePendingOverlay();
            dialogState.active = true;
            let cancelled = false;
            let pageCount = 0;
            let startPage = 1;
            let endPage = 1;
            let anchorPage = 1;
            let previewFailed = false;
            let manualSelectionMade = false;
            const pageEntries = [];
            const BASE_PREVIEW_COLUMN_WIDTH = 220;
            let previewZoom = 100;
            let fallbackObjectUrl = null;
            let fallbackPreviewUrl = null;
            const previewSource =
              source instanceof Blob
                ? { file: source }
                : source && typeof source === 'object'
                ? { ...source }
                : null;

            const previousActive =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;

            function clampPage(value) {
              const numeric =
                typeof value === 'number'
                  ? value
                  : Number.parseInt(String(value ?? ''), 10);
              if (!Number.isFinite(numeric)) {
                return 1;
              }
              const rounded = Math.max(1, Math.round(numeric));
              if (!pageCount || pageCount < 1) {
                return rounded;
              }
              return Math.min(pageCount, rounded);
            }

            function configureInputBounds(totalPages) {
              const numeric =
                typeof totalPages === 'number' && Number.isFinite(totalPages) && totalPages > 0
                  ? Math.round(totalPages)
                  : 0;
              if (dialog.startInput) {
                dialog.startInput.min = '1';
                dialog.startInput.max = numeric > 0 ? String(numeric) : '';
              }
              if (dialog.endInput) {
                dialog.endInput.min = '1';
                dialog.endInput.max = numeric > 0 ? String(numeric) : '';
              }
            }

            function resolvePreviewIdentifiers() {
              if (!previewSource || typeof previewSource !== 'object') {
                return { lectureId: null, previewId: null };
              }

              let previewId =
                typeof previewSource.previewId === 'string' && previewSource.previewId
                  ? previewSource.previewId
                  : null;
              let lectureId = null;
              if (
                typeof previewSource.lectureId === 'number' ||
                (typeof previewSource.lectureId === 'string' && previewSource.lectureId)
              ) {
                lectureId = String(previewSource.lectureId).trim() || null;
              }

              if ((!previewId || !lectureId) && typeof previewSource.url === 'string') {
                const match = previewSource.url.match(
                  /\/api\/lectures\/(\d+)\/slides\/previews\/([^/?#]+)/,
                );
                if (match) {
                  if (!lectureId) {
                    lectureId = match[1];
                  }
                  if (!previewId) {
                    try {
                      previewId = decodeURIComponent(match[2]);
                    } catch (decodeError) {
                      previewId = match[2];
                    }
                  }
                }
              }

              return { lectureId, previewId };
            }

            function updateFallbackVisibility() {
              const hasUrl = Boolean(fallbackPreviewUrl);
              if (dialog.fallbackFrame) {
                dialog.fallbackFrame.src = hasUrl ? fallbackPreviewUrl : 'about:blank';
                dialog.fallbackFrame.classList.toggle('hidden', !hasUrl);
              }
              if (dialog.fallbackLink) {
                if (hasUrl) {
                  dialog.fallbackLink.href = fallbackPreviewUrl;
                  dialog.fallbackLink.classList.remove('hidden');
                } else {
                  dialog.fallbackLink.href = '#';
                  dialog.fallbackLink.classList.add('hidden');
                }
              }
              if (dialog.fallback) {
                dialog.fallback.classList.toggle('hidden', !previewFailed);
              }
            }

            function assignFallbackPreview(value, { isObjectUrl = false } = {}) {
              const nextValue = value || null;
              if (
                fallbackObjectUrl &&
                fallbackObjectUrl !== nextValue &&
                typeof URL !== 'undefined' &&
                typeof URL.revokeObjectURL === 'function'
              ) {
                try {
                  URL.revokeObjectURL(fallbackObjectUrl);
                } catch (error) {
                  // Ignore revocation failures.
                }
              }
              fallbackObjectUrl = isObjectUrl && nextValue ? nextValue : null;
              fallbackPreviewUrl = nextValue;
              updateFallbackVisibility();
            }

            function clearFallbackPreview() {
              if (
                fallbackObjectUrl &&
                typeof URL !== 'undefined' &&
                typeof URL.revokeObjectURL === 'function'
              ) {
                try {
                  URL.revokeObjectURL(fallbackObjectUrl);
                } catch (error) {
                  // Ignore revocation failures.
                }
              }
              fallbackObjectUrl = null;
              fallbackPreviewUrl = null;
              updateFallbackVisibility();
            }

            function resolveFallbackPreview() {
              const canCreateObjectUrl =
                typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
              if (canCreateObjectUrl && previewSource?.file instanceof Blob) {
                const url = URL.createObjectURL(previewSource.file);
                return { url, isObjectUrl: true };
              }
              if (canCreateObjectUrl && source instanceof Blob) {
                const url = URL.createObjectURL(source);
                return { url, isObjectUrl: true };
              }
              if (previewSource && typeof previewSource.url === 'string' && previewSource.url) {
                return { url: resolveAppUrl(previewSource.url), isObjectUrl: false };
              }
              const { lectureId, previewId } = resolvePreviewIdentifiers();
              if (lectureId && previewId) {
                const directUrl = `/api/lectures/${lectureId}/slides/previews/${encodeURIComponent(
                  previewId,
                )}`;
                return { url: resolveAppUrl(directUrl), isObjectUrl: false };
              }
              return { url: null, isObjectUrl: false };
            }

            async function derivePdfPageCount(fallbackPreview) {
              const blobCandidates = [];
              if (previewSource?.file instanceof Blob) {
                blobCandidates.push(previewSource.file);
              }
              if (source instanceof Blob && source !== previewSource?.file) {
                blobCandidates.push(source);
              }

              for (const blobCandidate of blobCandidates) {
                try {
                  const blobCount = await extractPdfPageCountFromBlob(blobCandidate);
                  if (Number.isFinite(blobCount) && blobCount > 0) {
                    return Math.round(blobCount);
                  }
                } catch (blobError) {
                  console.warn('Failed to derive PDF page count from blob', blobError);
                }
              }

              const urlCandidates = new Set();
              if (previewSource && typeof previewSource.url === 'string' && previewSource.url) {
                urlCandidates.add(resolveAppUrl(previewSource.url));
              }
              if (fallbackPreview?.url) {
                urlCandidates.add(fallbackPreview.url);
              }

              const withCredentials = previewSource?.withCredentials === false ? false : true;
              for (const candidateUrl of urlCandidates) {
                try {
                  const urlCount = await extractPdfPageCountFromUrl(candidateUrl, {
                    withCredentials,
                  });
                  if (Number.isFinite(urlCount) && urlCount > 0) {
                    return Math.round(urlCount);
                  }
                } catch (urlError) {
                  console.warn('Failed to derive PDF page count from URL', urlError);
                }
              }

              return null;
            }

            async function fetchPreviewPageCount() {
              const { lectureId, previewId } = resolvePreviewIdentifiers();
              if (!lectureId || !previewId) {
                return null;
              }

              const credentials =
                previewSource && previewSource.withCredentials === false ? 'omit' : 'include';

              try {
                const payload = await request(
                  `/api/lectures/${lectureId}/slides/previews/${encodeURIComponent(previewId)}/metadata`,
                  {
                    method: 'GET',
                    headers: { Accept: 'application/json' },
                    credentials,
                    cache: 'no-store',
                  },
                );
                const value = payload?.page_count ?? payload?.pageCount;
                const numeric = Number(value);
                if (Number.isFinite(numeric) && numeric > 0) {
                  return Math.round(numeric);
                }
              } catch (error) {
                console.warn('Failed to load slide metadata', error);
              }

              return null;
            }

            function resolvePreviewImageUrl(pageNumber) {
              const { lectureId, previewId } = resolvePreviewIdentifiers();
              if (!lectureId || !previewId || !pageNumber) {
                return null;
              }
              const encoded = encodeURIComponent(previewId);
              const url = `/api/lectures/${lectureId}/slides/previews/${encoded}/pages/${pageNumber}`;
              return resolveAppUrl(url);
            }

            async function renderServerPreviewPages(totalPages) {
              if (!dialog.pages) {
                return;
              }
              dialog.pages.innerHTML = '';
              pageEntries.length = 0;
              const count = Number.isFinite(totalPages) ? Number(totalPages) : 0;
              if (count < 1) {
                return;
              }
              for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
                if (cancelled) {
                  return;
                }
                const wrapper = document.createElement('div');
                wrapper.className = 'slide-preview-page';
                wrapper.dataset.pageNumber = String(pageNumber);
                wrapper.tabIndex = 0;
                const label = document.createElement('div');
                label.className = 'slide-preview-page-label';
                label.textContent = t('dialogs.slideRange.pageLabel', { page: pageNumber });
                const image = document.createElement('img');
                image.loading = 'lazy';
                image.decoding = 'async';
                image.alt = t('dialogs.slideRange.pageLabel', { page: pageNumber });
                const imageUrl = resolvePreviewImageUrl(pageNumber);
                if (imageUrl) {
                  image.src = imageUrl;
                }
                wrapper.appendChild(label);
                wrapper.appendChild(image);
                dialog.pages.appendChild(wrapper);
                pageEntries.push({ element: wrapper, label, pageNumber });
                wrapper.addEventListener('click', (event) => {
                  handlePageSelection(pageNumber, event.shiftKey);
                });
                wrapper.addEventListener('keydown', (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handlePageSelection(pageNumber, event.shiftKey);
                  }
                });
              }
            }

            async function enableServerRenderedPreview({ knownPageCount = null } = {}) {
              if (cancelled) {
                return;
              }

              const countCandidates = [
                knownPageCount,
                previewSource && typeof previewSource.pageCount !== 'undefined'
                  ? previewSource.pageCount
                  : null,
              ];

              let resolvedCount = null;
              for (const candidate of countCandidates) {
                const numeric = Number(candidate);
                if (Number.isFinite(numeric) && numeric > 0) {
                  resolvedCount = Math.round(numeric);
                  break;
                }
              }

              const fallbackPreview = resolveFallbackPreview();

              if (!resolvedCount || resolvedCount <= 0) {
                try {
                  resolvedCount = await fetchPreviewPageCount();
                } catch (metadataError) {
                  resolvedCount = null;
                }
              }

              if (!resolvedCount || resolvedCount <= 0) {
                try {
                  const derivedCount = await derivePdfPageCount(fallbackPreview);
                  if (Number.isFinite(derivedCount) && derivedCount > 0) {
                    resolvedCount = Math.round(derivedCount);
                  }
                } catch (pageCountError) {
                  console.warn('Unable to determine PDF page count from PDF data', pageCountError);
                }
              }

              pageCount = Number.isFinite(resolvedCount) && resolvedCount > 0 ? Math.round(resolvedCount) : 0;
              configureInputBounds(pageCount);
              startPage = 1;
              endPage = pageCount > 0 ? pageCount : 1;
              anchorPage = 1;
              manualSelectionMade = false;

              assignFallbackPreview(fallbackPreview.url, {
                isObjectUrl: fallbackPreview.isObjectUrl,
              });

              if (dialog.loading) {
                dialog.loading.classList.add('hidden');
              }

              let renderSucceeded = false;
              if (!cancelled && pageCount > 0) {
                try {
                  await renderServerPreviewPages(pageCount);
                  renderSucceeded = true;
                } catch (error) {
                  if (!cancelled) {
                    console.warn('Unable to render slide previews', error);
                  }
                }
              }

              previewFailed = !renderSucceeded;

              if (dialog.error) {
                if (previewFailed) {
                  dialog.error.textContent = t('dialogs.slideRange.error');
                  dialog.error.classList.remove('hidden');
                } else {
                  dialog.error.textContent = '';
                  dialog.error.classList.add('hidden');
                }
              }

              updateFallbackVisibility();
              enableControls();
              updateRangeSummary();
              updateTexts();

              window.requestAnimationFrame(() => {
                if (dialog.startInput && !dialog.startInput.disabled) {
                  dialog.startInput.focus({ preventScroll: true });
                  dialog.startInput.select();
                } else if (dialog.confirm) {
                  dialog.confirm.focus({ preventScroll: true });
                }
              });
            }

            function clampZoom(value) {
              const numeric =
                typeof value === 'number'
                  ? value
                  : Number.parseInt(String(value ?? ''), 10);
              if (!Number.isFinite(numeric)) {
                return 100;
              }
              return Math.min(200, Math.max(50, Math.round(numeric)));
            }

            function updateZoomDisplay() {
              if (dialog.pages) {
                const scale = clampZoom(previewZoom) / 100;
                const minWidth = Math.round(BASE_PREVIEW_COLUMN_WIDTH * scale);
                dialog.pages.style.setProperty(
                  '--slide-preview-min-width',
                  `${minWidth}px`,
                );
              }
              const zoomText = t('dialogs.slideRange.zoomValue', {
                value: clampZoom(previewZoom),
              });
              if (dialog.zoomValue) {
                dialog.zoomValue.textContent = zoomText;
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.setAttribute('aria-valuetext', zoomText);
              }
            }

            function handleZoomInput(event) {
              previewZoom = clampZoom(event?.target?.value);
              if (dialog.zoomSlider) {
                dialog.zoomSlider.value = String(previewZoom);
              }
              updateZoomDisplay();
            }

            function updateTexts() {
              if (dialog.title) {
                dialog.title.textContent = t('dialogs.slideRange.title');
              }
              if (dialog.description) {
                dialog.description.textContent = t('dialogs.slideRange.description');
              }
              if (dialog.startLabel) {
                dialog.startLabel.textContent = t('dialogs.slideRange.startLabel');
              }
              if (dialog.endLabel) {
                dialog.endLabel.textContent = t('dialogs.slideRange.endLabel');
              }
              if (dialog.zoomLabel) {
                dialog.zoomLabel.textContent = t('dialogs.slideRange.zoomLabel');
              }
              if (dialog.fallbackMessage) {
                dialog.fallbackMessage.textContent = t('dialogs.slideRange.fallbackMessage');
              }
              if (dialog.fallbackLink) {
                dialog.fallbackLink.textContent = t('dialogs.slideRange.fallbackLink');
              }
              if (dialog.fallbackFrame) {
                dialog.fallbackFrame.setAttribute(
                  'title',
                  t('dialogs.slideRange.fallbackFrameTitle'),
                );
              }
              if (dialog.selectAll) {
                dialog.selectAll.textContent = t('dialogs.slideRange.selectAll');
              }
              if (dialog.hint) {
                dialog.hint.textContent = t('dialogs.slideRange.rangeHint');
              }
              if (dialog.loading) {
                dialog.loading.textContent = t('dialogs.slideRange.loading');
              }
              if (dialog.confirm) {
                dialog.confirm.textContent = t('dialogs.slideRange.confirm');
              }
              if (dialog.cancel) {
                dialog.cancel.textContent = t('dialog.cancel');
              }
              if (previewFailed && dialog.error) {
                dialog.error.textContent = t('dialogs.slideRange.error');
              }
              updateZoomDisplay();
              pageEntries.forEach(({ label, pageNumber }) => {
                if (label) {
                  label.textContent = t('dialogs.slideRange.pageLabel', {
                    page: pageNumber,
                  });
                }
              });
            }

            function updateRangeSummary() {
              const lower = clampPage(startPage);
              const upper = clampPage(endPage);
              startPage = Math.min(lower, upper);
              endPage = Math.max(lower, upper);
              anchorPage = startPage;

              if (dialog.startInput) {
                dialog.startInput.value = String(startPage);
              }
              if (dialog.endInput) {
                dialog.endInput.value = String(endPage);
              }

              if (!pageCount || pageCount < 1) {
                if (dialog.summary) {
                  if (!manualSelectionMade) {
                    dialog.summary.textContent = t('dialogs.slideRange.allPages');
                  } else {
                    const key =
                      startPage === endPage
                        ? 'dialogs.slideRange.summarySingleUnknown'
                        : 'dialogs.slideRange.summaryUnknown';
                    dialog.summary.textContent = t(key, {
                      start: startPage,
                      end: endPage,
                    });
                  }
                }
                pageEntries.forEach(({ element }) => {
                  element.classList.add('selected');
                });
                return;
              }

              if (dialog.summary) {
                const key =
                  startPage === endPage
                    ? 'dialogs.slideRange.summarySingle'
                    : 'dialogs.slideRange.summary';
                dialog.summary.textContent = t(key, {
                  start: startPage,
                  end: endPage,
                  total: pageCount,
                });
              }

              pageEntries.forEach(({ element, pageNumber }) => {
                const selected = pageNumber >= startPage && pageNumber <= endPage;
                element.classList.toggle('selected', selected);
              });
            }

            function disableControls() {
              if (dialog.startInput) {
                dialog.startInput.disabled = true;
              }
              if (dialog.endInput) {
                dialog.endInput.disabled = true;
              }
              if (dialog.selectAll) {
                dialog.selectAll.disabled = true;
              }
              if (dialog.confirm) {
                dialog.confirm.disabled = true;
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.disabled = true;
              }
            }

            function enableControls() {
              const hasPageCount = Boolean(pageCount && pageCount > 0);
              const manualOnly = previewFailed && !hasPageCount;
              if (dialog.startInput) {
                dialog.startInput.disabled = !manualOnly && !hasPageCount;
              }
              if (dialog.endInput) {
                dialog.endInput.disabled = !manualOnly && !hasPageCount;
              }
              if (dialog.selectAll) {
                const canSelectAll = hasPageCount || manualOnly;
                dialog.selectAll.disabled = !canSelectAll;
              }
              if (dialog.confirm) {
                dialog.confirm.disabled = false;
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.disabled = !hasPageCount || previewFailed;
              }
            }

            function enableConfirmOnly() {
              if (dialog.confirm) {
                dialog.confirm.disabled = false;
              }
              if (dialog.selectAll) {
                dialog.selectAll.disabled = true;
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.disabled = true;
              }
            }

            function cleanup() {
              cancelled = true;
              activeSlideRangeDialog = null;
              previewFailed = false;
              clearFallbackPreview();
              if (dialog.confirm) {
                dialog.confirm.removeEventListener('click', handleConfirm);
              }
              if (dialog.cancel) {
                dialog.cancel.removeEventListener('click', handleCancel);
              }
              if (dialog.backdrop) {
                dialog.backdrop.removeEventListener('click', handleCancel);
              }
              if (dialog.window) {
                dialog.window.removeEventListener('keydown', handleKeyDown);
              }
              if (dialog.startInput) {
                dialog.startInput.removeEventListener('input', handleStartInput);
                dialog.startInput.removeEventListener('blur', handleStartBlur);
              }
              if (dialog.endInput) {
                dialog.endInput.removeEventListener('input', handleEndInput);
                dialog.endInput.removeEventListener('blur', handleEndBlur);
              }
              if (dialog.selectAll) {
                dialog.selectAll.removeEventListener('click', handleSelectAll);
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.removeEventListener('input', handleZoomInput);
              }
              if (dialog.root) {
                dialog.root.classList.add('hidden');
                dialog.root.setAttribute('aria-hidden', 'true');
              }
              if (dialog.preview) {
                dialog.preview.scrollTop = 0;
              }
              if (dialog.pages) {
                dialog.pages.innerHTML = '';
              }
              if (dialog.error) {
                dialog.error.classList.add('hidden');
                dialog.error.textContent = '';
              }
              if (dialog.loading) {
                dialog.loading.classList.remove('hidden');
              }
              if (dialog.summary) {
                dialog.summary.textContent = '';
              }
              if (dialog.zoomSlider) {
                dialog.zoomSlider.disabled = false;
                dialog.zoomSlider.value = '100';
              }
              previewZoom = 100;
              if (dialog.pages) {
                dialog.pages.style.removeProperty('--slide-preview-min-width');
              }
              if (dialog.zoomValue) {
                dialog.zoomValue.textContent = '';
              }
              document.body.classList.remove('dialog-open');
              dialogState.active = false;
              if (previousActive) {
                previousActive.focus({ preventScroll: true });
              }
            }

            function resolveAndClose(result) {
              cleanup();
              resolve(result);
            }

            function handleConfirm(event) {
              event.preventDefault();
              if (dialog.confirm && dialog.confirm.disabled) {
                return;
              }
              if (previewFailed && (!pageCount || pageCount < 1) && !manualSelectionMade) {
                resolveAndClose({
                  confirmed: true,
                  pageStart: null,
                  pageEnd: null,
                  pageTotal: null,
                });
                return;
              }
              startPage = clampPage(dialog.startInput?.value ?? startPage);
              anchorPage = startPage;
              endPage = clampPage(dialog.endInput?.value ?? endPage);
              manualSelectionMade = manualSelectionMade || previewFailed;
              updateRangeSummary();
              resolveAndClose({
                confirmed: true,
                pageStart: startPage,
                pageEnd: endPage,
                pageTotal: pageCount > 0 ? pageCount : null,
              });
            }

            function handleCancel(event) {
              event?.preventDefault?.();
              resolveAndClose({
                confirmed: false,
                pageStart: null,
                pageEnd: null,
                pageTotal: pageCount > 0 ? pageCount : null,
              });
            }

            function getFocusableElements() {
              return [
                dialog.startInput,
                dialog.endInput,
                dialog.selectAll,
                dialog.confirm,
                dialog.cancel,
              ].filter((element) => element instanceof HTMLElement && !element.disabled);
            }

            function handleKeyDown(event) {
              if (event.key === 'Escape') {
                event.preventDefault();
                handleCancel(event);
                return;
              }
              if (event.key === 'Tab') {
                const focusable = getFocusableElements();
                if (!focusable.length) {
                  return;
                }
                const currentIndex = focusable.indexOf(document.activeElement);
                const nextIndex = event.shiftKey
                  ? currentIndex <= 0
                    ? focusable.length - 1
                    : currentIndex - 1
                  : currentIndex === focusable.length - 1
                    ? 0
                    : currentIndex + 1;
                focusable[nextIndex].focus({ preventScroll: true });
                event.preventDefault();
              }
            }

            function handleStartInput(event) {
              if (!pageCount && !previewFailed) {
                return;
              }
              const newValue = clampPage(event.target.value);
              if (!Number.isFinite(newValue)) {
                return;
              }
              startPage = newValue;
              anchorPage = startPage;
              manualSelectionMade = true;
              updateRangeSummary();
            }

            function handleStartBlur() {
              if (!pageCount && !previewFailed) {
                return;
              }
              startPage = clampPage(dialog.startInput?.value);
              anchorPage = startPage;
              manualSelectionMade = manualSelectionMade || previewFailed;
              updateRangeSummary();
            }

            function handleEndInput(event) {
              if (!pageCount && !previewFailed) {
                return;
              }
              const newValue = clampPage(event.target.value);
              if (!Number.isFinite(newValue)) {
                return;
              }
              endPage = newValue;
              manualSelectionMade = true;
              updateRangeSummary();
            }

            function handleEndBlur() {
              if (!pageCount && !previewFailed) {
                return;
              }
              endPage = clampPage(dialog.endInput?.value);
              manualSelectionMade = manualSelectionMade || previewFailed;
              updateRangeSummary();
            }

            function handleSelectAll(event) {
              event?.preventDefault?.();
              if (!pageCount && !previewFailed) {
                return;
              }
              startPage = 1;
              endPage = pageCount && pageCount > 0 ? pageCount : Math.max(1, endPage);
              anchorPage = startPage;
              manualSelectionMade = false;
              updateRangeSummary();
            }

            function handlePageSelection(pageNumber, extend) {
              if (!pageCount) {
                return;
              }
              const clamped = clampPage(pageNumber);
              if (extend) {
                const lower = Math.min(anchorPage, clamped);
                const upper = Math.max(anchorPage, clamped);
                startPage = lower;
                endPage = upper;
              } else {
                startPage = clamped;
                endPage = clamped;
                anchorPage = clamped;
              }
              manualSelectionMade = true;
              updateRangeSummary();
            }

            activeSlideRangeDialog = {
              updateTexts,
              updateRangeSummary,
            };

            if (dialog.pages) {
              dialog.pages.innerHTML = '';
            }
            if (dialog.summary) {
              dialog.summary.textContent = '';
            }
            if (dialog.error) {
              dialog.error.classList.add('hidden');
              dialog.error.textContent = '';
            }
            if (dialog.loading) {
              dialog.loading.classList.remove('hidden');
            }
            if (dialog.startInput) {
              dialog.startInput.value = '1';
            }
            if (dialog.endInput) {
              dialog.endInput.value = '1';
            }
            configureInputBounds(0);
            manualSelectionMade = false;

            disableControls();
            updateTexts();
            updateRangeSummary();

            if (dialog.root) {
              dialog.root.classList.remove('hidden');
              dialog.root.setAttribute('aria-hidden', 'false');
            }
            document.body.classList.add('dialog-open');
            if (dialog.preview) {
              dialog.preview.scrollTop = 0;
            }

            if (dialog.confirm) {
              dialog.confirm.addEventListener('click', handleConfirm);
            }
            if (dialog.cancel) {
              dialog.cancel.addEventListener('click', handleCancel);
            }
            if (dialog.backdrop) {
              dialog.backdrop.addEventListener('click', handleCancel);
            }
            if (dialog.window) {
              dialog.window.addEventListener('keydown', handleKeyDown);
            }
            if (dialog.startInput) {
              dialog.startInput.addEventListener('input', handleStartInput);
              dialog.startInput.addEventListener('blur', handleStartBlur);
            }
            if (dialog.endInput) {
              dialog.endInput.addEventListener('input', handleEndInput);
              dialog.endInput.addEventListener('blur', handleEndBlur);
            }
            if (dialog.selectAll) {
              dialog.selectAll.addEventListener('click', handleSelectAll);
            }
            if (dialog.zoomSlider) {
              previewZoom = clampZoom(dialog.zoomSlider.value);
              dialog.zoomSlider.addEventListener('input', handleZoomInput);
            }

            window.requestAnimationFrame(() => {
              if (dialog.startInput && !dialog.startInput.disabled) {
                dialog.startInput.focus({ preventScroll: true });
                dialog.startInput.select();
              } else if (dialog.cancel) {
                dialog.cancel.focus({ preventScroll: true });
              } else if (dialog.confirm && !dialog.confirm.disabled) {
                dialog.confirm.focus({ preventScroll: true });
              }
            });

            (async () => {
              try {
                await enableServerRenderedPreview();
              } catch (error) {
                if (cancelled) {
                  return;
                }
                console.warn('Slide preview failed, enabling manual page selection', error);
                enableControls();
              }
            })();
          });
        }

        function formatNumber(value) {
          return new Intl.NumberFormat().format(value ?? 0);
        }

        function formatBytes(bytes) {
          if (typeof bytes !== 'number' || Number.isNaN(bytes)) {
            return '';
          }
          if (bytes < 1024) {
            return `${bytes} B`;
          }
          const units = ['KB', 'MB', 'GB', 'TB'];
          let value = bytes / 1024;
          let unitIndex = 0;
          while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex += 1;
          }
          return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`;
        }

        function formatDate(isoString) {
          if (!isoString) {
            return '';
          }
          const formatter = new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
          return formatter.format(new Date(isoString));
        }

        function buildStorageURL(path) {
          if (!path) {
            return '#';
          }
          const encodedPath = path
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/');
          return resolveAppUrl(`/storage/${encodedPath}`);
        }

        function buildStorageListUrl(path) {
          if (!path) {
            return '/api/storage/list';
          }
          const params = new URLSearchParams();
          params.set('path', path);
          return `/api/storage/list?${params.toString()}`;
        }

        async function uploadWithProgress(url, options = {}) {
          const resolvedUrl = resolveAppUrl(url);
          const method = typeof options.method === 'string' ? options.method.toUpperCase() : 'POST';
          const headers = options.headers && typeof options.headers === 'object' ? options.headers : {};
          const body = options.body ?? null;
          const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

          return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, resolvedUrl);
            xhr.responseType = 'json';

            Object.entries(headers).forEach(([key, value]) => {
              if (typeof key === 'string' && typeof value === 'string') {
                xhr.setRequestHeader(key, value);
              }
            });

            xhr.upload.addEventListener('progress', (event) => {
              if (!onProgress) {
                return;
              }
              if (event.lengthComputable && event.total > 0) {
                onProgress(event.loaded / event.total);
              }
            });

            xhr.addEventListener('load', () => {
              if (onProgress) {
                onProgress(1);
              }
              if (xhr.status >= 200 && xhr.status < 300) {
                const responseBody = xhr.response ?? null;
                resolve(responseBody);
                return;
              }
              let detail = `${xhr.status} ${xhr.statusText || ''}`.trim();
              const responseBody = xhr.response ?? null;
              if (responseBody && typeof responseBody === 'object' && responseBody.detail) {
                detail = responseBody.detail;
              } else if (!responseBody && xhr.responseText) {
                try {
                  const parsed = JSON.parse(xhr.responseText);
                  if (parsed && parsed.detail) {
                    detail = parsed.detail;
                  }
                } catch (error) {
                  // Ignore parse errors.
                }
              }
              if (!detail) {
                detail = 'Upload failed.';
              }
              reject(new Error(detail));
            });

            xhr.addEventListener('error', () => {
              reject(new Error('Network error during upload.'));
            });

            xhr.addEventListener('abort', () => {
              reject(new Error('Upload was aborted.'));
            });

            try {
              xhr.send(body);
            } catch (error) {
              reject(error instanceof Error ? error : new Error('Unable to start upload.'));
            }
          });
        }

        async function request(url, options = {}) {
          const resolvedUrl = resolveAppUrl(url);
          const response = await fetch(resolvedUrl, options);
          if (!response.ok) {
            let detail = `${response.status} ${response.statusText}`;
            try {
              const payload = await response.json();
              if (payload && payload.detail) {
                detail = payload.detail;
              }
            } catch (error) {
              // Ignore JSON parsing errors.
            }
            throw new Error(detail);
          }
          if (response.status === 204) {
            return null;
          }
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            return await response.json();
          }
          return null;
        }

        async function createSlidePreview(lectureId, file, options = {}) {
          if (!lectureId) {
            return null;
          }
          const formData = new FormData();
          const source =
            typeof options.source === 'string' && options.source
              ? options.source.trim().toLowerCase()
              : 'upload';
          if (source === 'existing') {
            formData.append('source', 'existing');
          } else {
            if (!(file instanceof Blob)) {
              return null;
            }
            formData.append('file', file);
          }
          const payload = await request(
            `/api/lectures/${lectureId}/slides/previews`,
            { method: 'POST', body: formData },
          );
          if (!payload || !payload.preview_id || !payload.preview_url) {
            return null;
          }
          const providedName =
            (typeof payload.filename === 'string' && payload.filename) ||
            (file && typeof file.name === 'string' && file.name) ||
            'slides.pdf';
          return {
            id: payload.preview_id,
            url: resolveAppUrl(payload.preview_url),
            filename: providedName,
            pageCount:
              typeof payload.page_count === 'number' && Number.isFinite(payload.page_count)
                ? Math.max(0, Math.round(payload.page_count))
                : null,
          };
        }

        async function deleteSlidePreview(lectureId, previewId) {
          if (!lectureId || !previewId) {
            return;
          }
          try {
            await request(
              `/api/lectures/${lectureId}/slides/previews/${encodeURIComponent(previewId)}`,
              { method: 'DELETE' },
            );
          } catch (error) {
            console.warn('Failed to remove slide preview', error);
          }
        }

        async function loadGpuWhisperStatus() {
          try {
            const payload = await request('/api/settings/whisper-gpu/status');
            const status = payload?.status || {};
            updateGpuWhisperUI(status);
          } catch (error) {
            updateGpuWhisperUI({
              supported: false,
              checked: true,
              message: error instanceof Error ? error.message : String(error),
              unavailable: false,
            });
          }
        }

        async function fetchTranscriptionProgress(lectureId) {
          if (!lectureId) {
            return null;
          }
          try {
            const payload = await request(
              `/api/lectures/${lectureId}/transcription-progress`,
            );
            return payload?.progress || null;
          } catch (error) {
            return null;
          }
        }

        async function fetchProcessingProgress(lectureId) {
          if (!lectureId) {
            return null;
          }
          try {
            const payload = await request(
              `/api/lectures/${lectureId}/processing-progress`,
            );
            return payload?.progress || null;
          } catch (error) {
            return null;
          }
        }

        function stopTranscriptionProgress({ preserveMessage = false } = {}) {
          if (state.transcriptionProgressTimer !== null) {
            window.clearInterval(state.transcriptionProgressTimer);
          }
          state.transcriptionProgressTimer = null;
          state.transcriptionProgressLectureId = null;
          if (!preserveMessage) {
            state.lastProgressMessage = '';
            state.lastProgressRatio = null;
            resetStatusProgress();
          }
        }

        function stopProcessingProgress({ preserveMessage = false } = {}) {
          if (state.processingProgressTimer !== null) {
            window.clearInterval(state.processingProgressTimer);
          }
          state.processingProgressTimer = null;
          state.processingProgressLectureId = null;
          if (!preserveMessage) {
            state.lastProgressMessage = '';
            state.lastProgressRatio = null;
            resetStatusProgress();
          }
        }

        async function handleProgressUpdate(progress, context = {}) {
          if (!progress) {
            return;
          }
          const source = context?.source || 'transcription';
          const lectureId = context?.lectureId || null;
          const message = progress.message || '';
          const variant = progress.error ? 'error' : 'info';
          const finished = Boolean(progress.finished);
          const ratio =
            typeof progress.ratio === 'number' && Number.isFinite(progress.ratio)
              ? Math.max(0, Math.min(progress.ratio, 1))
              : null;
          const shouldUpdate =
            message !== state.lastProgressMessage || ratio !== state.lastProgressRatio;
          if (shouldUpdate) {
            const displayMessage = message || state.lastProgressMessage || t('status.processing');
            showStatus(displayMessage, variant, {
              progressRatio: ratio,
              persist: !finished,
            });
            state.lastProgressMessage = message;
            state.lastProgressRatio = ratio;
          }
          if (finished) {
            if (source === 'processing') {
              stopProcessingProgress({ preserveMessage: true });
              if (lectureId) {
                try {
                  await refreshData();
                  if (state.selectedLectureId === lectureId) {
                    await selectLecture(lectureId);
                  }
                } catch (error) {
                  const detail =
                    error instanceof Error && error.message
                      ? error.message
                      : t('status.storageLoadFailed');
                  showStatus(detail, 'error');
                }
              }
            } else {
              stopTranscriptionProgress({ preserveMessage: true });
            }
          }
          await refreshProgressQueue({ silent: true });
        }

        function startTranscriptionProgress(lectureId) {
          stopTranscriptionProgress();
          if (!lectureId) {
            return;
          }
          state.transcriptionProgressLectureId = lectureId;
          let polling = false;
          const poll = async () => {
            if (polling) {
              return;
            }
            polling = true;
            try {
              const progress = await fetchTranscriptionProgress(lectureId);
              if (progress) {
                await handleProgressUpdate(progress, { source: 'transcription', lectureId });
              }
            } finally {
              polling = false;
            }
          };
          void poll();
          state.transcriptionProgressTimer = window.setInterval(() => {
            void poll();
          }, 1200);
        }

        function startProcessingProgress(lectureId) {
          stopProcessingProgress();
          if (!lectureId) {
            return;
          }
          state.processingProgressLectureId = lectureId;
          let polling = false;
          const poll = async () => {
            if (polling) {
              return;
            }
            polling = true;
            try {
              const progress = await fetchProcessingProgress(lectureId);
              if (progress) {
                await handleProgressUpdate(progress, { source: 'processing', lectureId });
              }
            } finally {
              polling = false;
            }
          };
          void poll();
          state.processingProgressTimer = window.setInterval(() => {
            void poll();
          }, 900);
        }

        async function ensureLectureProgressPolling(lectureId) {
          const normalizedId = Number(lectureId);
          if (!Number.isFinite(normalizedId) || normalizedId <= 0) {
            return;
          }

          const [transcriptionResult, processingResult] = await Promise.allSettled([
            fetchTranscriptionProgress(normalizedId),
            fetchProcessingProgress(normalizedId),
          ]);

          const transcription =
            transcriptionResult.status === 'fulfilled' ? transcriptionResult.value : null;
          const processing =
            processingResult.status === 'fulfilled' ? processingResult.value : null;

          if (transcription) {
            const active = Boolean(transcription.active) && !transcription.finished;
            if (active) {
              if (
                state.transcriptionProgressLectureId !== normalizedId ||
                state.transcriptionProgressTimer === null
              ) {
                startTranscriptionProgress(normalizedId);
              }
            } else if (state.transcriptionProgressLectureId === normalizedId) {
              stopTranscriptionProgress({ preserveMessage: true });
            }
            await handleProgressUpdate(transcription, {
              source: 'transcription',
              lectureId: normalizedId,
            });
          }

          if (processing) {
            const active = Boolean(processing.active) && !processing.finished;
            if (active) {
              if (
                state.processingProgressLectureId !== normalizedId ||
                state.processingProgressTimer === null
              ) {
                startProcessingProgress(normalizedId);
              }
            } else if (state.processingProgressLectureId === normalizedId) {
              stopProcessingProgress({ preserveMessage: true });
            }
            await handleProgressUpdate(processing, {
              source: 'processing',
              lectureId: normalizedId,
            });
          }
        }

        function clearDetailPanel() {
          dom.summary.textContent = t('details.summaryPlaceholder');
          dom.summary.classList.add('placeholder');
          if (dom.editForm) {
            dom.editForm.reset();
          }
          dom.assetSection.hidden = true;
          dom.assetList.innerHTML = '';
          setTranscribeControls(null, null, null);
          setTranscribeButtonDisabled(true);
          stopTranscriptionProgress({ preserveMessage: true });
          stopProcessingProgress({ preserveMessage: true });
          state.selectedLectureDetail = null;
          updateEditControlsAvailability();
        }

        function updateEditControlsAvailability() {
          const hasSelection = Boolean(state.selectedLectureId);
          const allowEditing = state.editMode && hasSelection;
          dom.editForm.hidden = !allowEditing;
          dom.deleteButton.hidden = !allowEditing;
        }

        function updateEditModeUI() {
          const isActive = state.editMode;
          if (dom.editToggle) {
            dom.editToggle.textContent = isActive
              ? t('topBar.exitEdit')
              : t('topBar.enableEdit');
            dom.editToggle.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            dom.editToggle.classList.toggle('active', isActive);
          }
          if (dom.editBanner) {
            dom.editBanner.hidden = !isActive;
          }
          renderCurriculum();
          updateEditControlsAvailability();
        }

        function setActiveView(view) {
          if (!dom.views[view]) {
            return;
          }
          const previousView = state.activeView;
          if (previousView !== view) {
            if (previousView === 'storage') {
              storageStore.deactivate();
            }
            if (previousView === 'progress') {
              progressStore.deactivate();
            }
          }
          state.activeView = view;
          dom.viewButtons.forEach((button) => {
            const isActive = button.dataset.view === view;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
          if (dom.sidebarOverview) {
            dom.sidebarOverview.hidden = view !== 'settings';
          }
          Object.entries(dom.views).forEach(([key, element]) => {
            if (!element) {
              return;
            }
            const isActive = key === view;
            element.classList.toggle('active', isActive);
            element.hidden = !isActive;
          });
          if (view === 'storage') {
            storageStore.activate();
            const browserState = getStorageBrowserState();
            if (
              (!storageStore.initialized && !storageStore.loading) ||
              (!browserState.initialized && !browserState.loading)
            ) {
              void refreshStorage({ includeOverview: true, force: true });
            } else {
              renderStorage();
            }
            progressStore.deactivate();
          } else if (view === 'progress') {
            storageStore.deactivate();
            progressStore.activate();
            void refreshProgressQueue({ force: true });
            startProgressPolling();
          } else {
            storageStore.deactivate();
            progressStore.deactivate();
            if (view === 'details' && state.selectedLectureId) {
              void ensureLectureProgressPolling(state.selectedLectureId);
            }
          }
        }

        function updateStats() {
          const stats = state.stats;
          const entries = [
            [t('stats.classes'), stats.class_count],
            [t('stats.modules'), stats.module_count],
            [t('stats.lectures'), stats.lecture_count],
            [t('stats.transcripts'), stats.transcript_count],
            [t('stats.slideDecks'), stats.slide_count],
            [t('stats.audio'), stats.audio_count],
            [t('stats.processedAudio'), stats.processed_audio_count],
            [t('stats.notes'), stats.notes_count],
            [t('stats.slideArchives'), stats.slide_image_count],
          ];
          dom.stats.innerHTML = '';
          entries.forEach(([label, value]) => {
            const block = document.createElement('div');
            const term = document.createElement('dt');
            term.textContent = label;
            const data = document.createElement('dd');
            data.textContent = formatNumber(value);
            block.appendChild(term);
            block.appendChild(data);
            dom.stats.appendChild(block);
          });
        }

        function updateModuleOptions() {
          const modules = Array.from(state.moduleIndex.values());
          modules.sort((a, b) => a.label.localeCompare(b.label));

          dom.createModule.innerHTML = '';
          dom.editModule.innerHTML = '';

          const createPlaceholder = document.createElement('option');
          createPlaceholder.value = '';
          createPlaceholder.textContent = modules.length
            ? t('dropdowns.selectModule')
            : t('dropdowns.noModules');
          createPlaceholder.disabled = modules.length === 0;
          createPlaceholder.selected = true;
          dom.createModule.appendChild(createPlaceholder);

          modules.forEach((module) => {
            const option = document.createElement('option');
            option.value = String(module.id);
            option.textContent = module.label;
            dom.createModule.appendChild(option.cloneNode(true));
            dom.editModule.appendChild(option);
          });

          dom.createModule.disabled = modules.length === 0;
          dom.createSubmit.disabled = modules.length === 0;
        }

        function matchQuery(text, query) {
          return typeof text === 'string' && text.toLowerCase().includes(query);
        }

        function normalizePagination(window) {
          const offset = Number(window?.offset) || 0;
          const limit = Number(window?.limit) || 0;
          const total = Number(window?.total) || 0;
          const hasMore = Boolean(window?.has_more);
          const nextOffset =
            typeof window?.next_offset === 'number' ? Number(window.next_offset) : null;
          return { offset, limit, total, hasMore, nextOffset };
        }

        function setCurriculumWindow(pagination) {
          const normalized = normalizePagination(pagination || {});
          const target = state.curriculumWindow;
          target.offset = normalized.offset;
          target.limit = normalized.limit || CURRICULUM_PAGE_SIZE;
          target.total = normalized.total;
          target.hasMore = normalized.hasMore;
          target.nextOffset = normalized.nextOffset;
        }

        function setModuleWindow(classId, pagination) {
          if (classId == null) {
            return;
          }
          const key = String(classId);
          const normalized = normalizePagination(pagination || {});
          let target = state.moduleWindows.get(key);
          if (!target) {
            target = { loading: false };
            state.moduleWindows.set(key, target);
          }
          target.offset = normalized.offset;
          target.limit = normalized.limit || MODULE_PAGE_SIZE;
          target.total = normalized.total;
          target.hasMore = normalized.hasMore;
          target.nextOffset = normalized.nextOffset;
        }

        function setLectureWindow(moduleId, pagination) {
          if (moduleId == null) {
            return;
          }
          const key = String(moduleId);
          const normalized = normalizePagination(pagination || {});
          let target = state.lectureWindows.get(key);
          if (!target) {
            target = { loading: false };
            state.lectureWindows.set(key, target);
          }
          target.offset = normalized.offset;
          target.limit = normalized.limit || LECTURE_PAGE_SIZE;
          target.total = normalized.total;
          target.hasMore = normalized.hasMore;
          target.nextOffset = normalized.nextOffset;
        }

        function registerModuleIndexEntry(moduleRecord, classRecord) {
          if (!moduleRecord || moduleRecord.id == null) {
            return;
          }
          const moduleId = Number(moduleRecord.id);
          const className = classRecord?.name || '';
          const moduleName = moduleRecord.name || '';
          const label = className ? `${className} • ${moduleName}` : moduleName;
          state.moduleIndex.set(moduleId, { id: moduleId, label });
        }

        function computeFilteredClasses() {
          const query = state.query.trim().toLowerCase();
          if (!query) {
            return state.classes.map((klass) => ({
              class: klass,
              modules: (klass.modules || []).map((module) => ({
                module,
                lectures: module.lectures || [],
              })),
            }));
          }

          const filtered = [];
          state.classes.forEach((klass) => {
            const classMatch = matchQuery(klass.name, query) || matchQuery(klass.description, query);
            const modules = [];
            (klass.modules || []).forEach((module) => {
              const moduleMatch =
                classMatch || matchQuery(module.name, query) || matchQuery(module.description, query);
              let lectures = module.lectures || [];
              if (!moduleMatch) {
                lectures = (module.lectures || []).filter(
                  (lecture) =>
                    matchQuery(lecture.name, query) || matchQuery(lecture.description, query),
                );
              }
              if (moduleMatch && lectures.length === 0) {
                lectures = module.lectures || [];
              }
              if (lectures.length > 0) {
                modules.push({ module, lectures });
              }
            });
            if (modules.length > 0) {
              filtered.push({ class: klass, modules });
            }
          });
          return filtered;
        }

        function highlightSelected() {
          state.buttonMap.forEach((button, lectureId) => {
            if (lectureId === state.selectedLectureId) {
              button.classList.add('active');
              button.setAttribute('aria-current', 'true');
            } else {
              button.classList.remove('active');
              button.removeAttribute('aria-current');
            }
          });
        }

        function findModuleEntry(moduleId) {
          for (const classEntry of state.classes) {
            const modules = classEntry.modules || [];
            for (const moduleEntry of modules) {
              if (moduleEntry && moduleEntry.id === moduleId) {
                if (!Array.isArray(moduleEntry.lectures)) {
                  moduleEntry.lectures = [];
                }
                return { classEntry, moduleEntry };
              }
            }
          }
          return null;
        }

        function findLectureLocation(lectureId) {
          for (const classEntry of state.classes) {
            const modules = classEntry.modules || [];
            for (const moduleEntry of modules) {
              const lectures = moduleEntry.lectures || [];
              for (let index = 0; index < lectures.length; index += 1) {
                if (lectures[index].id === lectureId) {
                  return { classEntry, moduleEntry, index };
                }
              }
            }
          }
          return null;
        }

        function ensureLectureExpansion(lectureId) {
          if (!lectureId) {
            return false;
          }
          const location = findLectureLocation(lectureId);
          if (!location) {
            return false;
          }
          let changed = false;
          const classId = location.classEntry?.id != null ? String(location.classEntry.id) : null;
          if (classId) {
            if (state.expandedClasses.get(classId) !== true) {
              state.expandedClasses.set(classId, true);
              changed = true;
            }
          }
          const moduleId = location.moduleEntry?.id != null ? String(location.moduleEntry.id) : null;
          if (classId && moduleId) {
            const moduleKey = `${classId}:${moduleId}`;
            if (state.expandedModules.get(moduleKey) !== true) {
              state.expandedModules.set(moduleKey, true);
              changed = true;
            }
          }
          return changed;
        }

        function clearDragIndicators() {
          if (!dom.curriculum) {
            return;
          }
          dom.curriculum
            .querySelectorAll('.drop-before, .drop-after')
            .forEach((element) => element.classList.remove('drop-before', 'drop-after'));
          dom.curriculum
            .querySelectorAll('.syllabus-lectures.drop-target')
            .forEach((element) => element.classList.remove('drop-target'));
        }

        function createIconButton(label, icon, ...classNames) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = ['icon-button', ...classNames.filter(Boolean)].join(' ');
          button.setAttribute('aria-label', label);
          button.title = label;

          const iconSpan = document.createElement('span');
          iconSpan.className = 'icon';
          iconSpan.setAttribute('aria-hidden', 'true');
          iconSpan.textContent = icon;
          button.appendChild(iconSpan);

          const srLabel = document.createElement('span');
          srLabel.className = 'sr-only';
          srLabel.textContent = label;
          button.appendChild(srLabel);

          return button;
        }

        function calculateLectureDropPosition(container, moduleId, pointerY) {
          const moduleInfo = findModuleEntry(moduleId);
          if (!moduleInfo) {
            return { index: null, indicator: null, position: null };
          }

          const lectures = moduleInfo.moduleEntry.lectures || [];
          let index = lectures.length;
          let indicator = null;
          let position = null;

          for (let lectureIndex = 0; lectureIndex < lectures.length; lectureIndex += 1) {
            const lecture = lectures[lectureIndex];
            if (!lecture || lecture.id === state.draggingLectureId) {
              continue;
            }

            const element = container.querySelector(
              `.syllabus-lecture[data-lecture-id="${lecture.id}"]`,
            );
            if (!element) {
              continue;
            }

            const rect = element.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            if (typeof pointerY === 'number' && Number.isFinite(pointerY) && pointerY < midpoint) {
              index = lectureIndex;
              indicator = element;
              position = 'before';
              return { index, indicator, position };
            }

            index = lectureIndex + 1;
            indicator = element;
            position = 'after';
          }

          return { index, indicator: indicator ?? null, position };
        }

        function startLectureDrag(event, lecture, moduleId) {
          if (!state.editMode) {
            event.preventDefault();
            return;
          }
          state.draggingLectureId = lecture.id;
          state.draggingSourceModuleId = moduleId;
          state.draggedElement = event.currentTarget || null;
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            try {
              event.dataTransfer.setData('text/plain', String(lecture.id));
            } catch (error) {
              // Ignore data transfer errors in unsupported browsers.
            }
          }
          if (state.draggedElement) {
            state.draggedElement.classList.add('dragging');
          }
        }

        function clearLectureDrag(event) {
          const element = (event && event.currentTarget) || state.draggedElement;
          if (element) {
            element.classList.remove('dragging');
          }
          state.draggingLectureId = null;
          state.draggingSourceModuleId = null;
          state.draggedElement = null;
          clearDragIndicators();
        }

        function handleLectureDragOver(event) {
          if (!state.editMode || !state.draggingLectureId) {
            return;
          }
          event.preventDefault();
          if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
          }
          const container = event.currentTarget;
          if (!container || !container.classList) {
            return;
          }
          container.classList.add('drop-target');
          container
            .querySelectorAll('.drop-before, .drop-after')
            .forEach((element) => element.classList.remove('drop-before', 'drop-after'));
          const moduleId = Number(container.dataset.moduleId);
          if (!Number.isFinite(moduleId)) {
            return;
          }
          const { indicator, position } = calculateLectureDropPosition(
            container,
            moduleId,
            event.clientY,
          );
          if (!indicator || !position) {
            return;
          }
          indicator.classList.add(position === 'before' ? 'drop-before' : 'drop-after');
        }

        function handleLectureDragLeave(event) {
          const container = event.currentTarget;
          if (!container) {
            return;
          }
          const related = event.relatedTarget;
          if (!related || (!container.contains(related) && related !== container)) {
            container.classList.remove('drop-target');
            container
              .querySelectorAll('.drop-before, .drop-after')
              .forEach((element) => element.classList.remove('drop-before', 'drop-after'));
          }
        }

        async function handleLectureDrop(event, targetModuleId) {
          if (!state.editMode || !state.draggingLectureId) {
            return;
          }
          event.preventDefault();
          const container = event.currentTarget;
          if (container) {
            container.classList.remove('drop-target');
            container
              .querySelectorAll('.drop-before, .drop-after')
              .forEach((element) => element.classList.remove('drop-before', 'drop-after'));
          }
          let targetIndex = null;
          if (container) {
            const { index } = calculateLectureDropPosition(container, targetModuleId, event.clientY);
            if (typeof index === 'number' && Number.isFinite(index)) {
              targetIndex = index;
            }
          }
          await performLectureReorder(state.draggingLectureId, targetModuleId, targetIndex);
        }

        async function performLectureReorder(lectureId, targetModuleId, targetIndex) {
          const sourceInfo = findLectureLocation(lectureId);
          const targetInfo = findModuleEntry(targetModuleId);
          if (!sourceInfo || !targetInfo) {
            clearDragIndicators();
            return;
          }

          const sourceModuleId = sourceInfo.moduleEntry.id;
          if (!Array.isArray(sourceInfo.moduleEntry.lectures)) {
            sourceInfo.moduleEntry.lectures = [];
          }
          if (!Array.isArray(targetInfo.moduleEntry.lectures)) {
            targetInfo.moduleEntry.lectures = [];
          }
          const sourceLectures = sourceInfo.moduleEntry.lectures;
          const targetLectures = targetInfo.moduleEntry.lectures;

          let insertionIndex =
            typeof targetIndex === 'number' && Number.isFinite(targetIndex)
              ? targetIndex
              : targetLectures.length;

          if (sourceModuleId === targetModuleId) {
            if (insertionIndex > sourceInfo.index) {
              insertionIndex -= 1;
            }
            if (insertionIndex === sourceInfo.index) {
              clearDragIndicators();
              return;
            }
          }

          const lectureRecord = sourceLectures[sourceInfo.index];
          sourceLectures.splice(sourceInfo.index, 1);

          if (insertionIndex < 0 || insertionIndex > targetLectures.length) {
            insertionIndex = targetLectures.length;
          }

          lectureRecord.module_id = targetModuleId;
          targetLectures.splice(insertionIndex, 0, lectureRecord);

          if (state.draggedElement) {
            state.draggedElement.classList.remove('dragging');
          }

          const modulesToUpdate = new Map();
          modulesToUpdate.set(sourceModuleId, sourceInfo.moduleEntry);
          modulesToUpdate.set(targetModuleId, targetInfo.moduleEntry);

          sourceInfo.moduleEntry.lecture_count = sourceLectures.length;
          targetInfo.moduleEntry.lecture_count = targetLectures.length;

          state.draggingLectureId = null;
          state.draggingSourceModuleId = null;
          state.draggedElement = null;

          renderCurriculum();

          const payload = {
            modules: Array.from(modulesToUpdate.values()).map((moduleEntry) => ({
              module_id: moduleEntry.id,
              lecture_ids: (moduleEntry.lectures || []).map((item) => item.id),
            })),
          };

          try {
            await request('/api/lectures/reorder', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            await refreshData();
            showStatus(t('status.lectureReordered'), 'success');
          } catch (error) {
            showStatus(error.message, 'error');
            await refreshData();
          }
        }

        class CurriculumVirtualizer {
          constructor(root) {
            this.root = root;
            this.entryMap = new Map();
            this.moduleMap = new Map();
            this.classLoadTargets = new Map();
            this.moduleLoadTargets = new Map();
            this.lectureLoadTargets = new Map();
            this.scrollRoot = this.findScrollRoot(root);
            const observerOptions = { root: this.scrollRoot, threshold: 0.1 };
            this.classObserver = new IntersectionObserver(
              (entries) => this.handleClassIntersection(entries),
              observerOptions,
            );
            this.moduleObserver = new IntersectionObserver(
              (entries) => this.handleModuleIntersection(entries),
              observerOptions,
            );
            const loadOptions = { root: this.scrollRoot, threshold: 0.25 };
            this.loadMoreObserver = new IntersectionObserver(
              (entries) => this.handleLoadMoreIntersection(entries),
              loadOptions,
            );
            this.moduleLoadObserver = new IntersectionObserver(
              (entries) => this.handleModuleLoadIntersection(entries),
              loadOptions,
            );
            this.lectureLoadObserver = new IntersectionObserver(
              (entries) => this.handleLectureLoadIntersection(entries),
              loadOptions,
            );
          }

          findScrollRoot(element) {
            if (!element || typeof window === 'undefined') {
              return null;
            }
            let node = element;
            while (node && node !== document.body) {
              const style = window.getComputedStyle(node);
              const overflowY = style?.overflowY || '';
              if (overflowY === 'auto' || overflowY === 'scroll') {
                return node;
              }
              node = node.parentElement;
            }
            return null;
          }

          resetObservers() {
            this.classObserver.disconnect();
            this.moduleObserver.disconnect();
            this.loadMoreObserver.disconnect();
            this.moduleLoadObserver.disconnect();
            this.lectureLoadObserver.disconnect();
          }

          render(entries, { editMode }) {
            if (!this.root) {
              return;
            }
            this.resetObservers();
            this.entryMap.clear();
            this.moduleMap.clear();
            this.classLoadTargets.clear();
            this.moduleLoadTargets.clear();
            this.lectureLoadTargets.clear();
            state.buttonMap.clear();
            this.root.innerHTML = '';

            const fragment = document.createDocumentFragment();

            if (editMode) {
              fragment.appendChild(this.buildToolbar());
            }

            if (!entries.length) {
              fragment.appendChild(this.buildEmptyState());
              this.root.appendChild(fragment);
              highlightSelected();
              return;
            }

            const syllabus = document.createElement('div');
            syllabus.className = 'syllabus';

            entries.forEach((entry) => {
              const classRecord = entry?.class;
              if (!classRecord || classRecord.id == null) {
                return;
              }
              const classId = Number(classRecord.id);
              this.entryMap.set(classId, entry);
              const classNode = this.buildClassNode(entry, editMode);
              syllabus.appendChild(classNode);
              this.classObserver.observe(classNode);
              if (classNode.open) {
                this.renderModulesForClass(classNode);
              }
            });

            if (state.curriculumWindow.hasMore) {
              const sentinel = this.createSentinel();
              this.classLoadTargets.set(sentinel, true);
              this.loadMoreObserver.observe(sentinel);
              syllabus.appendChild(sentinel);
            }

            fragment.appendChild(syllabus);
            this.root.appendChild(fragment);
            highlightSelected();
          }

          buildToolbar() {
            const toolbar = document.createElement('div');
            toolbar.className = 'curriculum-toolbar';

            const heading = document.createElement('h3');
            heading.textContent = t('curriculum.manageHeading');
            toolbar.appendChild(heading);

            const actions = document.createElement('div');
            actions.className = 'curriculum-toolbar-actions';

            const addClassButton = createIconButton(t('curriculum.addClass'), '+');
            addClassButton.addEventListener('click', (event) => {
              event.preventDefault();
              handleAddClass();
            });
            actions.appendChild(addClassButton);

            toolbar.appendChild(actions);
            return toolbar;
          }

          buildEmptyState() {
            const message = document.createElement('div');
            message.className = 'placeholder';
            message.textContent = state.classes.length
              ? t('placeholders.noLecturesFilter')
              : t('placeholders.noClasses');
            return message;
          }

          buildClassNode(entry, editMode) {
            const classRecord = entry.class;
            const classId = Number(classRecord.id);
            const classDetails = document.createElement('details');
            classDetails.className = 'syllabus-class';
            classDetails.dataset.classId = String(classId);

            const hasSelection = entry.modules.some((moduleEntry) =>
              (moduleEntry.lectures || []).some(
                (lecture) => lecture.id === state.selectedLectureId,
              ),
            );
            let expandClass = hasSelection;
            const storedValue = state.expandedClasses.get(String(classId));
            if (typeof storedValue === 'boolean') {
              expandClass = storedValue;
            }
            if (hasSelection) {
              expandClass = true;
              state.expandedClasses.set(String(classId), true);
            }
            classDetails.open = expandClass;

            const summary = document.createElement('summary');
            summary.className = 'syllabus-summary';

            const summaryText = document.createElement('div');
            summaryText.className = 'syllabus-summary-text';

            const title = document.createElement('span');
            title.className = 'syllabus-title';
            title.textContent = classRecord.name;
            summaryText.appendChild(title);

            const moduleCount = Number(classRecord.module_count ?? entry.modules.length);
            const lectureCount =
              Number(classRecord.lecture_count) ||
              entry.modules.reduce(
                (total, moduleEntry) =>
                  total +
                  Number(moduleEntry.module?.lecture_count ?? moduleEntry.lectures.length),
                0,
              );
            const moduleWord = pluralize(currentLanguage, 'counts.module', moduleCount);
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
            const meta = document.createElement('span');
            meta.className = 'syllabus-meta';
            meta.textContent = t('curriculum.classMeta', {
              moduleCount,
              moduleWord,
              lectureCount,
              lectureWord,
            });
            summaryText.appendChild(meta);

            summary.appendChild(summaryText);

            if (classRecord.description) {
              const description = document.createElement('p');
              description.className = 'syllabus-description';
              description.textContent = classRecord.description;
              summary.appendChild(description);
            }

            if (editMode) {
              const actions = document.createElement('div');
              actions.className = 'syllabus-actions';

              const addModuleButton = createIconButton(t('curriculum.addModule'), '+');
              addModuleButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handleAddModule(classRecord);
              });
              actions.appendChild(addModuleButton);

              const deleteClassButton = createIconButton(t('common.actions.delete'), '×', 'danger');
              deleteClassButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDeleteClass(entry);
              });
              actions.appendChild(deleteClassButton);

              summary.appendChild(actions);
            }

            classDetails.appendChild(summary);

            const content = document.createElement('div');
            content.className = 'syllabus-content';
            const modulesContainer = document.createElement('div');
            modulesContainer.className = 'syllabus-modules';
            content.appendChild(modulesContainer);
            classDetails.appendChild(content);

            classDetails.addEventListener('toggle', () => {
              state.expandedClasses.set(String(classId), classDetails.open);
              if (classDetails.open) {
                this.renderModulesForClass(classDetails);
              } else {
                this.clearModulesForClass(classDetails);
              }
            });

            return classDetails;
          }

          clearModulesForClass(classElement) {
            const classId = Number(classElement.dataset.classId);
            const modulesContainer = classElement.querySelector('.syllabus-modules');
            if (modulesContainer) {
              modulesContainer.querySelectorAll('.syllabus-module').forEach((moduleElement) => {
                this.moduleObserver.unobserve(moduleElement);
              });
              modulesContainer.querySelectorAll('.virtual-scroll-sentinel').forEach((sentinel) => {
                this.moduleLoadObserver.unobserve(sentinel);
                this.moduleLoadTargets.delete(sentinel);
              });
              modulesContainer.innerHTML = '';
            }
            this.moduleMap.forEach((value, key) => {
              if (value.classId === classId) {
                this.moduleMap.delete(key);
              }
            });
          }

          renderModulesForClass(classElement) {
            if (!classElement.open) {
              return;
            }
            const classId = Number(classElement.dataset.classId);
            const entry = this.entryMap.get(classId);
            const modulesContainer = classElement.querySelector('.syllabus-modules');
            if (!entry || !modulesContainer) {
              return;
            }

            modulesContainer.querySelectorAll('.syllabus-module').forEach((moduleElement) => {
              this.moduleObserver.unobserve(moduleElement);
            });
            modulesContainer.querySelectorAll('.virtual-scroll-sentinel').forEach((sentinel) => {
              this.moduleLoadObserver.unobserve(sentinel);
            });
            modulesContainer.innerHTML = '';

            const modules = Array.isArray(entry.modules) ? entry.modules : [];
            if (!modules.length) {
              const placeholder = document.createElement('div');
              placeholder.className = 'placeholder';
              placeholder.textContent = t('placeholders.noModules');
              modulesContainer.appendChild(placeholder);
            } else {
              modules.forEach((moduleEntry) => {
                const moduleElement = this.buildModuleNode(entry, moduleEntry, classId);
                modulesContainer.appendChild(moduleElement);
                this.moduleObserver.observe(moduleElement);
                if (moduleElement.open) {
                  this.renderLecturesForModule(moduleElement);
                }
              });
            }

            const moduleWindow = state.moduleWindows.get(String(classId));
            if (moduleWindow && moduleWindow.hasMore) {
              const sentinel = this.createSentinel();
              this.moduleLoadTargets.set(sentinel, { classId });
              this.moduleLoadObserver.observe(sentinel);
              modulesContainer.appendChild(sentinel);
            }
          }

          buildModuleNode(classEntry, moduleEntry, classId) {
            const moduleRecord = moduleEntry.module;
            const moduleId = Number(moduleRecord.id);
            const moduleDetails = document.createElement('details');
            moduleDetails.className = 'syllabus-module';
            moduleDetails.dataset.classId = String(classId);
            moduleDetails.dataset.moduleId = String(moduleId);

            const moduleHasSelection = (moduleEntry.lectures || []).some(
              (lecture) => lecture.id === state.selectedLectureId,
            );
            const moduleKey = `${classId}:${moduleId}`;
            let expandModule = moduleHasSelection;
            const storedValue = state.expandedModules.get(moduleKey);
            if (typeof storedValue === 'boolean') {
              expandModule = storedValue;
            }
            if (moduleHasSelection) {
              expandModule = true;
              state.expandedModules.set(moduleKey, true);
            }
            moduleDetails.open = expandModule;

            const summary = document.createElement('summary');
            summary.className = 'syllabus-summary';

            const summaryText = document.createElement('div');
            summaryText.className = 'syllabus-summary-text';

            const title = document.createElement('span');
            title.className = 'syllabus-title';
            title.textContent = moduleRecord.name;
            summaryText.appendChild(title);

            const lectureCount = Number(moduleRecord.lecture_count ?? moduleEntry.lectures.length);
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
            const meta = document.createElement('span');
            meta.className = 'syllabus-meta';
            meta.textContent = t('curriculum.moduleMeta', {
              lectureCount,
              lectureWord,
            });
            summaryText.appendChild(meta);

            summary.appendChild(summaryText);

            if (moduleRecord.description) {
              const description = document.createElement('p');
              description.className = 'syllabus-description';
              description.textContent = moduleRecord.description;
              summary.appendChild(description);
            }

            if (state.editMode) {
              const actions = document.createElement('div');
              actions.className = 'syllabus-actions';

              const deleteModuleButton = createIconButton(
                t('common.actions.delete'),
                '×',
                'danger',
              );
              deleteModuleButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handleDeleteModule(moduleEntry, classEntry.class);
              });
              actions.appendChild(deleteModuleButton);

              summary.appendChild(actions);
            }

            moduleDetails.appendChild(summary);

            const moduleContent = document.createElement('div');
            moduleContent.className = 'syllabus-content';

            const lectureHost = document.createElement('div');
            lectureHost.className = 'lecture-host';
            moduleContent.appendChild(lectureHost);

            moduleDetails.appendChild(moduleContent);

            moduleDetails.addEventListener('toggle', () => {
              state.expandedModules.set(moduleKey, moduleDetails.open);
              if (moduleDetails.open) {
                this.renderLecturesForModule(moduleDetails);
              } else {
                this.clearLecturesForModule(moduleDetails);
              }
            });

            this.moduleMap.set(moduleId, { classId, entry: moduleEntry });
            return moduleDetails;
          }

          clearLecturesForModule(moduleElement) {
            const moduleId = Number(moduleElement.dataset.moduleId);
            const host = moduleElement.querySelector('.lecture-host');
            if (host) {
              host.querySelectorAll('.virtual-scroll-sentinel').forEach((sentinel) => {
                this.lectureLoadObserver.unobserve(sentinel);
                this.lectureLoadTargets.delete(sentinel);
              });
              host.innerHTML = '';
            }
            const moduleInfo = this.moduleMap.get(moduleId);
            if (moduleInfo?.entry?.lectures) {
              moduleInfo.entry.lectures.forEach((lecture) => {
                state.buttonMap.delete(lecture.id);
              });
            }
          }

          renderLecturesForModule(moduleElement) {
            if (!moduleElement.open) {
              return;
            }
            const moduleId = Number(moduleElement.dataset.moduleId);
            const moduleInfo = this.moduleMap.get(moduleId);
            if (!moduleInfo) {
              return;
            }
            const classId = moduleInfo.classId;
            const host = moduleElement.querySelector('.lecture-host');
            if (!host) {
              return;
            }

            host.querySelectorAll('.virtual-scroll-sentinel').forEach((sentinel) => {
              this.lectureLoadObserver.unobserve(sentinel);
            });
            host.innerHTML = '';

            const moduleEntry = moduleInfo.entry;
            const lectures = Array.isArray(moduleEntry.lectures) ? moduleEntry.lectures : [];
            const lectureList = document.createElement('ul');
            lectureList.className = 'syllabus-lectures';
            lectureList.dataset.moduleId = String(moduleId);

            if (!lectures.length) {
              lectureList.classList.add('empty');
              const empty = document.createElement('li');
              empty.className = 'placeholder';
              empty.textContent = t('placeholders.noLectures');
              empty.setAttribute('aria-hidden', 'true');
              lectureList.appendChild(empty);
            } else {
              lectures.forEach((lecture) => {
                const lectureItem = document.createElement('li');
                lectureItem.className = 'syllabus-lecture';
                lectureItem.dataset.lectureId = String(lecture.id);

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'lecture-button';
                button.textContent = lecture.name;
                button.addEventListener('click', (event) => {
                  event.preventDefault();
                  selectLecture(lecture.id);
                });
                lectureItem.appendChild(button);
                state.buttonMap.set(lecture.id, button);

                if (state.editMode) {
                  lectureItem.draggable = true;
                  lectureItem.addEventListener('dragstart', (event) => {
                    startLectureDrag(event, lecture, moduleEntry.module.id);
                  });
                  lectureItem.addEventListener('dragend', clearLectureDrag);

                  const deleteLectureButton = createIconButton(
                    t('common.actions.delete'),
                    '×',
                    'danger',
                  );
                  deleteLectureButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const classRecord = this.entryMap.get(classId)?.class;
                    handleDeleteLecture(lecture, moduleEntry.module, classRecord);
                  });
                  lectureItem.appendChild(deleteLectureButton);
                }

                lectureList.appendChild(lectureItem);
              });
            }

            if (state.editMode) {
              const dropHandler = (event) => handleLectureDrop(event, moduleEntry.module.id);
              lectureList.addEventListener('dragover', handleLectureDragOver);
              lectureList.addEventListener('dragleave', handleLectureDragLeave);
              lectureList.addEventListener('drop', dropHandler);
            }

            host.appendChild(lectureList);

            const lectureWindow = state.lectureWindows.get(String(moduleId));
            if (lectureWindow && lectureWindow.hasMore) {
              const sentinel = this.createSentinel();
              this.lectureLoadTargets.set(sentinel, { classId, moduleId });
              this.lectureLoadObserver.observe(sentinel);
              host.appendChild(sentinel);
            }

            highlightSelected();
          }

          createSentinel() {
            const sentinel = document.createElement('div');
            sentinel.className = 'virtual-scroll-sentinel';
            sentinel.setAttribute('aria-hidden', 'true');
            sentinel.style.height = '1px';
            sentinel.style.width = '100%';
            return sentinel;
          }

          handleClassIntersection(entries) {
            entries.forEach((entry) => {
              const target = entry.target;
              if (!(target instanceof HTMLElement)) {
                return;
              }
              if (entry.isIntersecting && target.open) {
                this.renderModulesForClass(target);
              } else if (!entry.isIntersecting) {
                this.clearModulesForClass(target);
              }
            });
          }

          handleModuleIntersection(entries) {
            entries.forEach((entry) => {
              const target = entry.target;
              if (!(target instanceof HTMLElement)) {
                return;
              }
              if (entry.isIntersecting && target.open) {
                this.renderLecturesForModule(target);
              } else if (!entry.isIntersecting) {
                this.clearLecturesForModule(target);
              }
            });
          }

          handleLoadMoreIntersection(entries) {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) {
                return;
              }
              if (this.classLoadTargets.has(entry.target)) {
                loadMoreClasses();
              }
            });
          }

          handleModuleLoadIntersection(entries) {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) {
                return;
              }
              const info = this.moduleLoadTargets.get(entry.target);
              if (info && info.classId != null) {
                loadMoreModules(info.classId);
              }
            });
          }

          handleLectureLoadIntersection(entries) {
            entries.forEach((entry) => {
              if (!entry.isIntersecting) {
                return;
              }
              const info = this.lectureLoadTargets.get(entry.target);
              if (info && info.classId != null && info.moduleId != null) {
                loadMoreLectures(info.classId, info.moduleId);
              }
            });
          }
        }

        function getCurriculumVirtualizer() {
          if (state.curriculumVirtualizer && state.curriculumVirtualizer.root !== dom.curriculum) {
            state.curriculumVirtualizer = null;
          }
          if (!state.curriculumVirtualizer && dom.curriculum) {
            state.curriculumVirtualizer = new CurriculumVirtualizer(dom.curriculum);
          }
          return state.curriculumVirtualizer;
        }

        function recordCurriculumRender(duration, count) {
          state.curriculumRenderMetrics.push({
            timestamp: Date.now(),
            duration,
            count,
          });
          if (state.curriculumRenderMetrics.length > 25) {
            state.curriculumRenderMetrics.shift();
          }
          if (typeof console !== 'undefined' && console.debug) {
            console.debug('[curriculum] render', `${duration.toFixed(2)}ms`, { count });
          }
        }

        function renderCurriculum() {
          if (!dom.curriculum) {
            return;
          }
          const filtered = computeFilteredClasses();
          const virtualizer = getCurriculumVirtualizer();
          const hasPerformance =
            typeof performance !== 'undefined' &&
            typeof performance.now === 'function';
          const now = hasPerformance ? () => performance.now() : () => Date.now();
          const start = now();
          const canMark = hasPerformance && typeof performance.mark === 'function';
          if (canMark) {
            performance.mark('curriculum-render-start');
          }
          virtualizer.render(filtered, { editMode: state.editMode });
          let duration = now() - start;
          const canMeasure =
            canMark && typeof performance.measure === 'function' && typeof performance.clearMarks === 'function';
          if (canMeasure && typeof performance.clearMeasures === 'function') {
            performance.mark('curriculum-render-end');
            const measure = performance.measure(
              'curriculum-render',
              'curriculum-render-start',
              'curriculum-render-end',
            );
            duration = measure.duration;
            performance.clearMarks('curriculum-render-start');
            performance.clearMarks('curriculum-render-end');
            performance.clearMeasures('curriculum-render');
          }
          recordCurriculumRender(duration, filtered.length);
        }

        function pruneExpansionState() {
          const classIds = new Set(
            state.classes.map((klass) => (klass?.id != null ? String(klass.id) : null)).filter(Boolean),
          );
          state.expandedClasses.forEach((_, key) => {
            if (!classIds.has(key)) {
              state.expandedClasses.delete(key);
            }
          });

          const moduleKeys = new Set();
          state.classes.forEach((klass) => {
            const classId = klass?.id != null ? String(klass.id) : null;
            if (!classId) {
              return;
            }
            (klass.modules || []).forEach((module) => {
              if (module?.id == null) {
                return;
              }
              moduleKeys.add(`${classId}:${module.id}`);
            });
          });
          state.expandedModules.forEach((_, key) => {
            if (!moduleKeys.has(key)) {
              state.expandedModules.delete(key);
            }
          });
        }

        function requireEditMode(message = t('status.requireEdit')) {
          if (!state.editMode) {
            showStatus(message, 'info');
            return false;
          }
          return true;
        }

        async function handleAddClass() {
          if (!requireEditMode()) {
            return;
          }
          const name = await promptDialog({
            title: t('dialogs.createClass.title'),
            message: t('dialogs.createClass.message'),
            confirmText: t('common.actions.create'),
            placeholder: t('dialogs.createClass.placeholder'),
            required: true,
          });
          if (!name || !name.trim()) {
            return;
          }
          try {
            await request('/api/classes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: name.trim() }),
            });
            showStatus(t('status.classCreated'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleAddModule(classRecord) {
          if (!requireEditMode()) {
            return;
          }
          const name = await promptDialog({
            title: t('dialogs.createModule.title'),
            message: t('dialogs.createModule.message', { className: classRecord.name }),
            confirmText: t('common.actions.create'),
            placeholder: t('dialogs.createModule.placeholder'),
            required: true,
          });
          if (!name || !name.trim()) {
            return;
          }
          try {
            await request('/api/modules', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                class_id: classRecord.id,
                name: name.trim(),
              }),
            });
            showStatus(t('status.moduleCreated'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleDeleteClass(classEntry) {
          if (!requireEditMode()) {
            return;
          }
          const moduleCount =
            classEntry?.class?.module_count != null
              ? Number(classEntry.class.module_count)
              : classEntry.modules.length;
          const lectureCount =
            classEntry?.class?.lecture_count != null
              ? Number(classEntry.class.lecture_count)
              : classEntry.modules.reduce(
                  (total, moduleEntry) =>
                    total +
                    Number(
                      moduleEntry.module?.lecture_count ?? moduleEntry.lectures?.length ?? 0,
                    ),
                  0,
                );
          const moduleWord = pluralize(currentLanguage, 'counts.module', moduleCount);
          const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
          let message = t('dialogs.deleteClass.message', { className: classEntry.class.name });
          if (moduleCount || lectureCount) {
            message += `\n\n${t('dialogs.deleteClass.summary', {
              moduleCount,
              moduleWord,
              lectureCount,
              lectureWord,
            })}`;
          }
          const confirmed = await confirmDialog({
            title: t('dialogs.deleteClass.title'),
            message,
            confirmText: t('common.actions.delete'),
            cancelText: t('dialogs.deleteClass.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          try {
            await request(`/api/classes/${classEntry.class.id}`, { method: 'DELETE' });
            if (state.selectedLectureId) {
              const removed = classEntry.modules.some((moduleEntry) =>
                (moduleEntry.lectures || []).some(
                  (lecture) => lecture.id === state.selectedLectureId,
                ),
              );
              if (removed) {
                state.selectedLectureId = null;
                clearDetailPanel();
              }
            }
            showStatus(t('status.classRemoved'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleDeleteModule(moduleEntry, classRecord) {
          if (!requireEditMode()) {
            return;
          }
          const lectureCount =
            moduleEntry?.module?.lecture_count != null
              ? Number(moduleEntry.module.lecture_count)
              : moduleEntry.lectures.length;
          const classContext = classRecord
            ? t('dialogs.deleteModule.classContext', { className: classRecord.name })
            : '';
          let message = t('dialogs.deleteModule.message', {
            moduleName: moduleEntry.module.name,
            classContext,
          });
          if (lectureCount) {
            const lectureWord = pluralize(currentLanguage, 'counts.lecture', lectureCount);
            message += `\n\n${t('dialogs.deleteModule.summary', {
              lectureCount,
              lectureWord,
            })}`;
          }
          const confirmed = await confirmDialog({
            title: t('dialogs.deleteModule.title'),
            message,
            confirmText: t('common.actions.delete'),
            cancelText: t('dialogs.deleteModule.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          try {
            await request(`/api/modules/${moduleEntry.module.id}`, { method: 'DELETE' });
            if (state.selectedLectureId) {
              const removed = (moduleEntry.lectures || []).some(
                (lecture) => lecture.id === state.selectedLectureId,
              );
              if (removed) {
                state.selectedLectureId = null;
                clearDetailPanel();
              }
            }
            showStatus(t('status.moduleRemoved'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleAddLecture(moduleRecord, classRecord) {
          if (!requireEditMode()) {
            return;
          }
          const contextParts = classRecord
            ? [classRecord.name, moduleRecord.name]
            : [moduleRecord.name];
          const namePrompt = contextParts.join(' • ');
          const name = await promptDialog({
            title: t('dialogs.createLecture.title'),
            message: t('dialogs.createLecture.message', { context: namePrompt }),
            confirmText: t('common.actions.create'),
            placeholder: t('dialogs.createLecture.placeholder'),
            required: true,
          });
          if (!name || !name.trim()) {
            return;
          }
          const description =
            (await promptDialog({
              title: t('dialogs.lectureDescription.title'),
              message: t('dialogs.descriptionOptional'),
              confirmText: t('common.actions.save'),
              cancelText: t('common.actions.skip'),
              placeholder: t('dialogs.lectureDescription.placeholder'),
            })) ?? '';
          try {
            const payload = await request('/api/lectures', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                module_id: moduleRecord.id,
                name: name.trim(),
                description: description.trim(),
              }),
            });
            showStatus(t('status.lectureCreated'), 'success');
            await refreshData();
            const newLectureId = payload?.lecture?.id;
            if (newLectureId) {
              await selectLecture(newLectureId);
            }
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleDeleteLecture(lecture, moduleRecord, classRecord) {
          if (!requireEditMode()) {
            return;
          }
          const contextParts = [lecture.name];
          if (moduleRecord) {
            contextParts.push(moduleRecord.name);
          }
          if (classRecord) {
            contextParts.push(classRecord.name);
          }
          const context = contextParts.join(' • ');
          const confirmed = await confirmDialog({
            title: t('dialogs.deleteLecture.title'),
            message: t('dialogs.deleteLecture.message', { context }),
            confirmText: t('common.actions.delete'),
            cancelText: t('dialogs.deleteLecture.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          try {
            await request(`/api/lectures/${lecture.id}`, { method: 'DELETE' });
            if (state.selectedLectureId === lecture.id) {
              state.selectedLectureId = null;
              clearDetailPanel();
            }
            showStatus(t('status.lectureRemoved'), 'success');
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        function applyTheme(theme) {
          const target = theme || 'system';
          document.body.dataset.theme = target;
        }

        async function loadSettings() {
          try {
            const payload = await request('/api/settings');
            const settings = payload?.settings;
            if (!settings) {
              return;
            }
            await syncSettingsForm(settings);
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        function renderAssets(lecture) {
          dom.assetList.innerHTML = '';
          setTranscribeControls(null, null, null);
          assetDefinitions.forEach((definition) => {
            const value = lecture[definition.key];
            if (
              definition.type === 'processed_audio' &&
              (!value || value === lecture.audio_path)
            ) {
              return;
            }
            const item = document.createElement('li');
            item.className = 'asset-item';
            const header = document.createElement('div');
            header.className = 'asset-header';
            header.textContent = t(definition.labelKey);
            item.appendChild(header);

            const status = document.createElement('div');
            status.className = 'asset-status';
            let statusText = t('assets.status.notLinked');
            if (value) {
              const fileName = value.split('/').pop();
              if (definition.type === 'slides') {
                statusText = t('assets.status.slidesUploaded', { name: fileName });
              } else if (definition.type === 'slide_bundle') {
                statusText = t('assets.status.archiveCreated', { name: fileName });
              } else if (definition.type === 'processed_audio') {
                statusText = t('assets.status.mastered', { name: fileName });
              } else {
                statusText = t('assets.status.linked', { name: fileName });
              }
            } else if (definition.type === 'slides') {
              statusText = t('assets.status.slidesHint');
            } else if (definition.type === 'slide_bundle') {
              statusText = t('assets.status.noSlideImages');
            }
            status.textContent = statusText;
            item.appendChild(status);

            const actions = document.createElement('div');
            actions.className = 'asset-actions';

            let transcribeButton = null;
            let modelLabel = null;
            let modelSelect = null;
            let gpuOption = null;

            if (definition.accept) {
              const uploadButton = document.createElement('button');
              uploadButton.type = 'button';
              uploadButton.className = 'secondary';
              uploadButton.textContent = t('assets.actions.upload');
              uploadButton.addEventListener('click', () => {
                handleAssetUpload(definition);
              });
              actions.appendChild(uploadButton);
            }

            if (definition.type === 'audio') {
              transcribeButton = document.createElement('button');
              transcribeButton.type = 'button';
              transcribeButton.className = 'secondary';
              transcribeButton.setAttribute('data-i18n', 'assets.transcribe');
              transcribeButton.textContent = t('assets.transcribe');
              transcribeButton.disabled = !value;
              actions.appendChild(transcribeButton);

              modelLabel = document.createElement('label');
              modelLabel.className = 'inline';
              modelLabel.textContent = t('assets.modelLabel');
              modelLabel.setAttribute('for', 'transcribe-model');
              modelLabel.style.marginLeft = 'auto';

              modelSelect = document.createElement('select');
              modelSelect.id = 'transcribe-model';
              const modelChoices = ['tiny', 'base', 'small', 'medium', 'large', 'gpu'];
              modelChoices.forEach((choice) => {
                const option = document.createElement('option');
                option.value = choice;
                option.setAttribute('data-i18n', `assets.model.${choice}`);
                option.textContent = t(`assets.model.${choice}`);
                if (choice === GPU_MODEL) {
                  option.classList.add('gpu-only');
                  option.disabled = true;
                  gpuOption = option;
                }
                modelSelect.appendChild(option);
              });
              const requestedModel = normalizeWhisperModel(
                state.settings?.whisper_model_requested || state.settings?.whisper_model,
              );
              modelSelect.value = requestedModel;
              modelLabel.appendChild(modelSelect);
            }

            const downloadButton = document.createElement('button');
            downloadButton.type = 'button';
            downloadButton.className = 'secondary';
            downloadButton.textContent = t('assets.actions.download');
            downloadButton.disabled = !value;
            downloadButton.addEventListener('click', () => {
              if (!value) {
                return;
              }
              const downloadUrl = buildStorageURL(value);
              const fallbackName = definition.type ? `${definition.type}.bin` : 'asset.bin';
              const fileName = value.split('/').pop() || fallbackName;
              const anchor = document.createElement('a');
              anchor.href = downloadUrl;
              anchor.download = fileName;
              anchor.rel = 'noopener';
              anchor.style.display = 'none';
              document.body.appendChild(anchor);
              anchor.click();
              anchor.remove();
            });

            if (definition.type === 'slides') {
              const isProcessing = state.processingProgressLectureId === lecture.id;
              const processSlidesButton = document.createElement('button');
              processSlidesButton.type = 'button';
              processSlidesButton.className = 'secondary';
              processSlidesButton.setAttribute('data-i18n', 'assets.actions.processSlides');
              processSlidesButton.textContent = t('assets.actions.processSlides');
              processSlidesButton.disabled = !value || isProcessing;
              processSlidesButton.addEventListener('click', () => {
                handleSlideProcessing(definition);
              });
              actions.appendChild(processSlidesButton);
            }

            actions.appendChild(downloadButton);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'danger';
            removeButton.textContent = t('assets.actions.remove');
            removeButton.disabled = !value;
            removeButton.addEventListener('click', () => {
              if (!value) {
                return;
              }
              handleAssetRemoval(definition);
            });
            actions.appendChild(removeButton);

            if (definition.type === 'audio' && modelLabel && modelSelect) {
              actions.appendChild(modelLabel);
              setTranscribeControls(transcribeButton, modelSelect, gpuOption);
              setTranscribeButtonDisabled(!value);
            }

            item.appendChild(actions);
            dom.assetList.appendChild(item);
          });
        }

        function renderSummary(detail) {
          const lecture = detail.lecture;
          const module = detail.module;
          const classRecord = detail.class;

          dom.summary.classList.remove('placeholder');
          dom.summary.innerHTML = '';

          const title = document.createElement('h3');
          title.textContent = lecture.name;
          dom.summary.appendChild(title);

          const context = document.createElement('div');
          context.className = 'asset-status';
          context.textContent = `${classRecord.name} • ${module.name}`;
          dom.summary.appendChild(context);

          const description = document.createElement('p');
          description.textContent = lecture.description || t('details.noDescription');
          dom.summary.appendChild(description);
        }

        function buildQueryString(params) {
          const query = new URLSearchParams();
          Object.entries(params || {}).forEach(([key, value]) => {
            if (value == null) {
              return;
            }
            query.set(key, String(value));
          });
          return query.toString();
        }

        async function fetchClassesPage({
          offset = 0,
          limit = CURRICULUM_PAGE_SIZE,
          moduleLimit = MODULE_PAGE_SIZE,
          lectureLimit = LECTURE_PAGE_SIZE,
        } = {}) {
          const query = buildQueryString({
            offset,
            limit,
            module_limit: moduleLimit,
            lecture_limit: lectureLimit,
          });
          return request(`/api/classes?${query}`);
        }

        async function fetchModulesPage(classId, {
          offset = 0,
          limit = MODULE_PAGE_SIZE,
          lectureLimit = LECTURE_PAGE_SIZE,
        } = {}) {
          const query = buildQueryString({ offset, limit, lecture_limit: lectureLimit });
          return request(`/api/classes/${classId}/modules?${query}`);
        }

        async function fetchLecturesPage(classId, moduleId, {
          offset = 0,
          limit = LECTURE_PAGE_SIZE,
        } = {}) {
          const query = buildQueryString({ offset, limit });
          return request(`/api/classes/${classId}/modules/${moduleId}/lectures?${query}`);
        }

        function applyClassPayload(payload, { replace = false } = {}) {
          const classes = Array.isArray(payload?.classes) ? payload.classes : [];
          if (replace) {
            state.classes = classes;
            state.moduleWindows.clear();
            state.lectureWindows.clear();
            state.moduleIndex.clear();
          } else if (classes.length) {
            const byId = new Map(state.classes.map((klass) => [klass.id, klass]));
            classes.forEach((klass) => {
              if (!klass || klass.id == null) {
                return;
              }
              if (byId.has(klass.id)) {
                byId.set(klass.id, Object.assign(byId.get(klass.id), klass));
              } else {
                state.classes.push(klass);
                byId.set(klass.id, klass);
              }
            });
            state.classes = Array.from(byId.values()).sort((a, b) => {
              const positionA = Number(a?.position) || 0;
              const positionB = Number(b?.position) || 0;
              if (positionA !== positionB) {
                return positionA - positionB;
              }
              return Number(a?.id || 0) - Number(b?.id || 0);
            });
          }

          setCurriculumWindow(payload?.pagination);
          if (payload?.stats) {
            state.stats = payload.stats;
          }

          state.classes.forEach((klass) => {
            setModuleWindow(klass?.id, klass?.modules_pagination);
            const modules = Array.isArray(klass?.modules) ? klass.modules : [];
            modules.forEach((module) => {
              setLectureWindow(module?.id, module?.lectures_pagination);
              registerModuleIndexEntry(module, klass);
              if (!Array.isArray(module.lectures)) {
                module.lectures = [];
              }
            });
          });
        }

        async function refreshData() {
          state.curriculumWindow.loading = true;
          try {
            const payload = await fetchClassesPage({ offset: 0 });
            applyClassPayload(payload, { replace: true });
            pruneExpansionState();
            state.storage.initialized = false;
            state.storage.overview = null;
            state.storage.usage = null;
            const storageBrowser = getStorageBrowserState();
            storageBrowser.initialized = false;
            storageBrowser.entries = [];
            storageBrowser.path = '';
            storageBrowser.parent = null;
            storageBrowser.error = null;
            storageBrowser.deleting.clear();
            updateStats();
            updateModuleOptions();
            renderCurriculum();

            if (state.selectedLectureId) {
              const exists = state.classes.some((klass) =>
                (klass.modules || []).some((module) =>
                  (module.lectures || []).some((lecture) => lecture.id === state.selectedLectureId),
                ),
              );
              if (!exists) {
                state.selectedLectureId = null;
                clearDetailPanel();
              }
            }
          } catch (error) {
            showStatus(error.message, 'error');
          } finally {
            state.curriculumWindow.loading = false;
          }
        }

        async function loadMoreClasses() {
          const window = state.curriculumWindow;
          if (!window || window.loading || !window.hasMore) {
            return;
          }
          const offset =
            typeof window.nextOffset === 'number'
              ? window.nextOffset
              : window.offset + window.limit;
          window.loading = true;
          try {
            const payload = await fetchClassesPage({ offset });
            applyClassPayload(payload, { replace: false });
            pruneExpansionState();
            renderCurriculum();
            updateModuleOptions();
          } catch (error) {
            showStatus(error.message, 'error');
          } finally {
            window.loading = false;
          }
        }

        async function loadMoreModules(classId) {
          if (classId == null) {
            return;
          }
          const key = String(classId);
          const window = state.moduleWindows.get(key);
          if (!window || window.loading || !window.hasMore) {
            return;
          }
          const offset =
            typeof window.nextOffset === 'number'
              ? window.nextOffset
              : window.offset + window.limit;
          window.loading = true;
          try {
            const payload = await fetchModulesPage(classId, { offset });
            const modules = Array.isArray(payload?.modules) ? payload.modules : [];
            const target = state.classes.find((klass) => Number(klass?.id) === Number(classId));
            if (target) {
              if (payload?.class?.module_count != null) {
                target.module_count = Number(payload.class.module_count);
              } else if (payload?.pagination?.total != null) {
                target.module_count = Number(payload.pagination.total);
              }
              const existingById = new Map(
                (target.modules || []).map((module) => [Number(module?.id), module]),
              );
              modules.forEach((module) => {
                const moduleId = Number(module?.id);
                if (existingById.has(moduleId)) {
                  const merged = Object.assign(existingById.get(moduleId), module);
                  existingById.set(moduleId, merged);
                } else {
                  if (!Array.isArray(target.modules)) {
                    target.modules = [];
                  }
                  target.modules.push(module);
                  existingById.set(moduleId, module);
                }
                setLectureWindow(module?.id, module?.lectures_pagination);
                registerModuleIndexEntry(module, target);
                if (!Array.isArray(module.lectures)) {
                  module.lectures = [];
                }
              });
              target.modules.sort((a, b) => {
                const positionA = Number(a?.position) || 0;
                const positionB = Number(b?.position) || 0;
                if (positionA !== positionB) {
                  return positionA - positionB;
                }
                return Number(a?.id || 0) - Number(b?.id || 0);
              });
            }
            if (payload?.pagination) {
              setModuleWindow(classId, payload.pagination);
            }
            renderCurriculum();
            updateModuleOptions();
          } catch (error) {
            showStatus(error.message, 'error');
          } finally {
            window.loading = false;
          }
        }

        async function loadMoreLectures(classId, moduleId) {
          if (classId == null || moduleId == null) {
            return;
          }
          const key = String(moduleId);
          const window = state.lectureWindows.get(key);
          if (!window || window.loading || !window.hasMore) {
            return;
          }
          const offset =
            typeof window.nextOffset === 'number'
              ? window.nextOffset
              : window.offset + window.limit;
          window.loading = true;
          try {
            const payload = await fetchLecturesPage(classId, moduleId, { offset });
            const modulePayload = payload?.module;
            const lectures = Array.isArray(modulePayload?.lectures)
              ? modulePayload.lectures
              : [];
            const targetClass = state.classes.find(
              (klass) => Number(klass?.id) === Number(classId),
            );
            if (targetClass) {
              const targetModule = (targetClass.modules || []).find(
                (module) => Number(module?.id) === Number(moduleId),
              );
              if (targetModule) {
                if (!Array.isArray(targetModule.lectures)) {
                  targetModule.lectures = [];
                }
                const existingIds = new Set(
                  targetModule.lectures.map((lecture) => Number(lecture?.id)),
                );
                lectures.forEach((lecture) => {
                  const lectureId = Number(lecture?.id);
                  if (!existingIds.has(lectureId)) {
                    targetModule.lectures.push(lecture);
                    existingIds.add(lectureId);
                  }
                });
                targetModule.lecture_count = Number(
                  modulePayload?.lecture_count ?? targetModule.lecture_count,
                );
                if (modulePayload?.asset_counts) {
                  targetModule.asset_counts = modulePayload.asset_counts;
                }
                targetModule.lectures.sort((a, b) => {
                  const positionA = Number(a?.position) || 0;
                  const positionB = Number(b?.position) || 0;
                  if (positionA !== positionB) {
                    return positionA - positionB;
                  }
                  return Number(a?.id || 0) - Number(b?.id || 0);
                });
              }
            }
            if (modulePayload?.lectures_pagination) {
              setLectureWindow(moduleId, modulePayload.lectures_pagination);
            }
            renderCurriculum();
          } catch (error) {
            showStatus(error.message, 'error');
          } finally {
            window.loading = false;
          }
        }

        async function selectLecture(lectureId) {
          state.selectedLectureId = lectureId;
          state.selectedLectureDetail = null;
          const expanded = ensureLectureExpansion(lectureId);
          if (expanded) {
            renderCurriculum();
          }
          highlightSelected();
          setActiveView('details');
          try {
            const detail = await request(`/api/lectures/${lectureId}`);
            if (!detail) {
              return;
            }
            state.selectedLectureDetail = detail;
            await ensureLectureProgressPolling(lectureId);
            renderSummary(detail);
            dom.assetSection.hidden = false;

            dom.editName.value = detail.lecture.name;
            dom.editDescription.value = detail.lecture.description || '';
            dom.editModule.value = String(detail.lecture.module_id);

            updateEditControlsAvailability();

            if (state.editMode) {
              dom.editName.focus();
            }

            setTranscribeButtonDisabled(!detail.lecture.audio_path);

            renderAssets(detail.lecture);
          } catch (error) {
            state.selectedLectureDetail = null;
            showStatus(error.message, 'error');
          }
        }

        async function handleAssetRemoval(definition) {
          if (!definition || !state.selectedLectureId) {
            return;
          }

          const kind = definition.type;
          if (!kind) {
            return;
          }

          const lectureId = state.selectedLectureId;
          const assetLabel = t(definition.labelKey);
          const confirmed = await confirmDialog({
            title: t('dialogs.removeAsset.title', { asset: assetLabel }),
            message: t('dialogs.removeAsset.message', { asset: assetLabel }),
            confirmText: t('dialogs.removeAsset.confirm'),
            cancelText: t('dialog.cancel'),
            variant: 'danger',
          });

          if (!confirmed) {
            return;
          }

          try {
            await request(`/api/lectures/${lectureId}/assets/${kind}`, { method: 'DELETE' });
            showStatus(t('status.assetRemoved'), 'success');
            await refreshData();
            await selectLecture(lectureId);
          } catch (error) {
            showStatus(error.message, 'error');
          }
        }

        async function handleAssetUpload(definition) {
          if (!definition || !state.selectedLectureId) {
            return;
          }

          const lectureId = state.selectedLectureId;
          const kind = definition.type;
          const assetLabel = t(definition.labelKey);
          let audioProcessingStarted = false;

          const allowAudioBackground =
            kind === 'audio' && state.settings?.audio_mastering_enabled !== false;
          const allowBackgroundProcessing = allowAudioBackground;
          const enableProcessingStage = allowBackgroundProcessing;
          const processingLabel =
            kind === 'audio' ? t('dialogs.upload.processingAudio') : undefined;
          const backgroundProcessingLabel =
            kind === 'audio' ? t('dialogs.upload.backgroundProcessing') : undefined;

          const dialogResult = await showUploadDialog({
            accept: definition.accept || '',
            title: t('dialogs.upload.assetTitle', { asset: assetLabel }),
            description: t('dialogs.upload.assetDescription'),
            prompt: t('dialogs.upload.prompt'),
            help: t('dialogs.upload.help'),
            browseLabel: t('dialogs.upload.browse'),
            clearLabel: t('dialogs.upload.clear'),
            uploadLabel: t('dialogs.upload.action'),
            processing: processingLabel,
            processingAction: t('dialogs.upload.processingAction'),
            allowBackgroundProcessing,
            enableProcessingStage,
            backgroundProcessing: backgroundProcessingLabel,
            onFileSelected: null,
            onUpload: async (file, helpers) => {
              const formData = new FormData();
              let endpoint = `/api/lectures/${lectureId}/assets/${kind}`;
              formData.append('file', file);

              if (kind === 'audio') {
                stopTranscriptionProgress();
                stopProcessingProgress();
                state.lastProgressMessage = '';
                state.lastProgressRatio = null;
                if (allowAudioBackground) {
                  startProcessingProgress(lectureId);
                  audioProcessingStarted = true;
                } else {
                  audioProcessingStarted = false;
                }
              }

              try {
                const response = await uploadWithProgress(endpoint, {
                  method: 'POST',
                  body: formData,
                  onProgress: (ratio) => {
                    helpers?.reportProgress?.(ratio);
                  },
                });
                return response;
              } catch (error) {
                if (kind === 'audio' && audioProcessingStarted) {
                  stopProcessingProgress();
                  audioProcessingStarted = false;
                }
                throw error;
              }
            },
          });

          const backgroundProcessingActive = Boolean(
            (dialogResult && dialogResult.processing) ||
              (dialogResult && dialogResult.result && dialogResult.result.processing)
          );

          if (!dialogResult || (!dialogResult.uploaded && !backgroundProcessingActive)) {
            if (kind === 'audio' && audioProcessingStarted) {
              stopProcessingProgress();
              audioProcessingStarted = false;
            }
            return;
          }

          if (!dialogResult.confirmed) {
            if (!backgroundProcessingActive) {
              await refreshData();
              await selectLecture(lectureId);
              if (kind === 'audio' && audioProcessingStarted) {
                stopProcessingProgress({ preserveMessage: true });
                audioProcessingStarted = false;
              }
            }
            return;
          }

          const successMessage =
            kind === 'slides' ? t('status.slidesUploaded') : t('status.assetUploaded');
          if (kind === 'audio') {
            if (allowAudioBackground) {
              showStatus(t('status.audioProcessingQueued'), 'info', { persist: true });
            } else {
              showStatus(successMessage, 'success');
            }
          } else {
            showStatus(successMessage, 'success');
          }
          await refreshData();
          await selectLecture(lectureId);
          if (kind === 'audio' && audioProcessingStarted && !backgroundProcessingActive) {
            stopProcessingProgress({ preserveMessage: true });
            audioProcessingStarted = false;
          }
        }

        async function handleSlideProcessing(definition) {
          if (!definition || definition.type !== 'slides' || !state.selectedLectureId) {
            return;
          }

          const lectureId = state.selectedLectureId;
          const detail = state.selectedLectureDetail;
          const slidePath = detail?.lecture?.slide_path;
          if (!slidePath) {
            showStatus(t('status.slidesUploadRequired'), 'info');
            return;
          }

          let preview = null;
          try {
            preview = await createSlidePreview(lectureId, null, { source: 'existing' });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message, 'error');
            return;
          }

          if (!preview) {
            showStatus(t('status.slidePreviewFailed'), 'error');
            return;
          }

          const previewSource = {
            url: preview.url,
            withCredentials: true,
            previewId: preview.id,
            lectureId,
            pageCount:
              typeof preview.pageCount === 'number' && Number.isFinite(preview.pageCount)
                ? Math.max(0, Math.round(preview.pageCount))
                : null,
          };

          let selection;
          try {
            selection = await showSlideRangeDialog(previewSource);
          } catch (error) {
            await deleteSlidePreview(lectureId, preview.id);
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message, 'error');
            return;
          }
          if (!selection || !selection.confirmed) {
            await deleteSlidePreview(lectureId, preview.id);
            return;
          }

          const formData = new FormData();
          formData.append('use_existing', 'true');
          if (typeof selection.pageStart === 'number' && Number.isFinite(selection.pageStart)) {
            formData.append('page_start', String(selection.pageStart));
          }
          if (typeof selection.pageEnd === 'number' && Number.isFinite(selection.pageEnd)) {
            formData.append('page_end', String(selection.pageEnd));
          }
          try {
            await deleteSlidePreview(lectureId, preview.id);
          } catch (error) {
            console.warn('Failed to remove slide preview before processing', error);
          }

          stopProcessingProgress();
          state.lastProgressMessage = '';
          state.lastProgressRatio = null;
          startProcessingProgress(lectureId);
          showStatus(t('status.processingSlides'), 'info', { persist: true });

          try {
            await request(`/api/lectures/${lectureId}/process-slides`, {
              method: 'POST',
              body: formData,
            });
            showStatus(t('status.slidesProcessed'), 'success');
            await refreshData();
            await selectLecture(lectureId);
          } catch (error) {
            stopProcessingProgress();
            const message = error instanceof Error ? error.message : String(error);
            showStatus(message, 'error');
          }
        }

        dom.viewButtons.forEach((button) => {
          button.addEventListener('click', () => {
            const view = button.dataset.view;
            if (!view) {
              return;
            }
            setActiveView(view);
            if (view === 'create') {
              dom.createModule.focus();
            } else if (view === 'details' && state.editMode && state.selectedLectureId) {
              dom.editName.focus();
            }
          });
        });

        if (dom.editToggle) {
          dom.editToggle.addEventListener('click', () => {
            state.editMode = !state.editMode;
            updateEditModeUI();
            if (state.editMode && state.selectedLectureId) {
              setActiveView('details');
              dom.editName.focus();
            }
          });
        }

        dom.search.addEventListener('input', (event) => {
          state.query = event.target.value;
          renderCurriculum();
        });

        dom.editForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          if (!state.editMode) {
            showStatus(t('status.requireEditLecture'), 'info');
            return;
          }
          if (!state.selectedLectureId) {
            return;
          }
          const payload = {
            name: dom.editName.value.trim(),
            description: dom.editDescription.value.trim(),
          };
          const moduleValue = dom.editModule.value;
          if (moduleValue) {
            payload.module_id = Number(moduleValue);
          }
          if (!payload.name) {
            showStatus(t('status.lectureTitleRequired'), 'error');
            return;
          }
          try {
            await request(`/api/lectures/${state.selectedLectureId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            showStatus(t('status.lectureUpdated'), 'success');
            await refreshData();
            await selectLecture(state.selectedLectureId);
          } catch (error) {
            showStatus(error.message, 'error');
          }
        });

        dom.deleteButton.addEventListener('click', async () => {
          if (!state.selectedLectureId || !state.editMode) {
            return;
          }
          const lectureName = dom.editName.value.trim() || dom.editName.placeholder || '';
          const confirmed = await confirmDialog({
            title: t('dialogs.deleteLecture.title'),
            message: t('dialogs.deleteLecture.message', { context: lectureName }),
            confirmText: t('common.actions.delete'),
            cancelText: t('dialogs.deleteLecture.cancel'),
            variant: 'danger',
          });
          if (!confirmed) {
            return;
          }
          const secondCheck = await confirmDialog({
            title: t('dialogs.confirmDeletion.title'),
            message: t('dialogs.confirmDeletion.message'),
            confirmText: t('dialogs.confirmDeletion.confirm'),
            cancelText: t('dialog.cancel'),
            variant: 'danger',
          });
          if (!secondCheck) {
            return;
          }
          try {
            await request(`/api/lectures/${state.selectedLectureId}`, { method: 'DELETE' });
            showStatus(t('status.lectureRemoved'), 'success');
            state.selectedLectureId = null;
            clearDetailPanel();
            await refreshData();
          } catch (error) {
            showStatus(error.message, 'error');
          }
        });

        dom.createForm.addEventListener('submit', async (event) => {
          event.preventDefault();
          const moduleId = Number(dom.createModule.value);
          const name = dom.createName.value.trim();
          const description = dom.createDescription.value.trim();
          if (!moduleId || !name) {
            showStatus(t('status.createLectureRequirements'), 'error');
            return;
          }
          try {
            const payload = await request('/api/lectures', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ module_id: moduleId, name, description }),
            });
            dom.createForm.reset();
            showStatus(t('status.lectureCreated'), 'success');
            await refreshData();
            const newLectureId = payload?.lecture?.id;
            if (newLectureId) {
              await selectLecture(newLectureId);
            }
          } catch (error) {
            showStatus(error.message, 'error');
          }
        });

        async function handleTranscribeClick(event) {
          event?.preventDefault?.();
          if (!state.selectedLectureId) {
            return;
          }

          const lectureId = state.selectedLectureId;
          const selectedModel = getTranscribeModelValue();
          const button = getTranscribeButton();

          if (button) {
            button.disabled = true;
          }

          showStatus(t('status.transcriptionPreparing'), 'info', { persist: true });
          startTranscriptionProgress(lectureId);
          try {
            const payload = await request(`/api/lectures/${lectureId}/transcribe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: selectedModel }),
            });
            stopTranscriptionProgress();
            const fallbackModel = payload?.fallback_model;
            if (fallbackModel) {
              const fallbackReason =
                typeof payload?.fallback_reason === 'string'
                  ? payload.fallback_reason
                  : t('status.gpuNotAvailable');
              await showDialog({
                title: t('dialogs.gpuWhisper.title'),
                message: `${fallbackReason} ${t('status.gpuFallback', { model: fallbackModel })}`,
                confirmText: t('common.actions.ok'),
                cancelText: t('common.actions.close'),
                variant: 'danger',
              });
              setTranscribeModelValue(fallbackModel);
              if (dom.settingsWhisperModel) {
                dom.settingsWhisperModel.value = fallbackModel;
              }
              if (state.settings) {
                state.settings.whisper_model = fallbackModel;
                state.settings.whisper_model_requested = fallbackModel;
              }
              await loadGpuWhisperStatus();
            } else if (selectedModel === GPU_MODEL) {
              await loadGpuWhisperStatus();
            }
            showStatus(t('status.transcriptionCompleted'), 'success', { progressRatio: 1 });
            await refreshData();
            await selectLecture(lectureId);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            stopTranscriptionProgress();
            const progress = await fetchTranscriptionProgress(state.selectedLectureId);
            if (progress && progress.message) {
              showStatus(progress.message, progress.error ? 'error' : 'info', {
                progressRatio: progress.ratio,
                persist: !progress.finished,
              });
            } else {
              showStatus(message, 'error');
            }
          } finally {
            if (button) {
              button.disabled = false;
            }
          }
        }

        if (dom.settingsWhisperGpuTest) {
          dom.settingsWhisperGpuTest.addEventListener('click', async () => {
            if (state.gpuWhisper.unavailable) {
              return;
            }
            dom.settingsWhisperGpuTest.disabled = true;
            showStatus(t('status.gpuChecking'), 'info');
            try {
              const payload = await request('/api/settings/whisper-gpu/test', {
                method: 'POST',
              });
              const status = payload?.status || {};
              updateGpuWhisperUI(status);
              if (status.supported) {
                showStatus(t('status.gpuConfirmed'), 'success');
                if (state.settings?.whisper_model_requested === GPU_MODEL) {
                  if (dom.settingsWhisperModel) {
                    dom.settingsWhisperModel.value = GPU_MODEL;
                  }
                  setTranscribeModelValue(GPU_MODEL);
                  state.settings.whisper_model = GPU_MODEL;
                }
              } else {
                const failureMessage =
                  typeof status.message === 'string' && status.message
                    ? status.message
                    : t('status.gpuUnsupported');
                await showDialog({
                  title: t('dialogs.gpuWhisper.title'),
                  message: failureMessage,
                  confirmText: t('common.actions.ok'),
                  cancelText: t('common.actions.close'),
                  variant: 'danger',
                });
                showStatus(failureMessage, 'error');
              }
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message, 'error');
            } finally {
              dom.settingsWhisperGpuTest.disabled = state.gpuWhisper.unavailable;
            }
          });
        }

        if (dom.settingsUpdateRun) {
          dom.settingsUpdateRun.addEventListener('click', () => {
            void triggerSystemUpdate();
          });
        }

        if (dom.settingsUpdateRefresh) {
          dom.settingsUpdateRefresh.addEventListener('click', async () => {
            if (dom.settingsUpdateRefresh.disabled) {
              return;
            }
            dom.settingsUpdateRefresh.disabled = true;
            try {
              await fetchSystemUpdateStatus();
            } finally {
              dom.settingsUpdateRefresh.disabled = state.systemUpdate.running;
            }
          });
        }

        if (dom.settingsExport) {
          dom.settingsExport.addEventListener('click', async () => {
            dom.settingsExport.disabled = true;
            showStatus(t('status.exporting'), 'info');
            try {
              const payload = await request('/api/settings/export', { method: 'POST' });
              const archive = payload?.archive;
              if (!archive || !archive.path) {
                throw new Error(t('status.exportFailed'));
              }
              const link = document.createElement('a');
              link.href = buildStorageURL(archive.path);
              link.download = archive.filename || 'lecture-tools-export.zip';
              document.body.appendChild(link);
              link.click();
              link.remove();
              showStatus(t('status.exportReady'), 'success');
            } catch (error) {
              showStatus(error.message, 'error');
            } finally {
              dom.settingsExport.disabled = false;
            }
          });
        }

        if (dom.settingsImport) {
          dom.settingsImport.addEventListener('click', async () => {
            if (dom.settingsImport.disabled) {
              return;
            }

            const dialogResult = await showUploadDialog({
              accept: '.zip',
              title: t('dialogs.upload.archiveTitle'),
              description: t('dialogs.upload.archiveDescription'),
              prompt: t('dialogs.upload.prompt'),
              help: t('dialogs.upload.help'),
              browseLabel: t('dialogs.upload.browse'),
              clearLabel: t('dialogs.upload.clear'),
              uploadLabel: t('dialogs.upload.action'),
              onUpload: async (file, helpers) => {
                const formData = new FormData();
                formData.append('file', file);
                if (dom.settingsImportMode) {
                  formData.append('mode', dom.settingsImportMode.value || 'merge');
                }
                dom.settingsImport.disabled = true;
                if (dom.settingsExport) {
                  dom.settingsExport.disabled = true;
                }
                showStatus(t('status.importing'), 'info');
                try {
                  const response = await uploadWithProgress('/api/settings/import', {
                    method: 'POST',
                    body: formData,
                    onProgress: (ratio) => {
                      helpers?.reportProgress?.(ratio);
                    },
                  });
                  return response;
                } finally {
                  dom.settingsImport.disabled = false;
                  if (dom.settingsExport) {
                    dom.settingsExport.disabled = false;
                  }
                }
              },
            });

            if (!dialogResult || !dialogResult.uploaded || !dialogResult.confirmed) {
              return;
            }

            try {
              const payload = dialogResult.result;
              const summary = payload?.import;
              if (summary) {
                const count = Number(summary.lectures || 0);
                if (count > 0) {
                  showStatus(t('status.importSuccess', { count }), 'success');
                } else {
                  showStatus(t('status.importNoChanges'), 'success');
                }
              } else {
                showStatus(t('status.importSuccess', { count: 0 }), 'success');
              }
              await refreshData();
            } catch (error) {
              showStatus(error instanceof Error ? error.message : String(error), 'error');
            }
          });
        }

        if (dom.settingsExitApp) {
          dom.settingsExitApp.addEventListener('click', async () => {
            const { confirmed } = await showDialog({
              title: t('dialogs.exitApp.title'),
              message: t('dialogs.exitApp.message'),
              confirmText: t('common.actions.exit'),
              cancelText: t('dialog.cancel'),
              variant: 'danger',
            });
            if (!confirmed) {
              return;
            }

            dom.settingsExitApp.disabled = true;
            showStatus(t('status.shuttingDown'), 'info');

            try {
              await request('/api/system/shutdown', { method: 'POST' });
              window.setTimeout(() => {
                try {
                  window.close();
                } catch (error) {
                  // Ignore inability to close the window.
                }
                try {
                  window.location.replace('about:blank');
                } catch (error) {
                  // Ignore navigation failures.
                }
              }, 300);
            } catch (error) {
              dom.settingsExitApp.disabled = false;
              const message = error instanceof Error ? error.message : String(error);
              showStatus(message, 'error');
            }
          });
        }

        if (dom.settingsLanguage) {
          dom.settingsLanguage.addEventListener('change', async (event) => {
            const value = normalizeLanguage(event.target.value);
            await applyTranslations(value);
            renderStorage();
            updateEditModeUI();
          });
        }

        if (dom.settingsForm) {
          dom.settingsForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const themeValue = dom.settingsTheme.value || 'system';
            const languageValue = normalizeLanguage(dom.settingsLanguage.value);
            const modelValue = normalizeWhisperModel(dom.settingsWhisperModel.value);
            const computeValue = dom.settingsWhisperCompute.value.trim() || 'int8';
            const beamValue = Math.max(
              1,
              Math.min(10, Number(dom.settingsWhisperBeam.value) || 5),
            );
            const dpiValue = Number(normalizeSlideDpi(dom.settingsSlideDpi.value));
            const masteringEnabled = dom.settingsAudioMastering
              ? Boolean(dom.settingsAudioMastering.checked)
              : true;
            const debugEnabled = dom.settingsDebugEnabled
              ? Boolean(dom.settingsDebugEnabled.checked)
              : false;

            try {
              const response = await request('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  theme: themeValue,
                  language: languageValue,
                  whisper_model: modelValue,
                  whisper_compute_type: computeValue,
                  whisper_beam_size: beamValue,
                  slide_dpi: dpiValue,
                  audio_mastering_enabled: masteringEnabled,
                  debug_enabled: debugEnabled,
                }),
              });
              const updatedSettings = response?.settings ?? {
                theme: themeValue,
                language: languageValue,
                whisper_model: modelValue,
                whisper_compute_type: computeValue,
                whisper_beam_size: beamValue,
                slide_dpi: dpiValue,
                audio_mastering_enabled: masteringEnabled,
                debug_enabled: debugEnabled,
              };
              await syncSettingsForm(updatedSettings);
              if (modelValue === GPU_MODEL) {
                await loadGpuWhisperStatus();
              }
              showStatus(t('status.settingsSaved'), 'success');
            } catch (error) {
              showStatus(error.message, 'error');
            }
          });
        }
        window.addEventListener('beforeunload', () => {
          debugStore.deactivate();
          stopTranscriptionProgress();
          stopProcessingProgress();
        });
        setActiveView(state.activeView);
        updateEditModeUI();
        clearDetailPanel();
        applyTheme('system');
        await loadGpuWhisperStatus();
        await loadSettings();
        await fetchSystemUpdateStatus();
        await refreshData();
      })();
