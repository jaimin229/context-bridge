import { useEffect, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import type { Capsule, SearchOutcome } from '@contextbridge/core';
import { call, errorMessage } from '../api';
import { HighlightedText } from './MarkdownView';

type SearchHitRow = SearchOutcome['hits'][number];

interface SearchPanelProps {
  projectId: string;
  onSelect: (capsuleId: string) => void;
  onClose: () => void;
}

const TYPE_OPTIONS = [
  'Master Context',
  'Architecture',
  'Decision',
  'Current Task',
  'Session Handoff',
  'Bug Report',
  'Research',
  'Prompt Template',
  'Release Notes',
  'Other',
];

const STATUS_OPTIONS = ['Draft', 'Active', 'Verified', 'Deprecated', 'Archived'];

/** Local FTS search across capsule content with type/status filters. */
export default function SearchPanel({ projectId, onSelect, onClose }: SearchPanelProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [hits, setHits] = useState<SearchHitRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length === 0) {
      setHits([]);
      setTotal(0);
      setError(null);
      return;
    }
    const timer = setTimeout(() => {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      setBusy(true);
      void (async () => {
        try {
          const outcome = await call(
            window.contextBridgeApi.search.query({
              query,
              filter: {
                projectId,
                ...(type ? { types: [type as Capsule['type']] } : {}),
                ...(status ? { statuses: [status as Capsule['status']] } : {}),
                limit: 50,
              },
            }),
          );
          if (cancelled || requestRef.current !== requestId) return;
          setHits(outcome.hits);
          setTotal(outcome.total);
          setError(null);
        } catch (err) {
          if (cancelled || requestRef.current !== requestId) return;
          setError(errorMessage(err));
        } finally {
          if (!cancelled && requestRef.current === requestId) setBusy(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, type, status, projectId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/80 p-6 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search capsules"
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center gap-2 border-b border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 text-slate-500" aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, tasks, issues, notes…"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-600 outline-none"
            aria-label="Search query"
            data-testid="search-input"
            maxLength={1000}
          />
          {busy && <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-hidden="true" />}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex items-center gap-3 border-b border-slate-800 px-4 py-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-300"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <span className="ml-auto text-[11px] text-slate-500" data-testid="search-total">
            {query.trim() ? `${total} result${total === 1 ? '' : 's'}` : ''}
          </span>
        </div>

        {error && (
          <p role="alert" className="border-b border-rose-900/50 bg-rose-950/40 px-4 py-2 text-xs text-rose-300">
            {error}
          </p>
        )}

        <ul className="max-h-96 divide-y divide-slate-800 overflow-y-auto" data-testid="search-results">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(hit.id);
                  onClose();
                }}
                className="w-full px-4 py-3 text-left transition hover:bg-slate-800/60"
                data-testid="search-hit"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200">{hit.title}</span>
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {hit.type}
                  </span>
                  <span className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {hit.status}
                  </span>
                  <span className="ml-auto text-[10px] text-slate-600">
                    {new Date(hit.updatedAt).toLocaleDateString()}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  <HighlightedText text={hit.snippet} />
                </span>
              </button>
            </li>
          ))}
          {query.trim().length > 0 && hits.length === 0 && !busy && !error && (
            <li className="px-4 py-8 text-center text-xs text-slate-500">No matches.</li>
          )}
          {query.trim().length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-slate-600">
              Type to search across this project.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
