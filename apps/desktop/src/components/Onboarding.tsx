import { useState, type FormEvent } from 'react';
import { Loader2, Waypoints } from 'lucide-react';
import type { Project } from '@contextbridge/core';
import { call, errorMessage } from '../api';
import StartupChecks from './StartupChecks';

interface OnboardingProps {
  onCreated: (project: Project) => void;
}

export default function Onboarding({ onCreated }: OnboardingProps): React.ReactElement {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repositoryPath, setRepositoryPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (name.trim().length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const project = await call(
        window.contextBridgeApi.projects.create({
          name: name.trim(),
          description: description.trim(),
          repositoryPath: repositoryPath.trim(),
        }),
      );
      onCreated(project);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center bg-slate-950 px-6 py-10 text-slate-100">
      <div className="w-full max-w-xl rounded-xl border border-slate-800 bg-slate-900/60 p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800">
            <Waypoints className="h-5 w-5 text-sky-400" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">ContextBridge</h1>
            <p className="text-sm text-slate-400">
              Local-first project handoffs. No accounts, no cloud, no AI calls.
            </p>
          </div>
        </div>

        <StartupChecks />

        <form onSubmit={submit} className="mt-6 space-y-4" data-testid="onboarding-form">
          <div>
            <label htmlFor="project-name" className="mb-1 block text-xs font-medium text-slate-400">
              Project name
            </label>
            <input
              id="project-name"
              data-testid="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              placeholder="My coding project"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
            />
          </div>
          <div>
            <label
              htmlFor="project-description"
              className="mb-1 block text-xs font-medium text-slate-400"
            >
              Description (optional)
            </label>
            <textarea
              id="project-description"
              data-testid="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={5000}
              placeholder="What this project is about"
              className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
            />
          </div>
          <div>
            <label htmlFor="project-repo" className="mb-1 block text-xs font-medium text-slate-400">
              Git repository path (optional)
            </label>
            <input
              id="project-repo"
              data-testid="project-repo"
              value={repositoryPath}
              onChange={(e) => setRepositoryPath(e.target.value)}
              maxLength={4096}
              placeholder="C:\path\to\repository"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600"
            />
            <p className="mt-1 text-xs text-slate-600">
              Used for git snapshot capture and drift detection. Leave empty to skip.
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-rose-900/60 bg-rose-950/50 px-3 py-2 text-xs text-rose-300"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            data-testid="create-project"
            disabled={busy || name.trim().length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Create project
          </button>
        </form>
      </div>
    </main>
  );
}
