import type { Capsule, Project, Tag } from '../types';
import { nowIso } from '../util';
import { buildFrontMatter } from './frontMatter';

export interface JsonExportDocument {
  schemaVersion: 1;
  exportedAt: string;
  app: 'ContextBridge';
  project: { name: string };
  capsule: {
    id: string;
    title: string;
    type: Capsule['type'];
    status: Capsule['status'];
    summary: string;
    goal: string;
    current_task: string;
    completed_work: string;
    changed_files: string[];
    commands_run: string[];
    verification_results: string;
    known_issues: string;
    next_task: string;
    rules_constraints: string;
    architecture_notes: string;
    notes: string;
    git_head: string;
    git_branch: string;
    git_snapshot: unknown;
    token_estimate: number;
    created_at: string;
    updated_at: string;
  };
  tags: string[];
}

export function toJsonExport(
  capsule: Capsule,
  project: Project,
  tags: Tag[],
  exportedAt: string = nowIso(),
): JsonExportDocument {
  return {
    schemaVersion: 1,
    exportedAt,
    app: 'ContextBridge',
    project: { name: project.name },
    capsule: {
      id: capsule.id,
      title: capsule.title,
      type: capsule.type,
      status: capsule.status,
      summary: capsule.summary,
      goal: capsule.goal,
      current_task: capsule.currentTask,
      completed_work: capsule.completedWork,
      changed_files: capsule.changedFiles,
      commands_run: capsule.commandsRun,
      verification_results: capsule.verificationResults,
      known_issues: capsule.knownIssues,
      next_task: capsule.nextTask,
      rules_constraints: capsule.rulesConstraints,
      architecture_notes: capsule.architectureNotes,
      notes: capsule.notes,
      git_head: capsule.gitHead,
      git_branch: capsule.gitBranch,
      git_snapshot: capsule.gitSnapshot,
      token_estimate: capsule.tokenEstimate,
      created_at: capsule.createdAt,
      updated_at: capsule.updatedAt,
    },
    tags: tags.map((t) => t.name),
  };
}

export function toJsonExportString(
  capsule: Capsule,
  project: Project,
  tags: Tag[],
  exportedAt?: string,
): string {
  return `${JSON.stringify(toJsonExport(capsule, project, tags, exportedAt), null, 2)}\n`;
}

export function toMarkdownExport(capsule: Capsule, project: Project, tags: Tag[]): string {
  const frontMatter = buildFrontMatter({
    contextbridge: 1,
    id: capsule.id,
    title: capsule.title,
    type: capsule.type,
    status: capsule.status,
    tags: tags.map((t) => t.name),
    project: project.name,
    created: capsule.createdAt,
    updated: capsule.updatedAt,
    git_head: capsule.gitHead,
    git_branch: capsule.gitBranch,
    git_snapshot: capsule.gitSnapshot === null ? undefined : JSON.stringify(capsule.gitSnapshot),
  });
  return `${frontMatter}\n${capsule.contentMarkdown}`;
}
