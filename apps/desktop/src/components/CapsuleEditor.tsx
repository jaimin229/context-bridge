import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Archive,
  Copy,
  Download,
  FileJson,
  GitBranch,
  History,
  Loader2,
  Save,
  Search,
  Trash2,
  Wand2,
} from 'lucide-react';
import type {
  Capsule,
  CapsuleInput,
  CapsulePatch,
  CapsuleRevision,
  DriftReport,
  Project,
  SecretFinding,
} from '@contextbridge/core';
import { call, errorMessage } from '../api';
import HandoffPreview from './HandoffPreview';
import TextDialog from './TextDialog';

/**
 * Option lists mirrored from @contextbridge/core (renderer must not import
 * core values at runtime: core pulls in better-sqlite3). Kept in sync by
 * tests/ipc-contract.test.ts.
 */
const CAPSULE_TYPES = [
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
] as const;

const CAPSULE_STATUSES = ['Draft', 'Active', 'Verified', 'Deprecated', 'Archived'] as const;

interface DraftForm {
  title: string;
  type: Capsule['type'];
  status: Capsule['status'];
  summary: string;
  goal: string;
  currentTask: string;
  completedWork: string;
  changedFilesText: string;
  commandsRunText: string;
  verificationResults: string;
  knownIssues: string;
  nextTask: string;
  rulesConstraints: string;
  architectureNotes: string;
  notes: string;
  tagsText: string;
  gitHead: string;
  gitBranch: string;
  gitSnapshot: Capsule['gitSnapshot'];
}

function toDraft(capsule: Capsule, tagNames: string[]): DraftForm {
  return {
    title: capsule.title,
    type: capsule.type,
    status: capsule.status,
    summary: capsule.summary,
    goal: capsule.goal,
    currentTask: capsule.currentTask,
    completedWork: capsule.completedWork,
    changedFilesText: capsule.changedFiles.join('\n'),
    commandsRunText: capsule.commandsRun.join('\n'),
    verificationResults: capsule.verificationResults,
    knownIssues: capsule.knownIssues,
    nextTask: capsule.nextTask,
    rulesConstraints: capsule.rulesConstraints,
    architectureNotes: capsule.architectureNotes,
    notes: capsule.notes,
    tagsText: tagNames.join(', '),
    gitHead: capsule.gitHead,
    gitBranch: capsule.gitBranch,
    gitSnapshot: capsule.gitSnapshot,
  };
}

function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function draftToInput(draft: DraftForm): CapsuleInput {
  return {
    title: draft.title,
    type: draft.type,
    status: draft.status,
    summary: draft.summary,
    goal: draft.goal,
    currentTask: draft.currentTask,
    completedWork: draft.completedWork,
    changedFiles: lines(draft.changedFilesText),
    commandsRun: lines(draft.commandsRunText),
    verificationResults: draft.verificationResults,
    knownIssues: draft.knownIssues,
    nextTask: draft.nextTask,
    rulesConstraints: draft.rulesConstraints,
    architectureNotes: draft.architectureNotes,
    notes: draft.notes,
    gitHead: draft.gitHead,
    gitBranch: draft.gitBranch,
    gitSnapshot: draft.gitSnapshot,
    tags: draft.tagsText
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  };
}

const SIMPLE_FIELDS: Array<{
  key: keyof DraftForm;
  label: string;
  hint?: string;
  rows?: number;
}> = [
  { key: 'goal', label: 'Goal', rows: 4 },
  { key: 'currentTask', label: 'Current task', rows: 4 },
  { key: 'completedWork', label: 'Completed work', rows: 4 },
  { key: 'knownIssues', label: 'Known issues / blockers', rows: 3 },
  { key: 'nextTask', label: 'Next exact task', rows: 3 },
];

const ADVANCED_FIELDS: Array<{
  key: keyof DraftForm;
  label: string;
  rows?: number;
  mono?: boolean;
}> = [
  { key: 'summary', label: 'Summary', rows: 2 },
  {
    key: 'changedFilesText',
    label: 'Files changed (one per line)',
    rows: 3,
    mono: true,
  },
  {
    key: 'commandsRunText',
    label: 'Commands run (one per line)',
    rows: 3,
    mono: true,
  },
  { key: 'verificationResults', label: 'Verification results', rows: 3 },
  { key: 'rulesConstraints', label: 'Rules and constraints', rows: 3 },
  {
    key: 'architectureNotes',
    label: 'Architecture / technical notes',
    rows: 3,
  },
  { key: 'notes', label: 'Notes', rows: 3 },
];

