import type { Capsule, Project } from '../types';
import { DEFAULT_TOKEN_BUDGET, estimateTokens } from './tokens';

export interface MasterContextInfo {
  goal: string;
  architectureNotes: string;
  rulesConstraints: string;
}

export interface HandoffDriftInfo {
  hasDrift: boolean;
  currentHead?: string;
  currentBranch?: string;
}

export interface GenerateHandoffOptions {
  compact?: boolean;
  tokenBudget?: number;
  drift?: HandoffDriftInfo;
}

export interface HandoffSection {
  title: string;
  body: string;
  truncatable: boolean;
}

const NOT_PROVIDED = '_Not provided._';
const TRUNCATED = '[truncated]';
const MASTER_CONTEXT_CAP = 1200;
const MIN_TRUNCATED_SECTION = 160;
const MAX_TRUNCATION_STEPS = 400;

const DRIFT_NOTE =
  'This handoff was captured from an older repository state. The current branch or commit may have changed. Inspect Git status before continuing.';

const NEXT_AI_INSTRUCTIONS = [
  'First inspect the actual repository and current Git status.',
  'Treat the repository as the source of truth.',
  'Do not assume this handoff is fully current if the code contradicts it.',
  'Make small, focused changes.',
  'Run relevant tests or builds after changes.',
  'Do not claim a feature works unless it was actually verified.',
  'Do not expose, request, or store secrets in project documentation.',
];

function content(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : NOT_PROVIDED;
}

function bullets(items: string[]): string {
  if (items.length === 0) {
    return NOT_PROVIDED;
  }
  return items.map((item) => `- ${item}`).join('\n');
}

