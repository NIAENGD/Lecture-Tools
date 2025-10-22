import type { EnvironmentConfig } from './types';

function normalizeServerPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === '__LECTURE_TOOLS_ROOT_PATH__') {
    return null;
  }
  if (trimmed === '/' || trimmed === '//') {
    return '';
  }
  return trimmed.startsWith('/') ? trimmed.replace(/\/+$/, '') : `/${trimmed}`;
}

export function bootstrapEnvironment(): EnvironmentConfig {
  const body = document.body;
  if (!body) {
    throw new Error('Unable to bootstrap environment without body element');
  }

  const { dataset } = body;
  const serverRoot = normalizeServerPath(window.__LECTURE_TOOLS_SERVER_ROOT_PATH__);
  const basePath =
    serverRoot ?? normalizeServerPath(dataset.rootPath) ?? resolveBaseFromLocation();

  const config: EnvironmentConfig = {
    basePath,
    pdf: {
      script: dataset.pdfjsScript ?? '',
      worker: dataset.pdfjsWorker ?? '',
      module: dataset.pdfjsModule ?? '',
      workerModule: dataset.pdfjsWorkerModule ?? '',
    },
  };

  window.__LECTURE_TOOLS_BASE_PATH__ = config.basePath;
  window.__LECTURE_TOOLS_PDFJS_SCRIPT_URL__ = config.pdf.script;
  window.__LECTURE_TOOLS_PDFJS_WORKER_URL__ = config.pdf.worker;
  window.__LECTURE_TOOLS_PDFJS_MODULE_URL__ = config.pdf.module;
  window.__LECTURE_TOOLS_PDFJS_WORKER_MODULE_URL__ = config.pdf.workerModule;

  return config;
}

export function resolveAppUrl(path: string, config?: EnvironmentConfig): string {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith('//')) {
    return path;
  }
  if (path.startsWith('#') || path.startsWith('?')) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const base = config?.basePath ?? window.__LECTURE_TOOLS_BASE_PATH__ ?? '';
  if (!base) {
    return normalized;
  }
  if (normalized === '/') {
    return base || '/';
  }
  return `${base}${normalized}`;
}

function resolveBaseFromLocation(): string {
  const { pathname } = window.location;
  if (!pathname || pathname === '/' || pathname === '/index.html') {
    return '';
  }
  const withoutIndex = pathname.replace(/\/index\.html?$/, '');
  return withoutIndex.endsWith('/') ? withoutIndex.slice(0, -1) : withoutIndex;
}
