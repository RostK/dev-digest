import type { ProjectContextDoc, RepoRef } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import type { DiscoveredDoc } from '../repo-intel/types.js';
import { ProjectContextRepository } from './repository.js';
import { countUsedBy, toProjectContextDoc } from './helpers.js';

/**
 * The `RepoIntel` port (repo-intel/types.ts) hasn't grown `discoverContextDocs`
 * yet — Wave A added it to the concrete `RepoIntelService` (repo-intel/
 * service.ts) but not to the interface it implements, so `container.repoIntel`
 * (typed `RepoIntel`) doesn't see it. Out of this module's file scope to fix
 * (repo-intel/types.ts belongs to another unit) — narrow-cast locally instead
 * of widening the port from here. Flagged in the return summary.
 */
interface RepoIntelContextDocs {
  discoverContextDocs(repoId: string, roots?: string[]): Promise<DiscoveredDoc[]>;
}

/**
 * project-context service (SPEC-02 T4). A thin facade: discover context docs
 * for the repo (repo-intel, whole-clone), read + tokenize each one, and
 * attach used_by/coverage computed from this workspace's agents/skills.
 *
 * No LLM / embedding call anywhere (AC-12) — the only adapters touched are
 * `container.git` (read the doc text) and `container.tokenizer` (count it),
 * both pure reads/computation, no network.
 */
export class ProjectContextService {
  private repo: ProjectContextRepository;

  constructor(private container: Container) {
    this.repo = new ProjectContextRepository(container.db);
  }

  /**
   * Discover this repo's context docs and attach tokens/used_by/coverage.
   * Throws NotFoundError when `repoId` isn't in `workspaceId` (AC-19 tenancy
   * guard) so a foreign repo's clone/docs can never be read cross-tenant.
   */
  async listDocs(workspaceId: string, repoId: string): Promise<ProjectContextDoc[]> {
    const repo = await this.repo.repoInWorkspace(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const repoIntel = this.container.repoIntel as unknown as RepoIntelContextDocs;
    const [discovered, ownRows, inheritedRows, totalAgents] = await Promise.all([
      // v1: whole-clone discovery only — never pass user-controlled `roots`
      // through (the repo-intel walk doesn't validate `..` in roots yet).
      repoIntel.discoverContextDocs(repoId),
      this.repo.ownContextDocRows(workspaceId),
      this.repo.inheritedContextDocRows(workspaceId),
      this.repo.agentCount(workspaceId),
    ]);

    const usedByMap = countUsedBy(ownRows, inheritedRows);
    const ref: RepoRef = { owner: repo.owner, name: repo.name };

    return Promise.all(
      discovered.map(async (doc) => {
        // Best-effort read: a doc discovered by the walk should exist, but
        // never throw the whole list over one unreadable file (deleted
        // between walk and read, permissions, …) — degrade its tokens to 0.
        const text = await this.container.git.readFile(ref, doc.path).catch(() => '');
        const tokens = this.container.tokenizer.count(text);
        const usedBy = usedByMap.get(doc.path) ?? 0;
        return toProjectContextDoc(doc, tokens, usedBy, totalAgents);
      }),
    );
  }
}
