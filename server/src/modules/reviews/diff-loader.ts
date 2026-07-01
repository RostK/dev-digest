import type { Container } from '../../platform/container.js';
import type { UnifiedDiff } from '@devdigest/shared';
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import * as schema from '../../db/schema.js';
import type { ReviewRepository, PullRow } from './repository.js';

/**
 * Load the unified diff for a PR. Prefers a real `git diff base...head`; for an
 * open PR whose head isn't in the (shallow, default-branch-only) clone yet, it
 * fetches `pull/<n>/head` and retries; only then does it fall back to a
 * synthetic diff assembled from the persisted pr_files patches (so the reviewer
 * still works offline / before a clone completes / in tests).
 *
 * An empty result here is meaningful — the caller MUST treat a zero-file diff as
 * "nothing to review" and fail the run, never review (and approve) an empty diff.
 */
export async function loadDiff(
  container: Container,
  repo: ReviewRepository,
  workspaceId: string,
  pull: PullRow,
  repoRow: typeof schema.repos.$inferSelect,
): Promise<UnifiedDiff> {
  const ref = { owner: repoRow.owner, name: repoRow.name };

  // 1. Local clone diff — the fast path for merged PRs and already-fetched heads.
  const direct = await gitDiffOrEmpty(container, ref, pull.base, pull.headSha);
  if (direct.files.length > 0) return direct;

  // 2. Open PR: the head sha usually isn't in the shallow, default-branch-only
  //    clone, so `git diff base...head` above resolved to nothing. Fetch
  //    pull/<n>/head (the head's history connects to the merge-base that IS in
  //    the clone) and retry. This is the step that makes open-PR reviews work.
  try {
    await container.git.fetchPullHead(ref, pull.number);
    const fetched = await gitDiffOrEmpty(container, ref, pull.base, pull.headSha);
    if (fetched.files.length > 0) return fetched;
  } catch {
    /* fetch unavailable (offline / no clone / non-GitHub remote) — fall through */
  }

  // 3. Last resort: reconstruct from persisted pr_files patches.
  return diffFromPrFiles(repo, pull.id);
}

/** `container.git.diff`, returning an empty diff instead of throwing. */
async function gitDiffOrEmpty(
  container: Container,
  ref: { owner: string; name: string },
  base: string,
  head: string,
): Promise<UnifiedDiff> {
  try {
    return await container.git.diff(ref, base, head);
  } catch {
    return { raw: '', files: [] };
  }
}

/** Reconstruct a UnifiedDiff from persisted pr_files patches. */
export async function diffFromPrFiles(repo: ReviewRepository, prId: string): Promise<UnifiedDiff> {
  const files = await repo.getPrFiles(prId);
  const parts: string[] = [];
  for (const f of files) {
    if (!f.patch) continue;
    parts.push(`diff --git a/${f.path} b/${f.path}`);
    parts.push(`--- a/${f.path}`);
    parts.push(`+++ b/${f.path}`);
    parts.push(f.patch);
  }
  return parseUnifiedDiff(parts.join('\n'));
}
