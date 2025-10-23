import { UploadCloud, FileStack, Play, ShoppingCart, ListStart } from 'lucide-react';
import { clsx } from 'clsx';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskCartStore } from '../../state/taskCart';
import { useLocaleFormatter } from '../../lib/useLocaleFormatter';
import { useTimelineStore } from '../../state/timeline';
import { useNavigate } from '@tanstack/react-router';
import { loadMockActivities, loadMockSystemSnapshot } from '../../lib/mockData';
import { useFeatureFlags } from '../../state/featureFlags';

export const HomeView = () => {
  const { t } = useTranslation();
  const { formatDateTime, formatNumber, formatPercent } = useLocaleFormatter();
  const queued = useTaskCartStore((state) => state.items.length);
  const timelineEvents = useTimelineStore((state) => state.events);
  const navigate = useNavigate({ from: '/' });
  const { flags } = useFeatureFlags();
  const snapshot = useMemo(() => loadMockSystemSnapshot(), []);

  const tiles = useMemo(
    () => [
      {
        icon: UploadCloud,
        title: t('actions.uploadRecording'),
        description: t('home.quickTileDescriptions.uploadRecording'),
      },
      {
        icon: FileStack,
        title: t('actions.uploadSlides'),
        description: t('home.quickTileDescriptions.uploadSlides'),
      },
      {
        icon: ListStart,
        title: t('actions.createLecture'),
        description: t('home.quickTileDescriptions.createLecture'),
      },
      {
        icon: ShoppingCart,
        title: t('actions.addSelectionToCart'),
        description: t('home.quickTileDescriptions.addSelectionToCart'),
      },
      {
        icon: Play,
        title: t('actions.runCart'),
        description: t('home.quickTileDescriptions.runCart'),
      },
    ],
    [t],
  );

  const fallbackActivities = useMemo(() => loadMockActivities(), []);
  const activities = useMemo(() => {
    if (timelineEvents.length) {
      return timelineEvents.slice(0, 20).map((event) => ({
        id: event.id,
        title: event.title,
        description: event.status,
        timestamp: event.timestamp,
        targetRoute: '/tasks' as const,
      }));
    }
    return fallbackActivities;
  }, [fallbackActivities, timelineEvents]);

  const gpuStatus = useMemo(() => {
    const fallbackEvent = timelineEvents.find((event) => event.status.toLowerCase().includes('fallback'));
    if (!flags.enableGpuControls || fallbackEvent) {
      return 'Fallback';
    }
    return snapshot.gpu;
  }, [flags.enableGpuControls, snapshot.gpu, timelineEvents]);

  const queuedCount = queued > 0 ? queued : snapshot.queuedTasks;
  const gpuStatusLabel = gpuStatus === 'Fallback' ? t('home.metrics.gpuFallback') : t('home.metrics.gpuActive');

  return (
    <div className="flex h-full w-full flex-col gap-4" data-help-id="home-canvas" data-help-title={t('helpOverlay.home.title')} data-help-description={t('helpOverlay.home.body')}>
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-foreground">
          {t('home.title')}
        </h1>
        <p className="text-sm text-foreground-muted">{t('home.subtitle')}</p>
      </header>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">{t('home.quickActionsTitle')}</h2>
        <div className="grid grid-cols-5 gap-4">
          {tiles.map((tile) => (
            <button
              key={tile.title}
              type="button"
              className={clsx(
                'flex h-32 flex-col justify-between rounded-2xl border border-border-subtle bg-surface-subtle/60 p-6 text-left transition-all hover:border-border-strong hover:text-foreground',
              )}
              data-help-id={`home-tile-${tile.title}`}
              data-help-title={tile.title}
              data-help-description={tile.description}
            >
              <tile.icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
              <div>
                <h3 className="text-lg font-semibold text-foreground">{tile.title}</h3>
                <p className="text-xs text-foreground-muted">{tile.description}</p>
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="grid grid-cols-[2fr_1fr] gap-4">
        <article className="flex flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/40 p-6" data-help-id="home-activity" data-help-title={t('helpOverlay.homeActivity.title')} data-help-description={t('helpOverlay.homeActivity.body')}>
          <header className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{t('home.recentActivityTitle')}</h2>
              <p className="text-sm text-foreground-muted">{t('home.recentActivitySubtitle')}</p>
            </div>
            <span className="rounded-full border border-border-subtle px-3 py-1 text-xs text-foreground-secondary">
              {formatNumber(activities.length, { maximumFractionDigits: 0 })}
            </span>
          </header>
          <ul className="space-y-3 overflow-y-auto pr-2">
            {activities.map((activity, index) => (
              <li
                key={`${activity.title}-${index}`}
                className="flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-base/60 px-4 py-3 text-sm text-foreground"
              >
                <div>
                  <p className="font-semibold">{activity.title}</p>
                  <p className="text-xs text-foreground-muted">{activity.description}</p>
                  <p className="text-[11px] text-foreground-muted">{formatDateTime(activity.timestamp, { timeStyle: 'short' })}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate({ to: activity.targetRoute ?? '/tasks' }).catch(() => undefined)}
                  className="rounded-full border border-border-subtle px-3 py-1 text-xs text-foreground-secondary transition-colors hover:border-border-strong hover:text-foreground"
                >
                  {t('home.open')}
                </button>
              </li>
            ))}
          </ul>
        </article>
        <article className="flex h-full flex-col gap-3 rounded-3xl border border-border-subtle bg-surface-subtle/40 p-6" data-help-id="home-metrics" data-help-title={t('helpOverlay.homeSnapshot.title')} data-help-description={t('helpOverlay.homeSnapshot.body')}>
          <h2 className="text-xl font-semibold text-foreground">{t('home.systemSnapshot')}</h2>
          <dl className="space-y-3 text-sm text-foreground">
            <div className="flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-base/80 px-4 py-3">
              <dt className="text-foreground-muted">{t('home.metrics.gpu')}</dt>
              <dd className="font-semibold text-foreground">{gpuStatusLabel}</dd>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-base/80 px-4 py-3">
              <dt className="text-foreground-muted">{t('home.metrics.storage')}</dt>
              <dd className="font-semibold text-foreground">{formatPercent(snapshot.storageUsed * 100)}</dd>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border-subtle bg-surface-base/80 px-4 py-3">
              <dt className="text-foreground-muted">{t('home.metrics.queued')}</dt>
              <dd className="font-semibold text-foreground">{formatNumber(queuedCount, { maximumFractionDigits: 0 })}</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
  );
};
