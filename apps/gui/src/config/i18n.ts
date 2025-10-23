import type { Resource } from 'i18next';
import i18n from 'i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';
import enTranslation from '../locales/en/translation';

export const supportedLocales = ['en', 'es', 'fr', 'zh'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

type TranslationData = Record<string, unknown>;

const localeLoaders: Record<SupportedLocale, () => Promise<{ default: TranslationData }>> = {
  en: async () => ({ default: enTranslation as TranslationData }),
  es: async () => (await import('../locales/es/translation')) as { default: TranslationData },
  fr: async () => (await import('../locales/fr/translation')) as { default: TranslationData },
  zh: async () => (await import('../locales/zh/translation')) as { default: TranslationData },
};

export const resolveLocale = (language: string): SupportedLocale => {
  const normalized = language.toLowerCase();
  const match = supportedLocales.find((locale) => normalized === locale || normalized.startsWith(`${locale}-`));
  return match ?? 'en';
};

i18n
  .use(initReactI18next)
  .use(
    resourcesToBackend((language, namespace, callback) => {
      if (namespace !== 'translation') {
        callback(new Error(`Unsupported namespace: ${namespace}`), null);
        return;
      }

      const locale = resolveLocale(language);

      localeLoaders[locale]()
        .then((module) => {
          callback(null, module.default);
        })
        .catch((error: unknown) => {
          callback(error as Error, null);
        });
    }),
  )
  .init({
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: supportedLocales,
    defaultNS: 'translation',
    resources: {
      en: { translation: enTranslation },
    } satisfies Resource,
    interpolation: {
      escapeValue: false,
    },
  });

export { i18n };
