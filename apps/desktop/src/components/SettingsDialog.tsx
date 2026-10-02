import { useEffect, useState } from 'react';
import { call, errorMessage } from '../api';
import StartupChecks from './StartupChecks';

interface SettingsDialogProps {
  onClose: () => void;
  notify: (message: string) => void;
}

export default function SettingsDialog({
  onClose,
  notify,
}: SettingsDialogProps): React.ReactElement {
  const [budget, setBudget] = useState<string>('');
  const [compact, setCompact] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await call(window.contextBridgeApi.settings.list());
        if (cancelled) return;
        const b = settings['handoff.tokenBudget'];
        setBudget(typeof b === 'number' ? String(b) : '');
        setCompact(settings['handoff.compact'] === true);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveBudget(value: string): Promise<void> {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 200 || parsed > 100000) {
      if (value !== '') setError('Token budget must be between 200 and 100000.');
      return;
    }
    setError(null);
    try {
      await call(
        window.contextBridgeApi.settings.set({
          key: 'handoff.tokenBudget',
          value: parsed,
        }),
      );
      notify('Token budget saved');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function saveCompact(next: boolean): Promise<void> {
    setCompact(next);
    try {
      await call(
        window.contextBridgeApi.settings.set({
          key: 'handoff.compact',
          value: next,
        }),
      );
      notify(next ? 'Compact preview enabled' : 'Compact preview disabled');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-200">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-xs text-slate-400 underline"
            data-testid="close-settings"
          >
            Close
          </button>
        </header>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
          <section aria-label="Handoff generation">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Handoff generation
            </h3>
            <div className="mt-3 space-y-4">
              <div>
                <label htmlFor="settings-budget" className="mb-1 block text-xs text-slate-400">
                  Token budget (compact mode truncates sections to fit)
                </label>
                <input
                  id="settings-budget"
                  type="number"
                  min={200}
                  max={100000}
                  value={budget}
                  placeholder="default"
                  disabled={!loaded}
                  onChange={(e) => setBudget(e.target.value)}
                  onBlur={() => void saveBudget(budget)}
                  className="w-40 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  data-testid="settings-budget"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={compact}
                  disabled={!loaded}
                  onChange={(e) => void saveCompact(e.target.checked)}
                  className="h-4 w-4 accent-sky-600"
                  data-testid="settings-compact"
                />
                Compact previews (apply token budget)
              </label>
            </div>
          </section>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-300"
            >
              {error}
            </p>
          )}

          <section className="mt-6" aria-label="Startup checks">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              System status
            </h3>
            <div className="mt-3">
              <StartupChecks />
            </div>
          </section>

          <p className="mt-6 text-[11px] leading-relaxed text-slate-600">
            ContextBridge stores everything in a local SQLite database inside the Electron userData
            folder. No data leaves this machine: the app makes no outbound network requests.
          </p>
        </div>
      </div>
    </div>
  );
}