function numbered(items: string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function compactText(text: string, cap: number): string {
  if (text.length <= cap) {
    return text;
  }
  return `${text.slice(0, cap)}\n${TRUNCATED}`;
}

function shortenTo(body: string, length: number): string {
  const withoutMarker = body.endsWith(`\n${TRUNCATED}`)
    ? body.slice(0, -(TRUNCATED.length + 1))
    : body;
  if (withoutMarker.length <= length) {
    return body;
  }
  return `${withoutMarker.slice(0, length)}\n${TRUNCATED}`;
}

function gitFacts(capsule: Capsule, project: Project): {
  repositoryPath: string;
  branch: string;
  commit: string;
  workingTree: string;
  capturedAt: string;
} {
  const snapshot = capsule.gitSnapshot ?? {};
  const repositoryPath =
    project.repositoryPath.trim().length > 0 ? project.repositoryPath.trim() : 'Not configured';
  const branch =
    capsule.gitBranch.trim() ||
    snapshot.branch ||
    (snapshot.detached ? 'detached HEAD' : '');
  const headRaw = capsule.gitHead.trim() || snapshot.head || '';
  const commit = headRaw.length > 0 ? headRaw.slice(0, 7) : '';
  const workingTree =
    typeof snapshot.workingTreeClean === 'boolean'
      ? snapshot.workingTreeClean
        ? 'clean'
        : 'dirty'
      : '';
  const capturedAt = snapshot.capturedAt ?? '';
  return { repositoryPath, branch, commit, workingTree, capturedAt };
}

function withMaster(
  own: string,
  masterText: string | null,
  label: string,
): string {
  if (masterText === null) {
    return own;
  }
  return `${own}\n\n*Master Context — ${label}:*\n${masterText}`;
}

export function buildHandoffSections(
  capsule: Capsule,
  project: Project,
  masterContext: MasterContextInfo | null,
  options: GenerateHandoffOptions,
): HandoffSection[] {
  const git = gitFacts(capsule, project);
  const isMasterItself = capsule.type === 'Master Context';
  const master =
    masterContext && !isMasterItself
      ? {
          goal: compactText(masterContext.goal.trim(), MASTER_CONTEXT_CAP),
          architecture: compactText(
            masterContext.architectureNotes.trim(),
            MASTER_CONTEXT_CAP,
          ),
          rules: compactText(masterContext.rulesConstraints.trim(), MASTER_CONTEXT_CAP),
        }
      : null;

  const masterArchitecture =
    master && master.architecture.length > 0 ? master.architecture : null;
  const masterRules = master && master.rules.length > 0 ? master.rules : null;

  const repositoryLines = [
    `- Repository path: ${git.repositoryPath}`,
    `- Branch: ${git.branch.length > 0 ? git.branch : NOT_PROVIDED}`,
    `- Commit: ${git.commit.length > 0 ? git.commit : NOT_PROVIDED}`,
    `- Working tree: ${git.workingTree.length > 0 ? git.workingTree : NOT_PROVIDED}`,
    `- Captured: ${git.capturedAt.length > 0 ? git.capturedAt : NOT_PROVIDED}`,
  ];
  if (options.drift?.hasDrift) {
    repositoryLines.push(`- Drift warning: ${DRIFT_NOTE}`);
  }

  return [
    { title: 'Project', body: project.name, truncatable: false },
    { title: 'Product Goal', body: content(capsule.goal), truncatable: true },
    { title: 'Repository', body: repositoryLines.join('\n'), truncatable: false },
    { title: 'Current Task', body: content(capsule.currentTask), truncatable: true },
    { title: 'Completed Work', body: content(capsule.completedWork), truncatable: true },
    { title: 'Files Changed', body: bullets(capsule.changedFiles), truncatable: true },
    { title: 'Commands Run', body: bullets(capsule.commandsRun), truncatable: true },
    { title: 'Verification', body: content(capsule.verificationResults), truncatable: true },
    {
      title: 'Known Issues / Blockers',
      body: content(capsule.knownIssues),
      truncatable: true,
    },
    {
      title: 'Architecture / Technical Notes',
      body: withMaster(
        content(capsule.architectureNotes),
        masterArchitecture,
        'Architecture',
      ),
      truncatable: true,
    },
    {
      title: 'Rules and Constraints',
      body: withMaster(content(capsule.rulesConstraints), masterRules, 'Rules'),
      truncatable: true,
    },
    { title: 'Next Exact Task', body: content(capsule.nextTask), truncatable: true },
  ];
}

function assemble(sections: HandoffSection[], instructions: string): string {
  const lines: string[] = ['# Project Handoff', ''];
  for (const section of sections) {
    lines.push(`## ${section.title}`, section.body, '');
  }
  lines.push('## Instructions for the Next AI', instructions, '');
  return lines.join('\n');
}

function applyBudget(sections: HandoffSection[], budget: number): void {
  let text = assemble(sections, numbered(NEXT_AI_INSTRUCTIONS));
  let steps = 0;
  while (estimateTokens(text) > budget && steps < MAX_TRUNCATION_STEPS) {
    steps += 1;
    const candidates = sections
      .filter((s) => s.truncatable && s.body.length > MIN_TRUNCATED_SECTION)
      .sort((a, b) => b.body.length - a.body.length);
    if (candidates.length === 0) {
      break;
    }
    const target = candidates[0];
    const nextLength = Math.max(
      MIN_TRUNCATED_SECTION,
      Math.floor(target.body.length / 2),
    );
    target.body = shortenTo(target.body, nextLength);
    text = assemble(sections, numbered(NEXT_AI_INSTRUCTIONS));
  }
}

/**
 * Deterministic Markdown handoff generator. No AI model, no network.
 *
 * Heading order is fixed and stable. Empty structured fields render as
 * `_Not provided._`. Compact mode truncates large content with explicit
 * `[truncated]` markers and never removes headings.
 */
export function generateHandoff(
  capsule: Pick<
    Capsule,
    | 'type'
    | 'goal'
    | 'currentTask'
    | 'completedWork'
    | 'changedFiles'
    | 'commandsRun'
    | 'verificationResults'
    | 'knownIssues'
    | 'architectureNotes'
    | 'rulesConstraints'
    | 'nextTask'
    | 'gitHead'
    | 'gitBranch'
    | 'gitSnapshot'
  >,
  project: Pick<Project, 'name' | 'repositoryPath'>,
  masterContext: MasterContextInfo | null,
  options: GenerateHandoffOptions = {},
): string {
  const sections = buildHandoffSections(
    capsule as Capsule,
    project as Project,
    masterContext,
    options,
  );
  if (options.compact) {
    applyBudget(sections, options.tokenBudget ?? DEFAULT_TOKEN_BUDGET);
  }
  return assemble(sections, numbered(NEXT_AI_INSTRUCTIONS));
}
