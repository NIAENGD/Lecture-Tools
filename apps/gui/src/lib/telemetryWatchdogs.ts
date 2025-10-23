import posthog from 'posthog-js';
import * as Sentry from '@sentry/react';

let initialized = false;

const REDLINE_FETCH_MS = 1500;
const REDLINE_LONG_TASK_MS = 120;

const captureRedline = (event: { metric: string; value: number; detail?: string }) => {
  posthog.capture('redline_alert', event);
  Sentry.captureMessage(`Redline: ${event.metric}`, {
    level: 'warning',
    tags: { metric: event.metric },
    extra: event,
  });
};

export const initializeTelemetryWatchdogs = () => {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  if ('PerformanceObserver' in window) {
    try {
      const resourceObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'resource' && 'initiatorType' in entry) {
            const resource = entry as PerformanceResourceTiming;
            if (resource.initiatorType === 'fetch' && resource.duration > REDLINE_FETCH_MS) {
              captureRedline({ metric: 'fetch-latency', value: resource.duration, detail: resource.name });
            }
          }
        });
      });
      resourceObserver.observe({ type: 'resource', buffered: true });

      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if ('duration' in entry && entry.duration > REDLINE_LONG_TASK_MS) {
            captureRedline({ metric: 'long-task', value: entry.duration });
          }
        });
      });
      longTaskObserver.observe({ type: 'longtask', buffered: true });
    } catch (error) {
      console.warn('PerformanceObserver unavailable', error);
    }
  }

  window.addEventListener('error', (event) => {
    captureRedline({ metric: 'window-error', value: 1, detail: event.message });
  });

  window.addEventListener('unhandledrejection', (event) => {
    captureRedline({ metric: 'promise-rejection', value: 1, detail: String(event.reason) });
  });
};
