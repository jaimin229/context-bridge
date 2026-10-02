import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Plus, Search, Settings, Upload, Waypoints } from 'lucide-react';
import type { Capsule, Project } from '@contextbridge/core';
import { call, errorMessage } from './api';
import Onboarding from './components/Onboarding';
import CapsuleEditor from './components/CapsuleEditor';
import SearchPanel from './components/SearchPanel';
import SettingsDialog from './components/SettingsDialog';
import ImportDialog from './components/ImportDialog';

interface ToastState {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

const STATUS_FILTERS = ['all', 'Draft', 'Active', 'Verified', 'Deprecated'] as const;

export default function App(): React.ReactElement {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeCapsuleId, setActiveCapsuleId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [creating, setCreating] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const selected = capsules.find((c) => c.id === selectedId) ?? null;

  const notify = useCallback(
    (message: string, action?: { label: string; run: () => void }): void => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      const id = Date.now();
      setToast({ id, message, action });
      toastTimer.current = setTimeout(() => {
        setToast((t) => (t && t.id === id ? null : t));
      }, action ? 9000 : 3500);
    },
    [],
  );

  const refreshCapsules = useCallback(async (pid: string): Promise<void> => {
    try {
      const list = await call(
        window.contextBridgeApi.capsules.list({
          projectId: pid,
          includeArchived: true,
          sort: 'updated-desc',
          limit: 500,
        }),
      );
      setCapsules(list);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, []);

  const refreshActive = useCallback(async (pid: string): Promise<void> => {
    try {
      const active = await call(
        window.contextBridgeApi.capsules.getActiveHandoff({ projectId: pid }),
      );
      setActiveCapsuleId(active?.id ?? null);
    } catch {
      setActiveCapsuleId(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await call(window.contextBridgeApi.projects.list());
        if (cancelled) return;
        setProjects(list);
        if (list.length > 0) {
          let preferred = list[0].id;
          try {
            const stored = await call(
              window.contextBridgeApi.settings.get({ key: 'ui.lastProjectId' }),
            );
            if (typeof stored === 'string' && list.some((p) => p.id === stored)) {
              preferred = stored;
            }
          } catch {
            // no stored preference yet
          }
          if (cancelled) return;
          setProjectId(preferred);
          await refreshCapsules(preferred);
          await refreshActive(preferred);
        }
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshCapsules, refreshActive]);

  const selectProject = useCallback(
    async (pid: string): Promise<void> => {
      setProjectId(pid);
      setSelectedId(null);
      await refreshCapsules(pid);
      await refreshActive(pid);
      try {
        await call(window.contextBridgeApi.settings.set({ key: 'ui.lastProjectId', value: pid }));
      } catch {
        // non-critical preference
      }
    },
    [refreshCapsules, refreshActive],
  );

  const onProjectCreated = useCallback(
    async (created: Project): Promise<void> => {
      setProjects((prev) => [created, ...prev]);
      setProjectId(created.id);
      await refreshCapsules(created.id);
      await refreshActive(created.id);
      notify(`Project “${created.name}” created`);
    },
    [notify, refreshActive, refreshCapsules],
  );

  const onCapsuleSaved = useCallback(
    (updated: Capsule): void => {
      setCapsules((prev) =>
        prev.some((c) => c.id === updated.id)
          ? prev.map((c) => (c.id === updated.id ? updated : c))
          : [updated, ...prev],
      );
      setSelectedId(updated.id);
      void refreshActive(updated.projectId);
    },
    [refreshActive],
  );

  const onCapsuleDeleted = useCallback((): void => {
    setSelectedId(null);
    if (projectId) void refreshCapsules(projectId);
  }, [projectId, refreshCapsules]);

  async function createCapsule(): Promise<void> {
    if (!projectId || creating) return;
    setCreating(true);
    try {
      const created = await call(
        window.contextBridgeApi.capsules.create({
          projectId,
          input: { title: 'Untitled Handoff', status: 'Draft' },
        }),
      );
      setCapsules((prev) => [created, ...prev]);
      setSelectedId(created.id);
      notify('Capsule created');
    } catch (err) {
      notify(`Create failed: ${errorMessage(err)}`);
    } finally {
      setCreating(false);
    }
  }

  const visibleCapsules = capsules.filter((c) => {
    if (!showArchived && c.archivedAt !== null) return false;
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <main className="flex min-h-full items-center justify-center bg-slate-950 text-slate-400">
        <p className="animate-pulse text-sm">Loading ContextBridge…</p>
      </main>
    );
  }

  if (loadError && projects.length === 0) {
    return (
      <main className="flex min-h-full items-center justify-center bg-slate-950 px-6 text-slate-200">
        <div className="max-w-md rounded-xl border border-rose-900/60 bg-slate-900 p-6">
          <h1 className="text-lg font-semibold">ContextBridge</h1>
          <p className="mt-2 text-sm text-rose-300" role="alert">
            Startup failed: {loadError}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (!project) {
    return <Onboarding onCreated={(p) => void onProjectCreated(p)} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-200">
      <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
          <Waypoints className="h-4 w-4 text-sky-400" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-sm font-semibold tracking-tight">ContextBridge</h1>
          <span className="text-slate-600" aria-hidden="true">
            /
          </span>
          {projects.length > 1 ? (
            <select
              value={projectId ?? ''}
              onChange={(e) => void selectProject(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-200"
              aria-label="Select project"
              data-testid="project-select"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-sm text-slate-400" data-testid="project-name">
              {project.name}
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void createCapsule()}
            disabled={creating}
            className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
            data-testid="new-capsule"
          >
            <Plus className="h-3.5 w-3.5" /> New capsule
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            data-testid="open-import"
          >
            <Upload className="h-3.5 w-3.5" /> Import
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-800"
            data-testid="open-search"
          >
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            className="rounded-lg border border-slate-700 p-1.5 text-slate-400 transition hover:bg-slate-800"
            data-testid="open-settings"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr]">
        <aside className="flex min-h-0 flex-col border-r border-slate-800 bg-slate-900/30">
          <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
            <FolderOpen className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as (typeof STATUS_FILTERS)[number])}
              className="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-[11px] text-slate-300"
              aria-label="Filter capsules by status"
              data-testid="status-filter"
            >
              {STATUS_FILTERS.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All statuses' : s}
                </option>
              ))}
            </select>
            <label className="ml-auto flex items-center gap-1 text-[11px] text-slate-500">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="h-3 w-3 accent-sky-600"
                data-testid="show-archived"
              />
              archived
            </label>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="capsule-list">
            {visibleCapsules.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full border-b border-slate-900 px-3 py-2.5 text-left transition hover:bg-slate-800/50 ${
                    c.id === selectedId ? 'bg-slate-800/70 border-l-2 border-l-sky-500' : ''
                  }`}
                  data-testid="capsule-list-item"
                  data-capsule-id={c.id}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium text-slate-200">{c.title}</span>
                    {activeCapsuleId === c.id && (
                      <span
                        className="shrink-0 rounded-full border border-emerald-700 px-1.5 text-[9px] font-bold text-emerald-400"
                        title="Active handoff"
                      >
                        ACTIVE
                      </span>
                    )}
                    {c.archivedAt && (
                      <span className="shrink-0 rounded border border-slate-700 px-1 text-[9px] text-slate-500">
                        arch
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="rounded border border-slate-800 px-1 py-0.5">{c.type}</span>
                    <span className="rounded border border-slate-800 px-1 py-0.5">{c.status}</span>
                    <span className="ml-auto">{new Date(c.updatedAt).toLocaleDateString()}</span>
                  </span>
                </button>
              </li>
            ))}
            {visibleCapsules.length === 0 && (
              <li className="px-4 py-8 text-center text-xs text-slate-600" data-testid="empty-list">
                No capsules yet. Create your first handoff.
              </li>
            )}
          </ul>
        </aside>

        <main className="min-h-0 overflow-hidden">
          {selected ? (
            <CapsuleEditor
              key={selected.id}
              capsule={selected}
              project={project}
              isActiveHandoff={activeCapsuleId === selected.id}
              notify={notify}
              onChanged={onCapsuleSaved}
              onDeleted={onCapsuleDeleted}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <Waypoints className="h-10 w-10 text-slate-700" aria-hidden="true" />
              <h2 className="text-sm font-medium text-slate-400">No capsule selected</h2>
              <p className="max-w-sm text-xs leading-relaxed text-slate-600">
                Pick a capsule from the list, or create a new one. ContextBridge compiles your
                project state into a handoff a fresh AI assistant can pick up.
              </p>
              <button
                type="button"
                onClick={() => void createCapsule()}
                disabled={creating}
                className="mt-1 rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                data-testid="empty-create-capsule"
              >
                New capsule
              </button>
            </div>
          )}
        </main>
      </div>

      {searchOpen && (
        <SearchPanel
          projectId={project.id}
          onSelect={(id) => setSelectedId(id)}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsDialog onClose={() => setSettingsOpen(false)} notify={notify} />
      )}

      {importOpen && (
        <ImportDialog
          projectId={project.id}
          onImported={(capsule) => {
            setCapsules((prev) => [capsule, ...prev.filter((c) => c.id !== capsule.id)]);
            setSelectedId(capsule.id);
          }}
          onClose={() => setImportOpen(false)}
          notify={notify}
        />
      )}

      {toast && (
        <div
          className="fixed bottom-5 right-5 z-[60] flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs text-slate-200 shadow-2xl"
          role="status"
          aria-live="polite"
          data-testid="toast"
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.run();
                setToast(null);
              }}
              className="rounded-lg border border-sky-700 px-2 py-1 text-[11px] font-semibold text-sky-300 hover:bg-sky-950"
              data-testid="toast-action"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
