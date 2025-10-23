import { clsx } from 'clsx';
import { Home, BookOpen, ListTodo, HardDrive, Cog, Import, Bug } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const navItems = [
  { to: '/', icon: Home, labelKey: 'navigation.home' },
  { to: '/catalog', icon: BookOpen, labelKey: 'navigation.catalog' },
  { to: '/tasks', icon: ListTodo, labelKey: 'navigation.tasks' },
  { to: '/storage', icon: HardDrive, labelKey: 'navigation.storage' },
  { to: '/system', icon: Cog, labelKey: 'navigation.system' },
  { to: '/import-export', icon: Import, labelKey: 'navigation.importExport' },
  { to: '/debug', icon: Bug, labelKey: 'navigation.debug' },
];

type MegaRailProps = {
  className?: string;
};

export const MegaRail = ({ className }: MegaRailProps) => {
  const { t } = useTranslation();

  return (
    <nav
      aria-label="Primary navigation"
      className={clsx(
        'sticky top-0 flex h-full w-[96px] flex-col gap-3 border-r border-border-subtle bg-surface-elevated/95 px-3 py-6 backdrop-blur-panel shadow-panel',
        className,
      )}
      data-help-id="mega-rail"
      data-help-title={t('helpOverlay.megaRail.title')}
      data-help-description={t('helpOverlay.megaRail.body')}
    >
      <div className="space-y-2">
        {navItems.map(({ to, icon: Icon, labelKey }) => (
          <Link
            key={to}
            to={to}
            className="group flex h-20 w-full flex-col items-center justify-center gap-2 rounded-lg border border-transparent text-xs font-medium text-foreground-secondary transition-all hover:border-border-strong hover:bg-surface-subtle/60 hover:text-foreground"
            activeProps={{
              className: 'border-border-strong bg-surface-subtle/80 text-foreground',
            }}
          >
            <Icon className="h-6 w-6" strokeWidth={1.5} aria-hidden />
            <span>{t(labelKey)}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
};
