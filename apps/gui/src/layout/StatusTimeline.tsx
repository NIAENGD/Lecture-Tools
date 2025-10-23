import { clsx } from 'clsx';
import { useTimelineStore } from '../state/timeline';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Clock } from 'lucide-react';

type StatusTimelineProps = {
  className?: string;
};

export const StatusTimeline = ({ className }: StatusTimelineProps) => {
  const { events } = useTimelineStore();
  const { t } = useTranslation();
  const navigate = useNavigate({ from: '/' });

  return (
    <footer
      className={clsx(
        'sticky bottom-0 flex items-center gap-4 border-t border-border-subtle bg-surface-elevated/90 px-6 py-3 backdrop-blur-panel shadow-panel',
        className,
      )}
      aria-label={t('layout.statusTimeline')}
      data-help-id="status-timeline"
      data-help-title={t('helpOverlay.timeline.title')}
      data-help-description={t('helpOverlay.timeline.body')}
    >
      <button
        type="button"
        className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1 text-xs text-foreground-secondary transition-colors hover:border-border-strong hover:text-foreground"
        onClick={() => navigate({ to: '/tasks' }).catch(() => undefined)}
      >
        <Clock className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        {t('layout.openTasks', 'Open Tasks')}
        <span className="rounded-full border border-border-subtle px-2 py-0.5 text-[10px] text-foreground-muted">{events.length}</span>
      </button>
      <div className="flex flex-1 items-center gap-3 overflow-x-auto">
        <AnimatePresence initial={false}>
          {events.map((event) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.15 }}
              className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-subtle/70 px-3 py-1 text-xs text-foreground-secondary"
            >
              <span className="font-medium text-foreground">{event.title}</span>
              <span className="text-foreground-muted">{event.status}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </footer>
  );
};
