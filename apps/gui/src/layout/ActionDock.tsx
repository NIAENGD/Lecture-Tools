import { clsx } from 'clsx';
import {
  Plus,
  UploadCloud,
  DownloadCloud,
  ShoppingCart,
  Play,
  FileDown,
  FileUp,
  Trash2,
  RefreshCcw,
  BugOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useToastStore } from '../state/toast';
import { useTaskCartStore } from '../state/taskCart';
import { useNavigate } from '@tanstack/react-router';
import { useTimelineStore } from '../state/timeline';
import { useState, useRef, useCallback } from 'react';
import { useTaskCartEngine } from '../lib/useTaskCartEngine';
import { useRoleGuard } from '../state/auth';

type DockAction = {
  id: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  labelKey: string;
  descriptionKey: string;
  destructive?: boolean;
  requiredRoles: string[];
  onActivate: () => void;
};

type ActionDockProps = {
  className?: string;
};

const holdDuration = 800;

export const ActionDock = ({ className }: ActionDockProps) => {
  const { t } = useTranslation();
  const pushToast = useToastStore((state) => state.pushToast);
  const addCartItem = useTaskCartStore((state) => state.addItem);
  const cartEngine = useTaskCartEngine({ subscribe: false });
  const cartHasItems = cartEngine.items.length > 0;
  const timelinePush = useTimelineStore((state) => state.push);
  const navigate = useNavigate({ from: '/' });
  const { assertAccess } = useRoleGuard();

  const actions: DockAction[] = [
    {
      id: 'create',
      icon: Plus,
      labelKey: 'actions.create',
      descriptionKey: 'actionDescriptions.create',
      requiredRoles: ['editor', 'admin'],
      onActivate: () => {
        pushToast({
          title: t('feedback.createQueued.title'),
          description: t('feedback.createQueued.body'),
        });
        navigate({ to: '/catalog', search: (prev) => ({ ...prev, mode: 'create' }) }).catch(() => undefined);
      },
    },
    {
      id: 'bulk-upload',
      icon: UploadCloud,
      labelKey: 'actions.bulkUpload',
      descriptionKey: 'actionDescriptions.bulkUpload',
      requiredRoles: ['editor', 'admin'],
      onActivate: () => {
        pushToast({
          title: t('feedback.bulkUpload.title'),
          description: t('feedback.bulkUpload.body'),
        });
        navigate({ to: '/catalog', search: (prev) => ({ ...prev, sheet: 'upload' }) }).catch(() => undefined);
      },
    },
    {
      id: 'bulk-download',
      icon: DownloadCloud,
      labelKey: 'actions.bulkDownload',
      descriptionKey: 'actionDescriptions.bulkDownload',
      requiredRoles: ['editor', 'admin'],
      onActivate: () => {
        pushToast({
          title: t('feedback.bulkDownload.title'),
          description: t('feedback.bulkDownload.body'),
        });
        navigate({ to: '/import-export', search: (prev) => ({ ...prev, mode: 'export' }) }).catch(() => undefined);
      },
    },
    {
      id: 'add-cart',
      icon: ShoppingCart,
      labelKey: 'actions.addToCart',
      descriptionKey: 'actionDescriptions.addToCart',
      requiredRoles: ['editor', 'operator'],
      onActivate: () => {
        addCartItem({
          title: 'Selection batch',
          action: 'Queued actions',
          estMs: 6 * 60_000,
          params: { scope: 'selection' },
          prereqs: ['Selection reviewed'],
        });
        pushToast({ title: t('feedback.addToCart.title'), description: t('feedback.addToCart.body') });
      },
    },
    {
      id: 'run-cart',
      icon: Play,
      labelKey: 'actions.runCart',
      descriptionKey: 'actionDescriptions.runCart',
      requiredRoles: ['operator', 'admin'],
      onActivate: () => {
        if (!cartHasItems) {
          pushToast({ title: t('feedback.runCartEmpty.title'), description: t('feedback.runCartEmpty.body') });
          return;
        }
        cartEngine.run();
        pushToast({ title: t('feedback.runCart.title'), description: t('feedback.runCart.body') });
        timelinePush({ title: t('feedback.runCart.title'), status: 'Running' });
      },
    },
    {
      id: 'export',
      icon: FileDown,
      labelKey: 'actions.export',
      descriptionKey: 'actionDescriptions.export',
      requiredRoles: ['editor', 'admin'],
      onActivate: () => {
        pushToast({ title: t('feedback.export.title'), description: t('feedback.export.body') });
        navigate({ to: '/import-export', search: (prev) => ({ ...prev, mode: 'export' }) }).catch(() => undefined);
      },
    },
    {
      id: 'import',
      icon: FileUp,
      labelKey: 'actions.import',
      descriptionKey: 'actionDescriptions.import',
      requiredRoles: ['editor', 'admin'],
      onActivate: () => {
        pushToast({ title: t('feedback.import.title'), description: t('feedback.import.body') });
        navigate({ to: '/import-export', search: (prev) => ({ ...prev, mode: 'import' }) }).catch(() => undefined);
      },
    },
    {
      id: 'purge',
      icon: Trash2,
      labelKey: 'actions.purge',
      descriptionKey: 'actionDescriptions.purge',
      destructive: true,
      requiredRoles: ['admin'],
      onActivate: () => {
        pushToast({ title: t('feedback.purge.title'), description: t('feedback.purge.body') });
        timelinePush({ title: t('feedback.purge.title'), status: t('feedback.purge.body') });
      },
    },
    {
      id: 'system-update',
      icon: RefreshCcw,
      labelKey: 'actions.systemUpdate',
      descriptionKey: 'actionDescriptions.systemUpdate',
      destructive: true,
      requiredRoles: ['admin'],
      onActivate: () => {
        pushToast({ title: t('feedback.systemUpdate.title'), description: t('feedback.systemUpdate.body') });
        navigate({ to: '/system', search: (prev) => ({ ...prev, tab: 'updates' }) }).catch(() => undefined);
      },
    },
    {
      id: 'debug-toggle',
      icon: BugOff,
      labelKey: 'actions.debugToggle',
      descriptionKey: 'actionDescriptions.debugToggle',
      requiredRoles: ['admin', 'debugger'],
      onActivate: () => {
        pushToast({ title: t('feedback.debug.title'), description: t('feedback.debug.body') });
        navigate({ to: '/debug' }).catch(() => undefined);
      },
    },
  ];

  return (
    <Tooltip.Provider delayDuration={250}>
      <aside
        className={clsx(
          'sticky top-0 z-[40] flex h-full w-[124px] flex-col items-center gap-3 border-l border-border-subtle bg-surface-elevated/90 px-4 py-6 backdrop-blur-panel shadow-panel',
          className,
        )}
        aria-label="Quick actions"
        data-loaded="true"
        data-help-id="action-dock"
        data-help-title={t('helpOverlay.actionDock.title')}
        data-help-description={t('helpOverlay.actionDock.body')}
      >
        {actions.map((action) => (
          <Tooltip.Root key={action.id}>
            <Tooltip.Trigger asChild>
              {action.destructive ? (
                <PressHoldButton
                  icon={action.icon}
                  label={t(action.labelKey)}
                  onActivate={() => {
                    if (!assertAccess(action.requiredRoles, t(action.labelKey))) return;
                    action.onActivate();
                  }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!assertAccess(action.requiredRoles, t(action.labelKey))) return;
                    action.onActivate();
                  }}
                  className="flex h-20 w-full flex-col items-center justify-center gap-2 rounded-lg border border-border-subtle text-xs text-foreground-secondary transition-all hover:border-border-strong hover:text-foreground"
                >
                  <action.icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
                  <span className="text-center leading-tight">{t(action.labelKey)}</span>
                </button>
              )}
            </Tooltip.Trigger>
            <Tooltip.Content side="left" className="max-w-[220px] rounded-md border border-border-subtle bg-surface-overlay/90 px-3 py-2 text-xs text-foreground shadow-panel">
              {t(action.descriptionKey)}
            </Tooltip.Content>
          </Tooltip.Root>
        ))}
      </aside>
    </Tooltip.Provider>
  );
};

type PressHoldButtonProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  onActivate: () => void;
};

const PressHoldButton = ({ icon: Icon, label, onActivate }: PressHoldButtonProps) => {
  const [isHolding, setIsHolding] = useState(false);
  const timerRef = useRef<number>();

  const clear = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    setIsHolding(false);
  }, []);

  const handlePointerDown = () => {
    clear();
    setIsHolding(true);
    timerRef.current = window.setTimeout(() => {
      setIsHolding(false);
      onActivate();
    }, holdDuration);
  };

  const handlePointerUp = () => {
    if (!timerRef.current) return;
    clear();
  };

  return (
    <button
      type="button"
      data-holding={isHolding}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate();
        }
      }}
      className="relative flex h-20 w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-border-strong text-xs text-brand-danger transition-all hover:border-brand-danger/80 hover:text-brand-danger"
    >
      <span className="press-hold-overlay" aria-hidden data-active={isHolding} />
      <Icon className="relative z-10 h-6 w-6" strokeWidth={1.5} aria-hidden />
      <span className="relative z-10 text-center leading-tight">{label}</span>
    </button>
  );
};
