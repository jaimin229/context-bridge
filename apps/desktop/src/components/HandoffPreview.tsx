import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { CapsuleInput } from '@contextbridge/core';
import { call, errorMessage } from '../api';
import { MarkdownView } from './MarkdownView';

interface HandoffPreviewProps {
  projectId: string;
  input: CapsuleInput;
  nonce: number;
}

/**
 * Live handoff preview for the current editor draft. Debounced so the main
 * process is not hammered while typing; always renders structured React
 * elements (never raw HTML).
 */
export default function HandoffPreview({
  projectId,
  input,
  nonce,
}: HandoffPreviewProps): React.ReactElement {
  const [markdown, setMarkdown] = useState('');
  const [tokenEstimate, setTokenEstimate] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);

  const inputKey = JSON.stringify(input);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      void (async () => {
        try {
          const preview = await call(
            window.contextBridgeApi.handoff.draft({ projectId, input }),
          );
          if (cancelled || requestRef.current !== requestId) return;
          setMarkdown(preview.markdown);
          setTokenEstimate(preview.tokenEstimate);
          setError(null);
        } catch (err) {
          if (cancelled || requestRef.current !== requestId) return;
          setError(errorMessage(err));
        } finally {
          if (!cancelled && requestRef.current === requestId) {
            setLoading(false);
          }
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // inputKey is the stable serialization of `input` from the parent memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, inputKey, nonce]);

  return (
    <section
      className="flex h-full min-h-0 flex-col rounded-xl border border-slate-800 bg-slate-900/50"
      aria-label="Handoff preview"
    >
      <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Handoff preview
        </h2>
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" aria-hidden="true" />}
        <span
          className="ml-auto rounded border border-slate-700 px-2 py-0.5 font-mono text-[11px] text-slate-400"
          data-testid="token-estimate"
        >
          {tokenEstimate === null ? '— tokens' : `~${tokenEstimate} tokens`}
        </span>
      </header>
      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        data-testid="handoff-preview"
        aria-busy={loading}
      >
        {error ? (
          <p role="alert" className="text-xs text-rose-400">
            Preview failed: {error}
          </p>
        ) : (
          <MarkdownView markdown={markdown} />
        )}
      </div>
    </section>
  );
}
