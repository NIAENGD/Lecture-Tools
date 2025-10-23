/// <reference types="vite/client" />

declare const __DEV__: boolean;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_POSTHOG_KEY?: string;
  readonly VITE_POSTHOG_HOST?: string;
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?worker' {
  const WorkerFactory: { new (): Worker };
  export default WorkerFactory;
}
