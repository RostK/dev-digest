import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/**
 * Conventions data-access. Owns the `conventions` table, workspace-scoped
 * throughout. Also resolves the owning repo's identity (owner/name/clone/branch)
 * with a scoped read of `repos` — the same cross-module pattern pulls/reviews use.
 */

export type ConventionRow = typeof t.conventions.$inferSelect;
export type RepoRow = typeof t.repos.$inferSelect;

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  category: string;
  rule: string;
  evidencePath: string;
  evidenceSnippet: string;
  evidenceStartLine: number | null;
  evidenceEndLine: number | null;
  confidence: number;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  /** The repo, scoped to the workspace (tenancy guard). */
  async getRepo(workspaceId: string, repoId: string): Promise<RepoRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /** Candidates for a repo, highest confidence first. */
  async list(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence));
  }

  /** Drop a repo's existing candidates (a re-scan fully replaces them). */
  async deleteByRepo(workspaceId: string, repoId: string): Promise<void> {
    await this.db
      .delete(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)));
  }

  async insertMany(values: InsertConvention[]): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return this.db
      .insert(t.conventions)
      .values(values.map((v) => ({ ...v, accepted: false })))
      .returning();
  }

  /** Toggle accept/reject for one candidate; undefined when not in workspace. */
  async setAccepted(
    workspaceId: string,
    id: string,
    accepted: boolean,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set({ accepted })
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }
}
