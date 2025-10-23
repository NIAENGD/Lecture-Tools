import { useEffect, useState } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { useFeatureFlagsStore } from '../../state/featureFlags';
import { useToastStore } from '../../state/toast';
import { apiClient, getApiBaseUrl } from '../../lib/apiClient';
import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';

const processingDefaults = {
  whisperModel: ['Tiny', 'Medium', 'Large'],
  compute: ['CPU', 'GPU'],
  beamWidth: ['1', '3', '5'],
};

export const SystemView = () => {
  const flags = useFeatureFlagsStore((state) => state.flags);
  const setFlag = useFeatureFlagsStore((state) => state.setFlag);
  const pushToast = useToastStore((state) => state.pushToast);
  const [appearance, setAppearance] = useState<'system' | 'light' | 'dark'>('system');
  const [language, setLanguage] = useState('en');
  const [processing, setProcessing] = useState({ model: 'Medium', compute: 'GPU', beam: '5' });
  const [gpuProbe, setGpuProbe] = useState<'idle' | 'checking' | 'ready' | 'fallback'>('idle');
  const [updateLogs, setUpdateLogs] = useState<string[]>([]);
  const [updating, setUpdating] = useState(false);
  const { data: gpuDefault } = useGpuDefaults();

  useEffect(() => {
    if (gpuDefault) {
      setProcessing((prev) => ({ ...prev, compute: gpuDefault.compute }));
    }
  }, [gpuDefault]);

  useEffect(() => {
    if (!updating) return;
    const timer = window.setInterval(() => {
      setUpdateLogs((logs) => [...logs.slice(-40), `[${new Date().toLocaleTimeString()}] applying patch chunk…`]);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [updating]);

  const startUpdate = () => {
    setUpdating(true);
    setUpdateLogs((logs) => [...logs, `[${new Date().toLocaleTimeString()}] update scheduled`] );
    pushToast({ title: 'System update', description: 'Update started. Monitoring in panel.' });
  };

  const stopUpdate = () => {
    setUpdating(false);
    setUpdateLogs((logs) => [...logs, `[${new Date().toLocaleTimeString()}] update completed`] );
  };

  const runGpuProbe = () => {
    setGpuProbe('checking');
    pushToast({ title: 'GPU probe running', description: 'Detecting available accelerators.' });
    window.setTimeout(() => {
      const success = Math.random() > 0.2;
      setGpuProbe(success ? 'ready' : 'fallback');
      pushToast({
        title: success ? 'GPU ready' : 'GPU fallback',
        description: success ? 'Auto-configured for GPU tasks.' : 'Falling back to CPU for stability.',
      });
    }, 900);
  };

  return (
    <div className="flex h-full w-full gap-4">
      <section className="flex w-1/2 flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header>
          <h2 className="text-base font-semibold text-foreground">Settings</h2>
          <p className="text-xs text-foreground-muted">All controls visible; two taps to adjust.</p>
        </header>
        <div className="space-y-4 text-sm text-foreground">
          <SettingCard title="Appearance">
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(['system', 'light', 'dark'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAppearance(mode)}
                  className={clsx(
                    'h-12 rounded-lg border border-border-subtle',
                    appearance === mode ? 'border-focus shadow-focus' : 'hover:border-border-strong',
                  )}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </SettingCard>
          <SettingCard title="Language">
            <div className="grid grid-cols-4 gap-2 text-xs">
              {[
                { id: 'en', label: 'English' },
                { id: 'zh', label: '中文' },
                { id: 'es', label: 'Español' },
                { id: 'fr', label: 'Français' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setLanguage(option.id)}
                  className={clsx(
                    'h-12 rounded-lg border border-border-subtle',
                    language === option.id ? 'border-focus shadow-focus' : 'hover:border-border-strong',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </SettingCard>
          <SettingCard title="Processing Defaults">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <select
                value={processing.model}
                onChange={(event) => setProcessing((prev) => ({ ...prev, model: event.target.value }))}
                className="h-11 rounded-lg border border-border-subtle bg-surface-base px-3"
              >
                {processingDefaults.whisperModel.map((model) => (
                  <option key={model}>{model}</option>
                ))}
              </select>
              <select
                value={processing.compute}
                onChange={(event) => setProcessing((prev) => ({ ...prev, compute: event.target.value }))}
                className="h-11 rounded-lg border border-border-subtle bg-surface-base px-3"
              >
                {processingDefaults.compute.map((mode) => (
                  <option key={mode}>{mode}</option>
                ))}
              </select>
              <select
                value={processing.beam}
                onChange={(event) => setProcessing((prev) => ({ ...prev, beam: event.target.value }))}
                className="h-11 rounded-lg border border-border-subtle bg-surface-base px-3"
              >
                {processingDefaults.beamWidth.map((beam) => (
                  <option key={beam}>{beam}</option>
                ))}
              </select>
            </div>
          </SettingCard>
          <SettingCard title="Debug Mode">
            <div className="mt-2 flex items-center justify-between text-xs">
              <p className="text-foreground-muted">Expose event stream and logs.</p>
              <label className="flex items-center gap-2">
                <span>{flags.enableDebug ? 'On' : 'Off'}</span>
                <SwitchPrimitive.Root
                  checked={flags.enableDebug}
                  onCheckedChange={(value) => setFlag('enableDebug', value)}
                  className="relative h-6 w-11 rounded-full border border-border-subtle bg-border-subtle transition-colors data-[state=checked]:bg-brand-primary"
                >
                  <SwitchPrimitive.Thumb className="absolute left-1 top-1 h-4 w-4 rounded-full bg-surface-base transition-transform data-[state=checked]:translate-x-5" />
                  <span className="sr-only">Toggle debug mode</span>
                </SwitchPrimitive.Root>
              </label>
            </div>
          </SettingCard>
          <SettingCard title="GPU Probe">
            <div className="flex items-center justify-between text-xs text-foreground-muted">
              <span>Status: {gpuProbe === 'idle' ? 'Idle' : gpuProbe === 'checking' ? 'Checking…' : gpuProbe === 'ready' ? 'Ready' : 'Fallback to CPU'}</span>
              <button
                type="button"
                onClick={runGpuProbe}
                className="rounded-full border border-border-subtle px-3 py-1"
              >
                Run Probe
              </button>
            </div>
          </SettingCard>
        </div>
      </section>
      <section className="flex w-1/2 flex-col gap-4 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">System Update</h2>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={startUpdate}
              className="rounded-full border border-border-subtle px-3 py-1"
              disabled={updating}
            >
              Start Update
            </button>
            <button
              type="button"
              onClick={stopUpdate}
              className="rounded-full border border-border-subtle px-3 py-1"
            >
              Shutdown
            </button>
          </div>
        </header>
        <article className="flex flex-1 flex-col gap-3 rounded-2xl border border-border-subtle bg-surface-base/70 p-4 text-sm text-foreground">
          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>Version</span>
            <span>2024.10.18</span>
          </div>
          <div className="flex items-center justify-between text-xs text-foreground-muted">
            <span>Last Check</span>
            <span>{new Date().toLocaleTimeString()}</span>
          </div>
          <div className="flex-1 overflow-y-auto rounded-lg border border-border-subtle bg-surface-subtle/60 p-3 font-mono text-xs text-foreground-muted">
            {updateLogs.length === 0 ? 'Streaming logs appear here…' : updateLogs.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
          </div>
          <div className="flex items-center justify-end text-xs text-foreground-muted">
            {updating ? 'Update in progress…' : 'System idle'}
          </div>
        </article>
      </section>
    </div>
  );
};

const SettingCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-2xl border border-border-subtle bg-surface-base/70 p-4">
    <h3 className="text-sm font-semibold">{title}</h3>
    <div className="mt-3">{children}</div>
  </div>
);

const useGpuDefaults = () => {
  const enabled = Boolean(getApiBaseUrl());
  return useQuery({
    queryKey: ['gpu-defaults'],
    enabled,
    queryFn: async () => {
      await apiClient.tasks.getProgress();
      return { compute: 'GPU' } as const;
    },
    staleTime: 60_000,
  });
};
