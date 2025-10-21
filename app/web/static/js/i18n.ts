interface LocaleData {
  [key: string]: LocaleData | string | number | boolean | null;
}

interface I18nOptions {
  defaultLanguage: string;
  initialLanguage?: string;
  resolveUrl?: (path: string) => string;
  fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

interface ApplyResult {
  language: string;
  locale: LocaleData;
}

const LANGUAGE_PATTERN = /^[a-z]{2}(?:-[a-z0-9]+)?$/i;

function normalizeLanguage(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return fallback;
  }
  return LANGUAGE_PATTERN.test(trimmed) ? trimmed : fallback;
}

function resolveTemplate(template: string, params?: Record<string, string | number>): string {
  if (!params) {
    return template;
  }
  return template.replace(/\{\{(.*?)\}\}/g, (match, name) => {
    const key = String(name).trim();
    if (!Object.prototype.hasOwnProperty.call(params, key)) {
      return match;
    }
    const value = params[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

function resolveTranslation(locale: LocaleData | undefined, key: string): LocaleData | string | undefined {
  if (!locale) {
    return undefined;
  }
  const segments = key.split('.');
  let current: LocaleData | string | number | boolean | null = locale;
  for (const segment of segments) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment] as LocaleData | string | number | boolean | null;
  }
  return (typeof current === 'string' || typeof current === 'object') && current !== null
    ? (current as LocaleData | string)
    : undefined;
}

export interface I18nInstance {
  init: () => Promise<string>;
  ensure: (language: string) => Promise<void>;
  setLanguage: (language: string) => Promise<ApplyResult>;
  getCurrentLanguage: () => string;
  getLocale: (language?: string) => LocaleData;
  translate: (key: string, params?: Record<string, string | number>) => string;
  format: (key: string, params?: Record<string, string | number>, language?: string) => string;
  pluralize: (key: string, count: number, language?: string) => string;
  onChange: (handler: (language: string) => void) => () => void;
}

export function createI18n(options: I18nOptions): I18nInstance {
  const defaultLanguage = normalizeLanguage(options.defaultLanguage, 'en');
  let currentLanguage = normalizeLanguage(options.initialLanguage, defaultLanguage);
  const cache = new Map<string, LocaleData>();
  const loading = new Map<string, Promise<LocaleData>>();
  const listeners = new Set<(language: string) => void>();
  const resolveUrl = options.resolveUrl ?? ((path: string) => path);
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as typeof fetch);
  const pluralRules = new Map<string, Intl.PluralRules>();

  function notify(language: string): void {
    listeners.forEach((listener) => {
      try {
        listener(language);
      } catch (error) {
        console.warn('i18n change listener failed', error);
      }
    });
  }

  function getPluralRules(language: string): Intl.PluralRules {
    if (!pluralRules.has(language)) {
      try {
        pluralRules.set(language, new Intl.PluralRules(language));
      } catch (error) {
        pluralRules.set(language, new Intl.PluralRules(defaultLanguage));
      }
    }
    return pluralRules.get(language) as Intl.PluralRules;
  }

  async function fetchLocale(language: string): Promise<LocaleData> {
    const normalized = normalizeLanguage(language, defaultLanguage);
    if (cache.has(normalized)) {
      return cache.get(normalized) as LocaleData;
    }
    if (loading.has(normalized)) {
      return loading.get(normalized) as Promise<LocaleData>;
    }
    const url = resolveUrl(`/static/i18n/${normalized}.json`);
    const promise = fetchImpl(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Failed to load locale: ${normalized}`);
        }
        return (await response.json()) as LocaleData;
      })
      .then((data) => {
        cache.set(normalized, data);
        loading.delete(normalized);
        return data;
      })
      .catch((error) => {
        loading.delete(normalized);
        throw error;
      });
    loading.set(normalized, promise);
    return promise;
  }

  async function ensureLanguage(language: string): Promise<void> {
    const normalized = normalizeLanguage(language, defaultLanguage);
    if (cache.has(normalized)) {
      return;
    }
    try {
      await fetchLocale(normalized);
    } catch (error) {
      if (normalized !== defaultLanguage) {
        await ensureLanguage(defaultLanguage);
      } else {
        throw error;
      }
    }
  }

  function getLocaleInternal(language: string): LocaleData {
    const normalized = normalizeLanguage(language, defaultLanguage);
    if (cache.has(normalized)) {
      return cache.get(normalized) as LocaleData;
    }
    if (cache.has(defaultLanguage)) {
      return cache.get(defaultLanguage) as LocaleData;
    }
    return {};
  }

  function formatInternal(
    key: string,
    params?: Record<string, string | number>,
    language = currentLanguage,
  ): string {
    if (!key) {
      return '';
    }
    const normalized = normalizeLanguage(language, defaultLanguage);
    const primary = resolveTranslation(cache.get(normalized), key);
    const fallback = normalized === defaultLanguage ? undefined : resolveTranslation(cache.get(defaultLanguage), key);
    const template = primary ?? fallback ?? key;
    return typeof template === 'string' ? resolveTemplate(template, params) : key;
  }

  return {
    async init(): Promise<string> {
      await ensureLanguage(defaultLanguage);
      if (currentLanguage !== defaultLanguage) {
        await ensureLanguage(currentLanguage).catch(() => {
          currentLanguage = defaultLanguage;
        });
      }
      notify(currentLanguage);
      return currentLanguage;
    },
    async ensure(language: string): Promise<void> {
      await ensureLanguage(language);
    },
    async setLanguage(language: string): Promise<ApplyResult> {
      const normalized = normalizeLanguage(language, defaultLanguage);
      await ensureLanguage(defaultLanguage);
      await ensureLanguage(normalized).catch(() => {
        if (normalized !== defaultLanguage) {
          currentLanguage = defaultLanguage;
        }
      });
      if (cache.has(normalized)) {
        currentLanguage = normalized;
      } else {
        currentLanguage = defaultLanguage;
      }
      const locale = getLocaleInternal(currentLanguage);
      notify(currentLanguage);
      return { language: currentLanguage, locale };
    },
    getCurrentLanguage(): string {
      return currentLanguage;
    },
    getLocale(language?: string): LocaleData {
      return getLocaleInternal(language ?? currentLanguage);
    },
    translate(key: string, params?: Record<string, string | number>): string {
      return formatInternal(key, params);
    },
    format(
      key: string,
      params?: Record<string, string | number>,
      language?: string,
    ): string {
      return formatInternal(key, params, language);
    },
    pluralize(key: string, count: number, language?: string): string {
      const normalized = normalizeLanguage(language ?? currentLanguage, defaultLanguage);
      const locale = resolveTranslation(cache.get(normalized), key);
      const fallbackLocale = normalized === defaultLanguage ? undefined : resolveTranslation(cache.get(defaultLanguage), key);
      if (typeof locale === 'string') {
        return locale;
      }
      const rules = getPluralRules(normalized);
      const category = rules.select(Number(count));
      if (locale && typeof locale === 'object' && locale !== null) {
        const table = locale as Record<string, string>;
        return table[category] ?? table.other ?? table.one ?? String(count);
      }
      if (fallbackLocale && typeof fallbackLocale === 'object' && fallbackLocale !== null) {
        const table = fallbackLocale as Record<string, string>;
        return table[category] ?? table.other ?? table.one ?? String(count);
      }
      return String(count);
    },
    onChange(handler: (language: string) => void): () => void {
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
      };
    },
  };
}
