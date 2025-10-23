import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const HELP_ROOT_ID = 'lecture-tools-help-overlay-root';

type Highlight = {
  id: string;
  rect: DOMRect;
  title: string;
  description: string;
};

type HelpOverlayProps = {
  open: boolean;
  onClose: () => void;
  onRemember: () => void;
};

const collectHighlights = (): Highlight[] => {
  if (typeof document === 'undefined') return [];
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-help-id]'));
  return nodes
    .map((node) => {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      return {
        id: node.dataset.helpId ?? '',
        rect,
        title: node.dataset.helpTitle ?? '',
        description: node.dataset.helpDescription ?? '',
      } satisfies Highlight;
    })
    .filter((entry): entry is Highlight => Boolean(entry && entry.id));
};

export const HelpOverlay = ({ open, onClose, onRemember }: HelpOverlayProps) => {
  const { t } = useTranslation();
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    if (!open) return;

    const update = () => setHighlights(collectHighlights());
    update();

    const handle = window.setInterval(update, 300);
    const handleResize = () => update();
    const handleScroll = () => update();

    window.addEventListener('resize', handleResize, true);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.clearInterval(handle);
      window.removeEventListener('resize', handleResize, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open]);

  const portalTarget = useMemo(() => {
    if (typeof document === 'undefined') return null;
    let root = document.getElementById(HELP_ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = HELP_ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }, []);

  if (!open || !portalTarget) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('helpOverlay.title')}
      className="fixed inset-0 z-[90] flex items-start justify-center"
    >
      <div className="absolute inset-0 bg-surface-overlay/85 backdrop-blur-sm" onClick={onClose} />
      <div className="pointer-events-none absolute inset-0">
        {highlights.map((highlight) => (
          <div
            key={highlight.id}
            style={{
              top: Math.max(16, highlight.rect.top - 8),
              left: Math.max(16, highlight.rect.left - 8),
              width: highlight.rect.width + 16,
              height: highlight.rect.height + 16,
            }}
            className="pointer-events-none absolute rounded-3xl border-2 border-[#C9AFFF] bg-transparent shadow-[0_0_0_9999px_rgba(9,14,31,0.32)]"
          >
            <div className="pointer-events-auto absolute left-0 top-full mt-2 max-w-sm rounded-2xl border border-border-subtle bg-surface-overlay/95 px-4 py-3 text-sm text-foreground shadow-panel">
              <p className="font-semibold">{highlight.title}</p>
              {highlight.description ? (
                <p className="pt-1 text-xs text-foreground-muted">{highlight.description}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-events-auto relative mt-16 w-full max-w-3xl rounded-3xl border border-border-strong bg-surface-elevated/95 p-6 text-foreground shadow-panel">
        <div className="flex items-start justify-between gap-4" role="presentation">
          <div>
            <h2 className="text-2xl font-semibold">{t('helpOverlay.title')}</h2>
            <p className="text-sm text-foreground-muted">{t('helpOverlay.subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle text-foreground transition hover:border-border-strong"
            aria-label={t('helpOverlay.close')}
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs text-foreground-muted">
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1">
            <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> {t('helpOverlay.visibleActions')}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1">
            {t('helpOverlay.pressHoldHint')}
          </span>
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onRemember}
            className="rounded-full border border-border-subtle px-4 py-2 text-sm text-foreground-secondary transition hover:border-border-strong hover:text-foreground"
          >
            {t('helpOverlay.remember')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-gradient-to-r from-[#EAF4FF] via-[#EEE4FF] to-[#FFE8FA] px-4 py-2 text-sm font-medium text-slate-900 shadow focus:outline-none focus:ring-2 focus:ring-focus/60"
          >
            {t('helpOverlay.dismiss')}
          </button>
        </div>
      </div>
    </div>,
    portalTarget,
  );
};
