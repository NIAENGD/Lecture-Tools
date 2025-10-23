import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tsconfigPaths from 'vite-tsconfig-paths';
import { sentryVitePlugin } from '@sentry/vite-plugin';

const isCI = process.env.CI === 'true';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    react({
      plugins: [],
    }),
    sentryVitePlugin({
      org: process.env.SENTRY_ORG ?? '',
      project: process.env.SENTRY_PROJECT ?? '',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      disable: !process.env.SENTRY_AUTH_TOKEN,
      telemetry: false,
    }),
  ],
  define: {
    __DEV__: !isCI && process.env.NODE_ENV !== 'production',
  },
  build: {
    target: 'es2021',
    sourcemap: true,
    modulePreload: {
      polyfill: false,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
