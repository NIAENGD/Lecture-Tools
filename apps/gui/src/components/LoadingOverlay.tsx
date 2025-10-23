import { motion } from 'framer-motion';
import { clsx } from 'clsx';

export type LoadingOverlayProps = {
  label?: string;
  className?: string;
};

export const LoadingOverlay = ({ label = 'Loading', className }: LoadingOverlayProps) => {
  return (
    <motion.div
      className={clsx(
        'flex h-full items-center justify-center gap-3 rounded-lg border border-border-subtle bg-surface-overlay/80 px-6 py-4 backdrop-blur-panel shadow-panel',
        className,
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      role="status"
      aria-live="polite"
    >
      <motion.span
        className="h-3 w-3 rounded-full bg-foreground animate-pulse"
        aria-hidden
        transition={{ repeat: Infinity, duration: 0.6, repeatType: 'reverse' }}
      />
      <span className="text-sm font-medium text-foreground-secondary">{label}</span>
    </motion.div>
  );
};
