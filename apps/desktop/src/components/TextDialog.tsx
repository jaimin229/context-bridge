import { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';
import { call, errorMessage } from '../api';

interface TextDialogProps {
  title: string;
  text: string;
  onClose: () => void;
}

/** Read-only text modal (exports, revision snapshots). Copy runs in the
 *  main process via the typed clipboard channel — no renderer clipboard API. */
export default function TextDialog({ title, text, onClose }: TextDialogProps): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy(): Promise<void> {
    try {
      await call(window.contextBridgeApi.clipboard.write({ text }));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center gap-3 border-b border-slate-800 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
              data-testid="dialog-copy"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="rounded-lg border border-slate-700 p-1.5 text-slate-400 transition hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        {error && (
          <p
            role="alert"
            className="border-b border-rose-900/50 bg-rose-950/40 px-5 py-2 text-xs text-rose-300"
          >
            {error}
          </p>
        )}
        <textarea
          readOnly
          value={text}
          className="min-h-0 flex-1 resize-none bg-slate-950/60 px-5 py-4 font-mono text-xs leading-relaxed text-slate-300 outline-none"
          data-testid="dialog-text"
          aria-label={`${title} content`}
        />
      </div>
    </div>
  );
}
