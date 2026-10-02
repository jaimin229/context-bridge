import type { GitSnapshotInfo } from '../types';

export type DriftReason =
  'head-changed' | 'branch-changed' | 'working-tree-changed' | 'repository-unavailable';

export interface DriftReport {
  hasDrift: boolean;
  reasons: DriftReason[];
  currentHead: string | null;
  currentBranch: string | null;
}

function sorted(files: string[] | undefined): string[] {
  return [...(files ?? [])].sort();
}

/**
 * Compares a captured snapshot against the current repository state.
 * Without a baseline snapshot there is nothing to drift from, so the report
 * is clean. If a baseline exists but the repository cannot be read (removed,
 * Git unavailable), that is itself a drift condition.
 */
export function detectDrift(
  captured: GitSnapshotInfo | null | undefined,
  current: GitSnapshotInfo | null | undefined,
): DriftReport {
  const currentHead = current?.head?.trim() || null;
  const currentBranch = current?.branch?.trim() || null;

  if (!captured) {
    return { hasDrift: false, reasons: [], currentHead, currentBranch };
  }
  if (!current) {
    return {
      hasDrift: true,
      reasons: ['repository-unavailable'],
      currentHead: null,
      currentBranch: null,
    };
  }

  const reasons: DriftReason[] = [];
  const capturedHead = captured.head?.trim() ?? '';
  const nowHead = current.head?.trim() ?? '';
  if (capturedHead !== nowHead) {
    reasons.push('head-changed');
  }

  const capturedBranch = captured.branch?.trim() ?? '';
  const nowBranch = current.branch?.trim() ?? '';
  if (capturedBranch !== nowBranch) {
    reasons.push('branch-changed');
  }

  const capturedClean = captured.workingTreeClean ?? true;
  const nowClean = current.workingTreeClean ?? true;
  const capturedFiles = sorted(captured.changedFiles).join('\n');
  const currentFiles = sorted(current.changedFiles).join('\n');
  if (capturedClean !== nowClean || capturedFiles !== currentFiles) {
    reasons.push('working-tree-changed');
  }

  return { hasDrift: reasons.length > 0, reasons, currentHead, currentBranch };
}
