import { AnimatePresence, motion } from 'framer-motion';
import {
  Pause,
  Play,
  GripVertical,
  Settings2,
  ShoppingCart,
  RefreshCcw,
  Save,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import {
  useTaskCartStore,
  selectTaskCartPresets,
  type TaskCartItem,
} from '../../state/taskCart';
import { useTaskCartEngine } from '../../lib/useTaskCartEngine';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

export type TaskCartTrayProps = {
  reducedMotion: boolean;
};

export const TaskCartTray = ({ reducedMotion }: TaskCartTrayProps) => {
  const presets = useTaskCartStore(selectTaskCartPresets);
  const [open, setOpen] = useState(true);
  const [presetName, setPresetName] = useState('');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const engine = useTaskCartEngine();
  const { t } = useTranslation();

  const totalDuration = useMemo(
    () => engine.items.reduce((sum, item) => sum + (item.estMs ?? 0), 0),
    [engine.items],
  );

  const togglePresetSave = () => {
    if (!presetName.trim()) return;
    engine.savePreset(presetName.trim());
    setPresetName('');
  };

  return (
    <aside
      className="pointer-events-none fixed bottom-4 right-[144px] z-[45] flex max-h-[70vh] flex-col items-end"
      data-help-id="task-cart"
      data-help-title={t('helpOverlay.taskCart.title')}
      data-help-description={t('helpOverlay.taskCart.body')}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto mb-2 flex items-center gap-2 rounded-full border border-border-strong bg-surface-elevated/90 px-4 py-2 text-sm text-foreground shadow-panel"
      >
        <ShoppingCart className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Task Cart ({engine.items.length})
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="cart"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: reducedMotion ? 0 : 0.2 }}
            className="pointer-events-auto flex w-[460px] flex-col gap-4 overflow-hidden rounded-2xl border border-border-strong bg-surface-overlay/95 p-4 shadow-panel backdrop-blur-panel"
          >
            <header className="flex items-start justify-between">
              <div>
                <p className="text-base font-semibold text-foreground">Peace Mode Queue</p>
                <p className="text-xs text-foreground-muted">
                  Batch safely with presets, dry runs, and full telemetry.
                </p>
                <p className="pt-1 text-xs text-foreground-muted">
                  Total est: {formatMinutes(totalDuration)}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 text-xs">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => (engine.running ? engine.pause() : engine.run())}
                    disabled={engine.runPending || engine.controlPending}
                    className="flex h-10 min-w-[110px] items-center justify-center gap-2 rounded-lg border border-border-strong px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-focus hover:text-focus disabled:opacity-60"
                  >
                    {engine.running ? (
                      <>
                        <Pause className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                        Run
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => engine.dryRun()}
                    disabled={engine.runPending}
                    className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border-subtle px-3 py-2 text-sm text-foreground transition-colors hover:border-focus hover:text-focus disabled:opacity-60"
                  >
                    <RefreshCcw className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Dry Run
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => engine.resume()}
                    disabled={engine.running || engine.controlPending}
                    className="rounded-full border border-border-subtle px-3 py-1 hover:border-focus hover:text-focus disabled:opacity-50"
                  >
                    Resume
                  </button>
                  <button
                    type="button"
                    onClick={() => engine.cancel()}
                    disabled={engine.controlPending}
                    className="rounded-full border border-border-subtle px-3 py-1 text-brand-danger hover:border-brand-danger hover:text-brand-danger disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </header>

            <section className="flex items-center gap-3 text-xs text-foreground-muted">
              <label className="flex flex-1 flex-col gap-1">
                Parallelism
                <select
                  value={engine.parallelism}
                  onChange={(event) =>
                    engine.setParallelism(
                      event.target.value === 'auto' ? 'auto' : (Number(event.target.value) as 1 | 2 | 4),
                    )
                  }
                  className="h-11 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm text-foreground focus:border-focus focus:shadow-focus"
                >
                  <option value="auto">Auto</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="4">4</option>
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1">
                On completion
                <select
                  value={engine.onCompletion}
                  onChange={(event) => engine.setOnCompletion(event.target.value as any)}
                  className="h-11 rounded-lg border border-border-subtle bg-surface-base px-3 text-sm text-foreground focus:border-focus focus:shadow-focus"
                >
                  <option value="notify">Notify</option>
                  <option value="shutdown">Shutdown</option>
                  <option value="nothing">Do nothing</option>
                </select>
              </label>
            </section>

            <section className="flex flex-col gap-2 rounded-2xl border border-border-subtle bg-surface-base/70 p-3">
              <header className="flex items-center justify-between text-xs text-foreground">
                <span className="font-medium">Presets</span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={presetName}
                    onChange={(event) => setPresetName(event.target.value)}
                    placeholder="Preset name"
                    className="h-8 w-32 rounded-lg border border-border-subtle bg-surface-base px-2 text-xs text-foreground focus:border-focus"
                  />
                  <button
                    type="button"
                    onClick={togglePresetSave}
                    className="flex items-center gap-1 rounded-full border border-border-subtle px-3 py-1 text-xs hover:border-focus hover:text-focus"
                  >
                    <Save className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Save
                  </button>
                </div>
              </header>
              {presets.length ? (
                <ul className="flex flex-wrap gap-2 text-xs">
                  {presets.map((preset) => (
                    <li key={preset.id} className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1">
                      <button type="button" onClick={() => engine.loadPreset(preset.id)} className="text-foreground">
                        {preset.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => engine.deletePreset(preset.id)}
                        className="text-foreground-muted hover:text-brand-danger"
                        aria-label={`Delete ${preset.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-foreground-muted">No presets yet. Save a configuration to reuse later.</p>
              )}
            </section>

            <section className="flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-surface-base/80">
              <Virtuoso
                className="h-full"
                data={engine.items}
                itemContent={(index, item) => (
                  <CartItemRow
                    key={item.id}
                    item={item}
                    expanded={expandedItem === item.id}
                    onToggle={() => setExpandedItem((value) => (value === item.id ? null : item.id))}
                    onRemove={() => engine.removeItem(item.id)}
                  />
                )}
              />
            </section>

            <footer className="flex items-center justify-between text-xs text-foreground-muted">
              <span>
                Active batch: {engine.activeBatchId ? engine.activeBatchId : 'not running'}
              </span>
              <button type="button" className="flex items-center gap-2 text-foreground">
                <Settings2 className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Manage presets
              </button>
            </footer>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </aside>
  );
};

type CartItemRowProps = {
  item: TaskCartItem;
  expanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
};

const CartItemRow = ({ item, expanded, onToggle, onRemove }: CartItemRowProps) => {
  const durationLabel = formatMinutes(item.estMs);
  return (
    <article className="border-b border-border-subtle px-3 py-3 text-sm text-foreground last:border-b-0">
      <header className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          className="mt-1 flex h-7 w-7 items-center justify-center rounded-full border border-border-subtle bg-surface-subtle text-foreground-muted"
          aria-label="Toggle details"
        >
          <GripVertical className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        </button>
        <div className="flex-1 space-y-1">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="text-xs text-foreground-muted">{item.action}</p>
            </div>
            <span
              className={clsx(
                'rounded-full border border-border-subtle px-2 py-0.5 text-[10px] uppercase',
                stateTone(item.state),
              )}
            >
              {item.state}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-foreground-muted">
            <span className="rounded-full border border-border-subtle px-2 py-0.5">{durationLabel}</span>
            {item.prereqs?.map((prereq) => (
              <span key={prereq} className="rounded-full border border-border-subtle px-2 py-0.5">
                {prereq}
              </span>
            ))}
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto rounded-full border border-border-subtle px-3 py-1 text-foreground-secondary transition-colors hover:border-brand-danger hover:text-brand-danger"
            >
              Remove
            </button>
          </div>
        </div>
      </header>
      {expanded ? (
        <div className="mt-3 space-y-2 rounded-xl border border-border-subtle bg-surface-subtle/60 p-3 text-xs text-foreground">
          <div className="flex items-center justify-between">
            <span className="font-medium">Logs</span>
            <button type="button" onClick={onToggle} className="flex items-center gap-1 text-foreground-muted">
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden /> Collapse
            </button>
          </div>
          {item.logs.length ? (
            <ul className="space-y-1 max-h-32 overflow-y-auto pr-1">
              {item.logs.map((log) => (
                <li key={log.id} className={clsx('rounded-lg px-2 py-1', logTone(log.level))}>
                  <span className="mr-2 font-medium uppercase">{log.level}</span>
                  <span>{log.message}</span>
                  <span className="float-right text-[10px] text-foreground-muted">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-foreground-muted">No logs yet.</p>
          )}
          <div>
            <span className="font-medium">Parameters</span>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-base p-2 text-[11px] leading-relaxed text-foreground-muted">
              {JSON.stringify(item.params, null, 2)}
            </pre>
          </div>
        </div>
      ) : null}
    </article>
  );
};

const formatMinutes = (estMs: number) => {
  if (!estMs) return '—';
  const minutes = Math.max(0.1, estMs / 60000);
  return `${minutes.toFixed(minutes > 10 ? 0 : 1)}m`;
};

const stateTone = (state: TaskCartItem['state']) => {
  switch (state) {
    case 'success':
      return 'border-brand-success text-brand-success';
    case 'error':
      return 'border-brand-danger text-brand-danger';
    case 'running':
      return 'border-brand-primary text-brand-primary';
    case 'paused':
      return 'border-border-strong text-foreground';
    default:
      return 'text-foreground-muted';
  }
};

const logTone = (level: TaskCartItem['logs'][number]['level']) => {
  switch (level) {
    case 'error':
      return 'border border-brand-danger/40 bg-brand-danger/10 text-brand-danger';
    case 'warn':
      return 'border border-brand-warning/40 bg-brand-warning/10 text-brand-warning-strong';
    default:
      return 'border border-border-subtle bg-surface-base text-foreground';
  }
};
