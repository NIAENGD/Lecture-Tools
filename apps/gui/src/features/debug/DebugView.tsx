import { useEffect, useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { getApiBaseUrl } from '../../lib/apiClient';
import { useToastStore } from '../../state/toast';
import { Copy, Filter, Activity } from 'lucide-react';
import clsx from 'clsx';
import { loadMockDebugEvents, type MockDebugEvent } from '../../lib/mockData';

type DebugEvent = MockDebugEvent;

export const DebugView = () => {
  const pushToast = useToastStore((state) => state.pushToast);
  const [severity, setSeverity] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [category, setCategory] = useState<'all' | 'transcription' | 'storage' | 'system'>('all');
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<DebugEvent[]>(() => loadMockDebugEvents());

  useEffect(() => {
    const baseUrl = getApiBaseUrl();
    if (!baseUrl) return;
    const source = new EventSource(`${baseUrl}/api/debug/stream`);
    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as DebugEvent;
        setEvents((prev) => [parsed, ...prev].slice(0, 500));
      } catch (error) {
        console.error('Failed to parse debug event', error);
      }
    };
    source.onerror = () => source.close();
    return () => source.close();
  }, []);

  const filtered = useMemo(() => {
    return events.filter((event) => {
      if (severity !== 'all' && event.severity !== severity) return false;
      if (category !== 'all' && event.category !== category) return false;
      if (query && !`${event.message}`.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [events, severity, category, query]);

  const copyLogs = () => {
    const text = filtered.slice(0, 50).map((event) => `[${new Date(event.timestamp).toISOString()}] ${event.severity.toUpperCase()} ${event.message}`).join('\n');
    navigator.clipboard.writeText(text).then(() => pushToast({ title: 'Logs copied', description: `${filtered.length} entries` }));
  };

  return (
    <div className="flex h-full w-full gap-4">
      <section className="w-1/3 space-y-3 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center gap-2">
          <Filter className="h-5 w-5" strokeWidth={1.5} aria-hidden />
          <div>
            <h2 className="text-base font-semibold text-foreground">Filters</h2>
            <p className="text-xs text-foreground-muted">Severity, category, search.</p>
          </div>
        </header>
        <div className="space-y-3 text-xs text-foreground">
          <label className="flex flex-col gap-1">
            <span className="text-foreground-muted">Severity</span>
            <select
              value={severity}
              onChange={(event) => setSeverity(event.target.value as typeof severity)}
              className="h-10 rounded-lg border border-border-subtle bg-surface-base px-2"
            >
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-foreground-muted">Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as typeof category)}
              className="h-10 rounded-lg border border-border-subtle bg-surface-base px-2"
            >
              <option value="all">All</option>
              <option value="transcription">Transcription</option>
              <option value="storage">Storage</option>
              <option value="system">System</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-foreground-muted">Search</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 rounded-lg border border-border-subtle bg-surface-base px-2"
              placeholder="Correlation ID, task, message"
            />
          </label>
          <div className="rounded-2xl border border-border-subtle bg-surface-base/70 p-3 text-xs text-foreground-muted">
            <p>Showing {filtered.length} of {events.length} events.</p>
            <p>Empty states are preserved when filters hide all.</p>
          </div>
        </div>
      </section>
      <section className="flex w-2/3 flex-col gap-3 rounded-3xl border border-border-subtle bg-surface-subtle/60 p-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5" strokeWidth={1.5} aria-hidden />
            <h2 className="text-base font-semibold text-foreground">Event Stream</h2>
          </div>
          <button className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1 text-xs" onClick={copyLogs}>
            <Copy className="h-4 w-4" strokeWidth={1.5} aria-hidden /> Copy Logs
          </button>
        </header>
        <div className="flex-1 overflow-hidden rounded-2xl border border-border-subtle bg-surface-base/70">
          <Virtuoso
            className="h-full"
            data={filtered}
            overscan={20}
            itemContent={(index, event) => (
              <DebugRow key={event.id} event={event} onCopy={() => navigator.clipboard.writeText(event.message).then(() => pushToast({ title: 'Event copied', description: event.id }))} />
            )}
          />
        </div>
      </section>
    </div>
  );
};

type DebugRowProps = {
  event: DebugEvent;
  onCopy: () => void;
};

const DebugRow = ({ event, onCopy }: DebugRowProps) => (
  <div className="flex items-start justify-between border-b border-border-subtle px-4 py-3 text-sm text-foreground last:border-b-0">
    <div>
      <p className={clsx('font-semibold capitalize', event.severity === 'error' && 'text-brand-danger', event.severity === 'warn' && 'text-brand-warning')}>
        {event.severity}
      </p>
      <p className="text-xs text-foreground-muted">{event.category} · {new Date(event.timestamp).toLocaleTimeString()}</p>
    </div>
    <p className="w-2/3 text-xs text-foreground-muted">{event.message}</p>
    <button className="rounded-full border border-border-subtle px-3 py-1 text-xs" onClick={onCopy}>
      Copy
    </button>
  </div>
);
