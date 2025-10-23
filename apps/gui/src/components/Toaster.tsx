import * as ToastPrimitive from '@radix-ui/react-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useToastStore } from '../state/toast';
import { useTranslation } from 'react-i18next';

export const Toaster = () => {
  const { toasts, removeToast } = useToastStore();
  const { t } = useTranslation();

  return (
    <ToastPrimitive.Provider>
      <div
        className="fixed right-6 bottom-6 z-[120] flex w-96 flex-col gap-3"
        role="status"
        aria-live="assertive"
        aria-label={t('layout.notificationsRegion')}
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastPrimitive.Root
              key={toast.id}
              open
              onOpenChange={(open) => !open && removeToast(toast.id)}
              asChild
            >
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                transition={{ duration: 0.15 }}
                className="rounded-lg border border-border-strong bg-surface-overlay/90 p-4 shadow-panel backdrop-blur-panel"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{toast.title}</p>
                    {toast.description ? (
                      <p className="mt-1 text-xs text-foreground-muted">{toast.description}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeToast(toast.id)}
                    className="rounded-md border border-border-subtle px-2 py-1 text-xs text-foreground-secondary transition-colors hover:border-border-strong hover:text-foreground"
                  >
                    {toast.actionLabel ?? t('layout.dismiss')}
                  </button>
                </div>
              </motion.div>
            </ToastPrimitive.Root>
          ))}
        </AnimatePresence>
      </div>
      <ToastPrimitive.Viewport aria-hidden="true" />
    </ToastPrimitive.Provider>
  );
};