interface CapsuleEditorProps {
  capsule: Capsule;
  project: Project;
  isActiveHandoff: boolean;
  notify: (message: string, action?: { label: string; run: () => void }) => void;
  onChanged: (updated: Capsule) => void;
  onDeleted: () => void;
}

export default function CapsuleEditor({
  capsule,
  project,
  isActiveHandoff,
  notify,
  onChanged,
  onDeleted,
}: CapsuleEditorProps): React.ReactElement {
  const [draft, setDraft] = useState<DraftForm>(() => toDraft(capsule, []));
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pendingFindings, setPendingFindings] = useState<SecretFinding[] | null>(null);
  const [drift, setDrift] = useState<DriftReport | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [revisions, setRevisions] = useState<CapsuleRevision[]>([]);
  const [textDialog, setTextDialog] = useState<{
    title: string;
    text: string;
  } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (loadedFor === capsule.id) return;
    let cancelled = false;
    void (async () => {
      try {
        const tags = await call(
          window.contextBridgeApi.tags.listForCapsule({
            capsuleId: capsule.id,
          }),
        );
        if (!cancelled) {
          setDraft(
            toDraft(
              capsule,
              tags.map((t) => t.name),
            ),
          );
          setDirty(false);
          setDrift(null);
          setError(null);
          setLoadedFor(capsule.id);
        }
      } catch {
        if (!cancelled) {
          setDraft(toDraft(capsule, []));
          setDirty(false);
          setLoadedFor(capsule.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [capsule, loadedFor]);

  useEffect(() => {
    if (!capsule.gitSnapshot || project.repositoryPath.trim().length === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const report = await call(window.contextBridgeApi.git.drift({ capsuleId: capsule.id }));
        if (!cancelled) setDrift(report);
      } catch {
        // The drift banner is optional; a failed check stays silent until
        // the user presses "Check drift" and gets an explicit error toast.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [capsule, project.repositoryPath]);

  const input = useMemo(() => draftToInput(draft), [draft]);

  function patch(next: Partial<DraftForm>): void {
    setDraft((prev) => ({ ...prev, ...next }));
    setDirty(true);
    setPreviewNonce((n) => n + 1);
  }

  async function scanThenSave(): Promise<void> {
    const text = [
      draft.title,
      draft.summary,
      draft.goal,
      draft.currentTask,
      draft.completedWork,
      draft.verificationResults,
      draft.knownIssues,
      draft.nextTask,
      draft.rulesConstraints,
      draft.architectureNotes,
      draft.notes,
    ].join('\n');
    try {
      const findings = await call(window.contextBridgeApi.secrets.scan({ text }));
      if (findings.length > 0) {
        setPendingFindings(findings);
        return;
      }
    } catch {
      // A failed scan must not block saving; the dialog would simply be skipped.
    }
    await performSave();
  }

  async function performSave(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const updated = await call(
        window.contextBridgeApi.capsules.update({
          id: capsule.id,
          patch: draftToInput(draft),
          reason: 'manual-save',
        }),
      );
      setDirty(false);
      setPreviewNonce((n) => n + 1);
      onChanged(updated);
      notify('Capsule saved');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copyHandoff(): Promise<void> {
    setBusy(true);
    try {
      const preview = await call(
        window.contextBridgeApi.handoff.draft({ projectId: project.id, input }),
      );
      await call(window.contextBridgeApi.clipboard.write({ text: preview.markdown }));
      const revision = await call(
        window.contextBridgeApi.capsules.update({
          id: capsule.id,
          patch: {},
          reason: 'copy-handoff',
        }),
      );
      onChanged(revision);
      notify('Handoff markdown copied to clipboard');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function captureGit(): Promise<void> {
    if (project.repositoryPath.trim().length === 0) {
      notify('No repository path set for this project (Settings → project)');
      return;
    }
    setBusy(true);
    try {
      const snapshot = await call(
        window.contextBridgeApi.git.capture({
          repositoryPath: project.repositoryPath,
        }),
      );
      patch({
        gitHead: snapshot.head ?? '',
        gitBranch: snapshot.branch ?? '',
        gitSnapshot: snapshot,
      });
      notify(
        snapshot.workingTreeClean
          ? 'Git state captured (clean working tree)'
          : `Git state captured (${snapshot.changedFiles?.length ?? 0} changed files)`,
      );
    } catch (err) {
      notify(`Git capture failed: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function checkDrift(): Promise<void> {
    setBusy(true);
    try {
      const report = await call(window.contextBridgeApi.git.drift({ capsuleId: capsule.id }));
      setDrift(report);
      if (!report.hasDrift) notify('No drift detected since capture');
    } catch (err) {
      notify(`Drift check failed: ${errorMessage(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function exportAs(kind: 'json' | 'markdown'): Promise<void> {
    try {
      const text = await call(
        kind === 'json'
          ? window.contextBridgeApi.export.json({ capsuleId: capsule.id })
          : window.contextBridgeApi.export.markdown({ capsuleId: capsule.id }),
      );
      setTextDialog({
        title: kind === 'json' ? 'Export — JSON' : 'Export — Markdown',
        text,
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function openHistory(): Promise<void> {
    try {
      const list = await call(window.contextBridgeApi.revisions.list({ capsuleId: capsule.id }));
      setRevisions(list);
      setShowHistory(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function restoreRevision(revision: CapsuleRevision): Promise<void> {
    try {
      const snapshot = JSON.parse(revision.snapshotJson) as CapsulePatch;
      const updated = await call(
        window.contextBridgeApi.capsules.update({
          id: capsule.id,
          patch: snapshot,
          reason: 'manual-save',
        }),
      );
      const tags = await call(
        window.contextBridgeApi.tags.listForCapsule({ capsuleId: capsule.id }),
      );
      setDraft(
        toDraft(
          updated,
          tags.map((t) => t.name),
        ),
      );
      setDirty(false);
      setPreviewNonce((n) => n + 1);
      onChanged(updated);
      setShowHistory(false);
      notify(`Restored version ${revision.version}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function archiveCapsule(): Promise<void> {
    try {
      const updated = await call(
        window.contextBridgeApi.capsules.setArchived({
          id: capsule.id,
          archived: capsule.archivedAt === null,
        }),
      );
      onChanged(updated);
      notify(capsule.archivedAt === null ? 'Capsule archived' : 'Capsule unarchived');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function duplicateCapsule(): Promise<void> {
    try {
      const copy = await call(window.contextBridgeApi.capsules.duplicate({ id: capsule.id }));
      onChanged(copy);
      notify('Capsule duplicated');
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function setActive(): Promise<void> {
    try {
      await call(
        window.contextBridgeApi.capsules.setActiveHandoff({
          capsuleId: capsule.id,
        }),
      );
      notify('Marked as active handoff');
      onChanged(capsule);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function deleteCapsule(): void {
    setConfirmingDelete(true);
  }

  function performDelete(): void {
    setConfirmingDelete(false);
    void (async () => {
      try {
        await call(window.contextBridgeApi.capsules.softDelete({ id: capsule.id }));
        notify('Capsule deleted', {
          label: 'Undo',
          run: () => {
            void (async () => {
              try {
                const restored = await call(
                  window.contextBridgeApi.capsules.restore({ id: capsule.id }),
                );
                onChanged(restored);
                notify('Capsule restored');
              } catch (err) {
                setError(errorMessage(err));
              }
            })();
          },
        });
        onDeleted();
      } catch (err) {
        setError(errorMessage(err));
      }
    })();
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    if (!busy) void scanThenSave();
  }

  const actionBtn =
    'flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form onSubmit={submit} className="flex h-full min-h-0 flex-col">
        <header className="border-b border-slate-800 bg-slate-900/40 px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-lg font-semibold text-slate-100 transition hover:border-slate-700 focus:border-sky-600"
              aria-label="Capsule title"
              maxLength={300}
              data-testid="capsule-title"
            />
            <select
              value={draft.type}
              onChange={(e) => patch({ type: e.target.value as Capsule['type'] })}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-300"
              aria-label="Capsule type"
              data-testid="capsule-type"
            >
              {CAPSULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={draft.status}
              onChange={(e) => patch({ status: e.target.value as Capsule['status'] })}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-300"
              aria-label="Capsule status"
              data-testid="capsule-status"
            >
              {CAPSULE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {isActiveHandoff && (
              <span className="rounded-full border border-emerald-700 bg-emerald-950/60 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                Active handoff
              </span>
            )}
            {capsule.archivedAt && (
              <span className="rounded-full border border-slate-600 px-2.5 py-1 text-[11px] text-slate-400">
                Archived
              </span>
            )}
            {dirty && (
              <span className="text-[11px] text-amber-400" data-testid="dirty-indicator">
                Unsaved changes
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
              data-testid="save-capsule"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Save
            </button>
            <button
              type="button"
              onClick={() => void copyHandoff()}
              disabled={busy}
              className={actionBtn}
              data-testid="copy-handoff"
            >
              <Copy className="h-3.5 w-3.5" /> Copy handoff
            </button>
            <button
              type="button"
              onClick={() => void exportAs('markdown')}
              disabled={busy}
              className={actionBtn}
              data-testid="export-markdown"
            >
              <Download className="h-3.5 w-3.5" /> MD
            </button>
            <button
              type="button"
              onClick={() => void exportAs('json')}
              disabled={busy}
              className={actionBtn}
              data-testid="export-json"
            >
              <FileJson className="h-3.5 w-3.5" /> JSON
            </button>
            <button
              type="button"
              onClick={() => void openHistory()}
              disabled={busy}
              className={actionBtn}
              data-testid="open-history"
            >
              <History className="h-3.5 w-3.5" /> History
            </button>
            <span className="mx-1 h-5 w-px bg-slate-800" aria-hidden="true" />
            <button
              type="button"
              onClick={() => void captureGit()}
              disabled={busy}
              className={actionBtn}
              data-testid="capture-git"
            >
              <GitBranch className="h-3.5 w-3.5" /> Capture git
            </button>
            <button
              type="button"
              onClick={() => void checkDrift()}
              disabled={busy}
              className={actionBtn}
              data-testid="check-drift"
            >
              <Search className="h-3.5 w-3.5" /> Check drift
            </button>
            <span className="mx-1 h-5 w-px bg-slate-800" aria-hidden="true" />
            {!isActiveHandoff && (
              <button
                type="button"
                onClick={() => void setActive()}
                disabled={busy}
                className={actionBtn}
                data-testid="set-active"
              >
                <Wand2 className="h-3.5 w-3.5" /> Set active
              </button>
            )}
            <button
              type="button"
              onClick={() => void duplicateCapsule()}
              disabled={busy}
              className={actionBtn}
            >
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
            <button
              type="button"
              onClick={() => void archiveCapsule()}
              disabled={busy}
              className={actionBtn}
            >
              <Archive className="h-3.5 w-3.5" />
              {capsule.archivedAt === null ? 'Archive' : 'Unarchive'}
            </button>
            <button
              type="button"
              onClick={deleteCapsule}
              disabled={busy}
              className={`${actionBtn} border-rose-900/70 text-rose-400 hover:bg-rose-950/50`}
              data-testid="delete-capsule"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAdvanced((a) => !a)}
                className={`${actionBtn} ${advanced ? 'border-sky-700 text-sky-300' : ''}`}
                data-testid="toggle-advanced"
                aria-pressed={advanced}
              >
                {advanced ? 'Advanced' : 'Simple'}
              </button>
            </span>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-300"
            >
              {error}
            </p>
          )}

          {drift && (
            <div
              className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                drift.hasDrift
                  ? 'border-amber-700/70 bg-amber-950/40 text-amber-200'
                  : 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
              }`}
              data-testid="drift-banner"
              aria-live="polite"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="flex-1">
                {drift.hasDrift
                  ? `Drift detected: ${drift.reasons.join(', ')}. Current head: ${
                      drift.currentHead?.slice(0, 10) ?? 'unknown'
                    } @ ${drift.currentBranch ?? 'unknown'}.`
                  : 'No drift — the repository matches the captured state.'}
              </span>
              <button
                type="button"
                onClick={() => setDrift(null)}
                className="text-[11px] underline"
                aria-label="Dismiss drift report"
              >
                dismiss
              </button>
            </div>
          )}
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-2">
          <div className="min-h-0 overflow-y-auto border-r border-slate-800 px-5 py-4">
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="capsule-summary"
                  className="mb-1 block text-xs font-medium text-slate-400"
                >
                  Summary
                </label>
                <textarea
                  id="capsule-summary"
                  value={draft.summary}
                  onChange={(e) => patch({ summary: e.target.value })}
                  rows={2}
                  maxLength={20000}
                  className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  data-testid="field-summary"
                />
              </div>

              {SIMPLE_FIELDS.map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={`capsule-${String(field.key)}`}
                    className="mb-1 block text-xs font-medium text-slate-400"
                  >
                    {field.label}
                  </label>
                  <textarea
                    id={`capsule-${String(field.key)}`}
                    value={String(draft[field.key] ?? '')}
                    onChange={(e) =>
                      patch({
                        [field.key]: e.target.value,
                      } as Partial<DraftForm>)
                    }
                    rows={field.rows}
                    maxLength={100000}
                    className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    data-testid={`field-${String(field.key)}`}
                  />
                </div>
              ))}

              {advanced &&
                ADVANCED_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label
                      htmlFor={`capsule-${String(field.key)}`}
                      className="mb-1 block text-xs font-medium text-slate-400"
                    >
                      {field.label}
                    </label>
                    <textarea
                      id={`capsule-${String(field.key)}`}
                      value={String(draft[field.key] ?? '')}
                      onChange={(e) =>
                        patch({
                          [field.key]: e.target.value,
                        } as Partial<DraftForm>)
                      }
                      rows={field.rows}
                      maxLength={100000}
                      className={`w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 ${
                        field.mono ? 'font-mono text-xs' : ''
                      }`}
                      data-testid={`field-${String(field.key)}`}
                    />
                  </div>
                ))}

              {advanced && (
                <div>
                  <label
                    htmlFor="capsule-tags"
                    className="mb-1 block text-xs font-medium text-slate-400"
                  >
                    Tags (comma separated)
                  </label>
                  <input
                    id="capsule-tags"
                    value={draft.tagsText}
                    onChange={(e) => patch({ tagsText: e.target.value })}
                    maxLength={1000}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                    data-testid="field-tags"
                  />
                </div>
              )}

              <p className="text-[11px] text-slate-600">
                v{capsule.version} · updated {new Date(capsule.updatedAt).toLocaleString()} ·{' '}
                {capsule.source}
                {capsule.gitBranch ? ` · ${capsule.gitBranch}@${capsule.gitHead.slice(0, 8)}` : ''}
              </p>
            </div>
          </div>

          <div className="min-h-0 p-4">
            <HandoffPreview projectId={project.id} input={input} nonce={previewNonce} />
          </div>
        </div>
      </form>

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm delete"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h2 className="text-sm font-semibold text-slate-200">Delete this capsule?</h2>
            <p className="mt-2 text-xs text-slate-400">
              “{capsule.title}” moves to the archive. You can restore it right after with Undo.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                data-testid="cancel-delete"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDelete}
                className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                data-testid="confirm-delete"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingFindings && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Possible secrets detected"
        >
          <div className="w-full max-w-lg rounded-xl border border-amber-700/70 bg-slate-900 p-6 shadow-2xl">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Possible secrets detected
            </h2>
            <p className="mt-2 text-xs text-slate-400">
              Saving now will store these values in the local database. Values are shown masked.
            </p>
            <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto" data-testid="secret-findings">
              {pendingFindings.map((f, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2"
                >
                  <span className="block text-xs font-medium text-slate-200">{f.description}</span>
                  <span className="block font-mono text-[11px] text-amber-400">
                    {f.redacted} · line {f.line}, col {f.column} · {f.severity}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingFindings(null)}
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-800"
                data-testid="cancel-secret-save"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingFindings(null);
                  void performSave();
                }}
                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-500"
                data-testid="confirm-secret-save"
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Revision history"
        >
          <div className="w-full max-w-xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <header className="flex items-center border-b border-slate-800 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-200">Revision history</h2>
              <button
                type="button"
                onClick={() => setShowHistory(false)}
                className="ml-auto text-xs text-slate-400 underline"
                data-testid="close-history"
              >
                Close
              </button>
            </header>
            <ul className="max-h-80 divide-y divide-slate-800 overflow-y-auto">
              {revisions.map((rev) => (
                <li key={rev.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="font-mono text-xs text-sky-400">v{rev.version}</span>
                  <span className="text-xs text-slate-400">{rev.reason}</span>
                  <span className="text-[11px] text-slate-600">
                    {new Date(rev.createdAt).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    onClick={() => void restoreRevision(rev)}
                    className="ml-auto rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                    data-testid={`restore-v${rev.version}`}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTextDialog({
                        title: `Revision v${rev.version} snapshot`,
                        text: JSON.stringify(JSON.parse(rev.snapshotJson), null, 2),
                      })
                    }
                    className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-300 hover:bg-slate-800"
                  >
                    View
                  </button>
                </li>
              ))}
              {revisions.length === 0 && (
                <li className="px-5 py-6 text-center text-xs text-slate-500">No revisions yet.</li>
              )}
            </ul>
          </div>
        </div>
      )}

      {textDialog && (
        <TextDialog
          title={textDialog.title}
          text={textDialog.text}
          onClose={() => setTextDialog(null)}
        />
      )}
    </div>
  );
}
