import { useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { Capsule } from '@contextbridge/core';
import { call, errorMessage } from '../api';

interface ImportDialogProps {
  projectId: string;
  onImported: (capsule: Capsule) => void;
  onClose: () => void;
  notify: (message: string) => void;
}

/**
 * Import from pasted text or a local file. Detects ContextBridge JSON vs
 * Markdown; unknown formats fall back to plain-notes markdown import.
 */
export default function ImportDialog({
  projectId,
  onImported,
  onClose,
  notify,
}: ImportDialogProps): React.ReactElement {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runImport(): Promise<void> {
    const trimmed = text.trim();
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (trimmed.startsWith('{')) {
        const capsule = await call(window.contextBridgeApi.import.json({ text, projectId }));
        onImported(capsule);
        notify('Imported capsule from JSON');
        onClose();
      } else {
        const outcome = await call(window.contextBridgeApi.import.markdown({ text, projectId }));
        onImported(outcome.capsule);
        notify(outcome.message ?? 'Imported capsule from Markdown');
        onClose();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File | undefined): void {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setText(String(reader.result ?? ''));
    };
    reader.readAsText(file);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Import capsule"
    >
      <div className="flex w-full max-w-2xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-200">Import capsule</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close import dialog"
            className="ml-auto rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="px-5 py-4">
          <div className="mb-3 flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.md,.markdown,application/json,text/markdown,text/plain"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
              data-testid="import-file"
              aria-label="Choose import file"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
              data-testid="import-choose-file"
            >
              Choose file…
            </button>
            <span className="text-[11px] text-slate-600">
              ContextBridge JSON or Markdown export, or any plain text.
            </span>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            placeholder="Paste export content here…"
            className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200 placeholder:text-slate-600"
            data-testid="import-text"
            aria-label="Import content"
          />
          {error && (
            <p
              role="alert"
              className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-300"
            >
              {error}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-800 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={busy || text.trim().length === 0}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            data-testid="import-submit"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Import
          </button>
        </footer>
      </div>
    </div>
  );
}
