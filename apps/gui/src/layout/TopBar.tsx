import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';
import { Globe, MoonStar, Cpu, Languages, HelpCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTaskMetrics } from '../state/taskMetrics';
import { SelectionChips } from '../components/SelectionChips';
import { GlobalSearch } from './GlobalSearch';
import { useLocaleFormatter } from '../lib/useLocaleFormatter';
import { resolveLocale, supportedLocales, type SupportedLocale } from '../config/i18n';

const localeLabels: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  zh: '中文',
};

type TopBarProps = {
  className?: string;
  reducedMotion: boolean;
  onShowHelp: () => void;
};

export const TopBar = ({ className, onShowHelp }: TopBarProps) => {
  const { t, i18n } = useTranslation();
  const { cpuLoad, activeTasks, storageUsage } = useTaskMetrics();
  const { formatPercent, formatNumber } = useLocaleFormatter();
  const formattedTaskCount = formatNumber(activeTasks, { maximumFractionDigits: 0 });
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'system';
    return (window.localStorage.getItem('lt-theme') as 'system' | 'light' | 'dark') ?? 'system';
  });
  const [language, setLanguage] = useState<SupportedLocale>(() => resolveLocale(i18n.language ?? 'en'));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('lt-theme', theme);
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
      return;
    }
    root.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handleLanguageChange = (lng: string) => setLanguage(resolveLocale(lng));
    i18n.on('languageChanged', handleLanguageChange);
    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, [i18n]);

  return (
    <header
      className={clsx(
        'sticky top-0 z-[30] flex items-center gap-4 border-b border-border-subtle bg-surface-elevated/90 px-6 py-4 backdrop-blur-panel shadow-panel',
        className,
      )}
      data-help-id="top-bar"
      data-help-title={t('helpOverlay.topBar.title')}
      data-help-description={t('helpOverlay.topBar.body')}
    >
      <GlobalSearch />
      <SelectionChips />
      <div className="flex items-center gap-3">
        <StatusBadge
          icon={Cpu}
          label={formatPercent(cpuLoad)}
          tooltip={t('layout.cpuTooltip')}
          variant="cpu"
        />
        <StatusBadge
          icon={MoonStar}
          label={t('layout.taskBadge', { value: formattedTaskCount })}
          tooltip={t('layout.tasksTooltip')}
          variant="tasks"
        />
        <StatusBadge
          icon={Globe}
          label={t('layout.storageBadge', { percent: formatPercent(storageUsage) })}
          tooltip={t('layout.storageTooltip')}
          variant="storage"
        />
      </div>
      <div className="flex items-center gap-2 pl-4">
        <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 py-1.5 text-xs text-foreground">
          <Languages className="h-4 w-4" strokeWidth={1.5} />
          <select
            value={language}
            onChange={(event) => {
              const next = event.target.value as SupportedLocale;
              setLanguage(next);
              void i18n.changeLanguage(next);
            }}
            className="bg-transparent text-sm focus:outline-none"
            aria-label={t('layout.languageToggle', 'Switch language')}
          >
            {supportedLocales.map((locale) => (
              <option key={locale} value={locale}>
                {localeLabels[locale]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 py-1.5 text-xs text-foreground">
          <MoonStar className="h-4 w-4" strokeWidth={1.5} />
          <select
            value={theme}
            onChange={(event) => setTheme(event.target.value as typeof theme)}
            className="bg-transparent text-sm focus:outline-none"
            aria-label={t('layout.themeToggle', 'Change theme')}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <button
          type="button"
          onClick={onShowHelp}
          className="flex h-10 items-center gap-2 rounded-full border border-border-subtle bg-surface-base px-3 text-xs text-foreground-secondary transition hover:border-border-strong hover:text-foreground"
          aria-label={t('layout.openHelp')}
        >
          <HelpCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden />
          <span>{t('layout.helpLabel')}</span>
        </button>
      </div>
    </header>
  );
};

type StatusBadgeProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  tooltip: string;
  variant: 'cpu' | 'tasks' | 'storage';
};

const variantClasses: Record<StatusBadgeProps['variant'], string> = {
  cpu: 'bg-gradient-to-r from-[#F0E8FF] via-[#DDEFFF] to-[#CFFFF9]',
  tasks: 'bg-gradient-to-r from-[#EAF4FF] via-[#EEE4FF] to-[#FFE8FA]',
  storage: 'bg-gradient-to-r from-[#E4FFF0] via-[#E9FFD8] to-[#FFFDEB]',
};

const StatusBadge = ({ icon: Icon, label, tooltip, variant }: StatusBadgeProps) => (
  <div
    className={clsx(
      'flex min-w-[120px] items-center justify-center gap-2 rounded-pill px-3 py-2 text-xs font-medium text-slate-900 shadow-inner transition-transform',
      variantClasses[variant],
    )}
    role="status"
    aria-label={tooltip}
  >
    <Icon className="h-4 w-4" strokeWidth={1.5} aria-hidden />
    <span>{label}</span>
  </div>
);
