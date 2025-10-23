import { PropsWithChildren, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { PostHogProvider } from 'posthog-js/react';
import posthog from 'posthog-js';
import { Toaster } from '../components/Toaster';
import { i18n } from '../config/i18n';
import { I18nextProvider } from 'react-i18next';
import { FeatureFlagProvider, useFeatureFlagsStore } from '../state/featureFlags';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import * as Sentry from '@sentry/react';
import { initializeTelemetryWatchdogs } from '../lib/telemetryWatchdogs';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com';

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: false,
    persistence: 'memory',
  });
}

export const AppProviders = ({ children }: PropsWithChildren) => {
  const featureFlags = useFeatureFlagsStore((state) => state.flags);

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    posthog.group('installation', 'lecture-tools-gui');
    posthog.register(featureFlags);
  }, [featureFlags]);

  useEffect(() => {
    initializeTelemetryWatchdogs();
  }, []);

  return (
    <FeatureFlagProvider>
      <I18nextProvider i18n={i18n}>
        <PostHogProvider client={posthog}>
          <QueryClientProvider client={queryClient}>
            <Sentry.ErrorBoundary fallback={<FallbackError />}>{children}</Sentry.ErrorBoundary>
            <ReactQueryDevtools buttonPosition="bottom-right" initialIsOpen={false} />
            {__DEV__ ? <TanStackRouterDevtools position="bottom-right" /> : null}
            <Toaster />
          </QueryClientProvider>
        </PostHogProvider>
      </I18nextProvider>
    </FeatureFlagProvider>
  );
};

const FallbackError = () => (
  <div className="flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border border-border-strong bg-surface-overlay/95 p-6 text-center text-foreground">
    <h2 className="text-xl font-semibold">Something went wrong</h2>
    <p className="text-sm text-foreground-muted">Refresh or check the debug panel for detailed logs.</p>
  </div>
);
