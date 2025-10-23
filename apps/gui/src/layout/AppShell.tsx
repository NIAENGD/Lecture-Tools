import { lazy, PropsWithChildren, Suspense, useCallback, useEffect, useState } from 'react';
import { MegaRail } from './MegaRail';
import { TopBar } from './TopBar';
import { StatusTimeline } from './StatusTimeline';
import { useReducedMotionPreference } from '../lib/useReducedMotionPreference';
import { useTranslation } from 'react-i18next';

const HELP_SEEN_KEY = 'lecture-tools-help-seen';
const HELP_SUPPRESS_KEY = 'lecture-tools-help-suppress';

const TaskCartTray = lazy(() =>
  import('../components/task-cart/TaskCartTray').then((module) => ({ default: module.TaskCartTray })),
);

const ActionDock = lazy(() => import('./ActionDock').then((module) => ({ default: module.ActionDock })));

const HelpOverlay = lazy(() => import('../components/HelpOverlay').then((module) => ({ default: module.HelpOverlay })));

const fallbackActionKeys = [
  'actions.create',
  'actions.bulkUpload',
  'actions.bulkDownload',
  'actions.addToCart',
  'actions.runCart',
  'actions.export',
  'actions.import',
  'actions.purge',
  'actions.systemUpdate',
  'actions.debugToggle',
] as const;

export const AppShell = ({ children }: PropsWithChildren) => {
  const reducedMotion = useReducedMotionPreference();
  const [helpOpen, setHelpOpen] = useState(false);
  const { t } = useTranslation();

  const actionDockFallback = (
    <aside
      className="sticky top-0 z-[40] flex h-full w-[124px] flex-col items-center gap-3 border-l border-border-subtle bg-surface-elevated/90 px-4 py-6 backdrop-blur-panel shadow-panel"
      aria-label="Quick actions"
      aria-busy="true"
      data-loaded="pending"
      data-help-id="action-dock"
      data-help-title={t('helpOverlay.actionDock.title')}
      data-help-description={t('helpOverlay.actionDock.body')}
    >
      <div className="flex w-full flex-col gap-3">
        {fallbackActionKeys.map((key) => (
          <button
            key={key}
            type="button"
            className="flex h-20 w-full flex-col items-center justify-center gap-2 rounded-lg border border-border-subtle text-xs text-foreground-muted"
            disabled
          >
            <span className="text-center leading-tight">{t(key)}</span>
          </button>
        ))}
        <p className="pt-2 text-center text-[11px] text-foreground-muted">{t('helpOverlay.visibleActions')}</p>
      </div>
    </aside>
  );

  const taskCartFallback = (
    <aside
      className="pointer-events-none fixed bottom-4 right-[144px] z-[45] flex max-h-[70vh] flex-col items-end"
      data-help-id="task-cart"
      data-help-title={t('helpOverlay.taskCart.title')}
      data-help-description={t('helpOverlay.taskCart.body')}
      aria-busy="true"
      data-loaded="pending"
    >
      <button
        type="button"
        className="pointer-events-auto mb-2 flex items-center gap-2 rounded-full border border-border-strong bg-surface-elevated/70 px-4 py-2 text-sm text-foreground-muted shadow-panel"
        disabled
      >
        {t('actions.addToCart')}
      </button>
      <div className="pointer-events-auto flex w-[460px] flex-col gap-3 overflow-hidden rounded-2xl border border-border-strong bg-surface-overlay/80 p-4 text-sm text-foreground-muted shadow-panel backdrop-blur-panel">
        <p className="text-base font-semibold text-foreground">{t('helpOverlay.taskCart.title')}</p>
        <p className="text-xs text-foreground-muted">{t('helpOverlay.taskCart.body')}</p>
        <p className="text-xs text-foreground-muted">{t('helpOverlay.visibleActions')}</p>
      </div>
    </aside>
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const suppress = window.localStorage.getItem(HELP_SUPPRESS_KEY) === 'true';
    const seen = window.localStorage.getItem(HELP_SEEN_KEY) === 'true';
    if (!suppress && !seen) {
      setHelpOpen(true);
      window.localStorage.setItem(HELP_SEEN_KEY, 'true');
    }
  }, []);

  const showHelp = useCallback(() => {
    setHelpOpen(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HELP_SEEN_KEY, 'true');
      window.localStorage.removeItem(HELP_SUPPRESS_KEY);
    }
  }, []);

  const hideHelp = useCallback(() => {
    setHelpOpen(false);
  }, []);

  const rememberHelp = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(HELP_SUPPRESS_KEY, 'true');
    }
    setHelpOpen(false);
  }, []);

  return (
    <div className="grid h-full w-full grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] bg-surface-base text-foreground">
      <TopBar reducedMotion={reducedMotion} className="col-span-3" onShowHelp={showHelp} />
      <MegaRail className="row-span-2" />
      <main
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-base"
        data-help-id="work-canvas"
        data-help-title={t('helpOverlay.workCanvas.title')}
        data-help-description={t('helpOverlay.workCanvas.body')}
      >
        <div className="flex min-h-0 flex-1 flex-row gap-4 p-4">
          {children}
        </div>
      </main>
      <Suspense fallback={actionDockFallback}>
        <ActionDock className="row-span-2" />
      </Suspense>
      <StatusTimeline className="col-span-3" />
      <Suspense fallback={taskCartFallback}>
        <TaskCartTray reducedMotion={reducedMotion} />
      </Suspense>
      <Suspense fallback={null}>
        <HelpOverlay open={helpOpen} onClose={hideHelp} onRemember={rememberHelp} />
      </Suspense>
    </div>
  );
};
