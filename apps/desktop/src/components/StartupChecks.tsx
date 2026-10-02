import { useEffect, useState } from 'react';
import { Database, FileSearch, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';

type CheckStatus = 'loading' | 'ok' | 'error';

interface Check {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

const initialChecks: Check[] = [
  { key: 'ipc', label: 'Typed IPC bridge', status: 'loading', detail: 'Contacting main process…' },
  { key: 'sqlite', label: 'SQLite storage', status: 'loading', detail: 'Opening local database…' },
  { key: 'fts5', label: 'FTS5 full-text search', status: 'loading', detail: 'Running probe query…' },
  {
    key: 'security',
    label: 'Electron isolation',
    status: 'loading',
    detail: 'Verifying sandbox flags…',
  },
];

function statusIcon(status: CheckStatus) {
  if (status === 'loading') {
    return <Loader2 className="h-4 w-4 animate-spin text-sky-400" aria-hidden="true" />;
  }
  if (status === 'ok') {
    return <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
  }
  return <ShieldAlert className="h-4 w-4 text-rose-400" aria-hidden="true" />;
}

function statusText(status: CheckStatus): string {
  if (status === 'loading') return 'checking';
  if (status === 'ok') return 'ok';
  return 'error';
}

export default function StartupChecks(): React.ReactElement {
  const [checks, setChecks] = useState<Check[]>(initialChecks);

  useEffect(() => {
    let cancelled = false;

    function update(key: string, status: CheckStatus, detail: string): void {
      if (cancelled) return;
      setChecks((prev) => prev.map((c) => (c.key === key ? { ...c, status, detail } : c)));
    }

    async function run(): Promise<void> {
      try {
        const result = await window.contextBridgeApi.ping({ nonce: 'startup-checks' });
        if (!result.ok) {
          update('ipc', 'error', `Bridge error: ${result.error.code}`);
          update('sqlite', 'error', 'Not reachable');
          update('fts5', 'error', 'Not reachable');
          update('security', 'error', 'Not verified');
          return;
        }
        const { probe, security, appVersion, platform } = result.value;
        update(
          'ipc',
          'ok',
          `v${appVersion} · ${platform} · ${security.contextIsolation && !security.nodeIntegration && security.sandbox ? 'isolated' : 'weak'}`,
        );
        update('sqlite', 'ok', `SQLite ${probe.sqliteVersion} ready`);
        update(
          'fts5',
          probe.fts5Available && probe.fts5QueryWorked ? 'ok' : 'error',
          probe.fts5Available && probe.fts5QueryWorked
            ? 'MATCH query verified'
            : 'FTS5 unavailable',
        );
        const isolated =
          security.contextIsolation === true &&
          security.nodeIntegration === false &&
          security.sandbox === true;
        update(
          'security',
          isolated ? 'ok' : 'error',
          isolated
            ? 'contextIsolation · no nodeIntegration · sandbox'
            : 'Security flags weakened',
        );
      } catch (err) {
        update('ipc', 'error', err instanceof Error ? err.message : 'Unknown error');
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const allOk = checks.every((c) => c.status === 'ok');
  const anyError = checks.some((c) => c.status === 'error');

  return (
    <div>
      <ul className="space-y-3" aria-label="Startup checks">
        {checks.map((check) => (
          <li
            key={check.key}
            data-check={check.key}
            data-status={check.status}
            className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3"
          >
            <span className="mt-0.5 flex h-5 w-5 items-center justify-center">
              {statusIcon(check.status)}
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-slate-200">{check.label}</span>
              <span className="block text-xs text-slate-500">{check.detail}</span>
            </span>
            <span
              className={`text-xs font-medium ${
                check.status === 'ok'
                  ? 'text-emerald-400'
                  : check.status === 'error'
                    ? 'text-rose-400'
                    : 'text-slate-500'
              }`}
            >
              {statusText(check.status)}
            </span>
          </li>
        ))}
      </ul>

      <p
        className="mt-6 rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs leading-relaxed text-slate-400"
        aria-live="polite"
        data-testid="overall-status"
      >
        {allOk
          ? 'All startup checks passed. Your data stays on this machine.'
          : anyError
            ? 'One or more startup checks failed. See details above.'
            : 'Running startup checks…'}
      </p>

      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <Database className="h-3.5 w-3.5" aria-hidden="true" />
        Data folder: Electron userData (local only)
        <FileSearch className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
        FTS5 search ready
      </p>
    </div>
  );
}
