import { and, eq, inArray, lte, notInArray, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { PullRow } from '../../db/rows.js';
import { FALLBACK_MAX_CALLERS_PER_SYMBOL, type RawCaller, type RawFacts } from './fallback.js';

/**
 * Blast repository — the small set of reads the route needs to turn a PR id
 * into (repoId, changedFiles). Pure Drizzle; no container knowledge.
 *
 * Both queries duplicate tiny reads that also live in the reviews module — a
 * repository owning the SQL over a shared table is the established pattern here
 * (cross-module imports of another module's repository are forbidden).
 */
export class BlastRepository {
  constructor(private db: Db) {}

  /** True when `repoId` belongs to `workspaceId` — tenancy guard for the
   *  file-based (MCP) blast path, which is otherwise keyed only by repo id. */
  async repoInWorkspace(workspaceId: string, repoId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return !!row;
  }

  /** Workspace-scoped PR lookup (tenancy guard). */
  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /** Persisted changed-file paths for a PR (written when the PR detail loads). */
  async getPrFilePaths(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }

  // --- Fallback caller resolution (when the index has no resolved decl_file) ---

  /** Of `names`, the subset declared in exactly ONE file in the repo (unambiguous). */
  async getUnambiguousNames(repoId: string, names: string[]): Promise<string[]> {
    if (names.length === 0) return [];
    const rows = await this.db
      .select({ name: t.symbols.name })
      .from(t.symbols)
      .where(and(eq(t.symbols.repoId, repoId), inArray(t.symbols.name, names)))
      .groupBy(t.symbols.name)
      .having(sql`count(distinct ${t.symbols.path}) = 1`);
    return rows.map((r) => r.name);
  }

  /**
   * References TO any of `names`, excluding `excludeFiles`, capped per symbol AT
   * THE DB via a window: highest file-rank first, NULL rank last (coalesce 0).
   * This bounds the read (no unbounded fan-out on a hot route for a popular
   * symbol) AND makes the cap keep the most important callers — file_rank is a
   * later-lesson table, so on this fallback path many rows have no rank.
   */
  async getCallersByName(
    repoId: string,
    names: string[],
    excludeFiles: string[],
  ): Promise<RawCaller[]> {
    if (names.length === 0) return [];
    const conds = [eq(t.references.repoId, repoId), inArray(t.references.toSymbol, names)];
    if (excludeFiles.length > 0) conds.push(notInArray(t.references.fromPath, excludeFiles));

    const ranked = this.db
      .select({
        file: t.references.fromPath,
        toSymbol: t.references.toSymbol,
        line: t.references.line,
        rank: sql<number>`coalesce(${t.fileRank.rank}, 0)`.as("rank"),
        rn: sql<number>`row_number() over (partition by ${t.references.toSymbol} order by coalesce(${t.fileRank.rank}, 0) desc, ${t.references.fromPath}, ${t.references.line})`.as(
          "rn",
        ),
      })
      .from(t.references)
      .leftJoin(
        t.fileRank,
        and(eq(t.fileRank.repoId, t.references.repoId), eq(t.fileRank.filePath, t.references.fromPath)),
      )
      .where(and(...conds))
      .as("ranked");

    const rows = await this.db
      .select({ file: ranked.file, toSymbol: ranked.toSymbol, line: ranked.line, rank: ranked.rank })
      .from(ranked)
      .where(lte(ranked.rn, FALLBACK_MAX_CALLERS_PER_SYMBOL));

    return rows.map((r) => ({ file: r.file, toSymbol: r.toSymbol, line: r.line, rank: r.rank ?? 0 }));
  }

  /** Per-file endpoints/crons for the given caller files. */
  async getFileFacts(repoId: string, files: string[]): Promise<RawFacts[]> {
    if (files.length === 0) return [];
    const rows = await this.db
      .select({
        filePath: t.fileFacts.filePath,
        endpoints: t.fileFacts.endpoints,
        crons: t.fileFacts.crons,
      })
      .from(t.fileFacts)
      .where(and(eq(t.fileFacts.repoId, repoId), inArray(t.fileFacts.filePath, files)));
    return rows.map((r) => ({
      filePath: r.filePath,
      endpoints: (r.endpoints as string[]) ?? [],
      crons: (r.crons as string[]) ?? [],
    }));
  }
}
