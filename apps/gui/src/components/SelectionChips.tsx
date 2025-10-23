import { useMemo } from 'react';
import { clsx } from 'clsx';
import { useSelectionStore } from '../state/selection';

export const SelectionChips = () => {
  const { selections, clear } = useSelectionStore();
  const entries = useMemo(() => Object.entries(selections), [selections]);

  if (entries.length === 0) {
    return (
      <div className="flex min-w-[220px] items-center justify-center rounded-full border border-border-subtle px-4 py-2 text-xs text-foreground-muted">
        No selections yet
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {entries.map(([scope, items]) => (
        <button
          key={scope}
          type="button"
          className={clsx(
            'flex items-center gap-2 rounded-full border border-border-strong bg-surface-subtle/70 px-4 py-2 text-xs text-foreground-secondary transition-colors hover:text-foreground',
          )}
        >
          <span className="font-semibold capitalize">{scope}</span>
          <span className="rounded-full bg-border-strong px-2 py-0.5 text-[10px] text-foreground">{items.length}</span>
        </button>
      ))}
      <button
        type="button"
        onClick={clear}
        className="rounded-full border border-border-subtle px-3 py-2 text-xs text-foreground-muted transition-colors hover:border-border-strong hover:text-foreground"
      >
        Clear
      </button>
    </div>
  );
};
