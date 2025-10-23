import { createApiClient } from '@lecturetools/api';
import { useAuthStore } from '../state/auth';
import { useToastStore } from '../state/toast';
import { i18n } from '../config/i18n';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '';

const etagCache = new Map<string, string>();

const readCsrfToken = () =>
  typeof document !== 'undefined'
    ? document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? null
    : null;

export const apiClient = createApiClient({
  baseUrl,
  getCsrfToken: readCsrfToken,
  getRoles: () => Array.from(useAuthStore.getState().roles),
  onUnauthorized: (required) => {
    const toast = useToastStore.getState();
    toast.pushToast({
      tone: 'error',
      title: i18n.t('auth.accessDeniedTitle'),
      description: i18n.t('auth.accessDeniedBody', {
        roles: required.join(', '),
      }),
    });
  },
  getEtag: (key) => etagCache.get(key),
  setEtag: (key, value) => etagCache.set(key, value),
});

export const getApiBaseUrl = () => baseUrl;
