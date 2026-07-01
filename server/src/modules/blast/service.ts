import type { BlastResponse } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { BlastRepository } from './repository.js';
import { mapToBlastRadius } from './mapper.js';
import { summarize } from './summary.js';
import { buildFallbackResult } from './fallback.js';

/**
 * Blast service. Reads the existing repo-intel index (no parsing at request
 * time) and assembles the HTTP response:
 *
 *   changedFiles  → repoIntel.getBlastRadius (pure index reads, degrades safely)
 *                 → mapToBlastRadius (flat BlastResult → nested BlastRadius)
 *                 → summarize        (one cheap-model call, deterministic fallback)
 *                 → BlastResponse    (+ degraded / reason / index_status)
 *
 * Tenancy: PR lookups are workspace-scoped; the facade itself is tenant-agnostic
 * (consistent with the repo-intel index-state route).
 */
export class BlastService {
  private repo: BlastRepository;

  constructor(private container: Container) {
    this.repo = new BlastRepository(container.db);
  }

  /** Blast radius for a tracked PR — derives changed files from `pr_files`. */
  async blastForPr(workspaceId: string, prId: string): Promise<BlastResponse> {
    const pull = await this.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const changedFiles = await this.repo.getPrFilePaths(prId);
    return this.build(pull.repoId, changedFiles);
  }

  /** Blast radius for an explicit file set (the MCP-facing path). Verifies the
   *  repo belongs to the workspace so the file-keyed route can't read another
   *  tenant's repo map. */
  async blastForFiles(workspaceId: string, repoId: string, files: string[]): Promise<BlastResponse> {
    if (!(await this.repo.repoInWorkspace(workspaceId, repoId))) {
      throw new NotFoundError('Repo not found');
    }
    return this.build(repoId, files);
  }

  private async build(repoId: string, changedFiles: string[]): Promise<BlastResponse> {
    let result = await this.container.repoIntel.getBlastRadius(repoId, changedFiles);

    // Fallback: when the facade found no callers because the index has no
    // resolved cross-file references (decl_file is a later-lesson slot), rebuild
    // callers by name-matching the references table — restricted to unambiguous
    // names (declared in one file). Best-effort, pure read, no index mutation.
    if (result.callers.length === 0 && result.changedSymbols.length > 0) {
      const names = await this.repo.getUnambiguousNames(
        repoId,
        [...new Set(result.changedSymbols.map((s) => s.name))],
      );
      const callerRows = await this.repo.getCallersByName(repoId, names, changedFiles);
      if (callerRows.length > 0) {
        const callerFiles = [...new Set(callerRows.map((r) => r.file))];
        const factsRows = await this.repo.getFileFacts(repoId, callerFiles);
        result = buildFallbackResult(result, callerRows, factsRows);
      }
    }

    const summary = await summarize(this.container, result);
    const blast = mapToBlastRadius(result, summary);

    // Precise per-query degraded signal + the repo's overall index status, so
    // the UI can show a "partial index" badge with an honest explanation.
    const state = await this.container.repoIntel.getIndexState(repoId);
    return {
      blast,
      degraded: result.degraded ?? state.degraded ?? false,
      reason: result.reason ?? state.degradedReason ?? null,
      index_status: state.status,
    };
  }
}
