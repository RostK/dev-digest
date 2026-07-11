import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { CiTarget } from '@devdigest/shared';

/**
 * CI module data-access. Owns ALL Drizzle for `ci_installations` + `ci_runs`.
 * Neither table has a `workspace_id` column (starter schema, no migration) —
 * every read/write is scoped by joining through `agents.workspace_id`
 * (server/INSIGHTS.md:47: read cross-module identity via your OWN repository,
 * never another module's). Upserts are APP-LEVEL (select-then-insert/update):
 * there is no DB unique constraint on `(agent_id, repo)` or
 * `(ci_installation_id, github_url)` — accepted for v1 (manual, low-concurrency
 * wizard/Sync actions); see server/INSIGHTS.md:22 on the TOCTOU trade-off.
 */

export type CiInstallationRow = typeof t.ciInstallations.$inferSelect;
export type CiRunRow = typeof t.ciRuns.$inferSelect;

/** A `ci_runs` row enriched with its installation's repo/target + the owning agent's name (AC-18). */
export interface EnrichedCiRunRow extends CiRunRow {
  agentName: string | null;
  repo: string | null;
  targetType: CiTarget | null;
}

/** Fields to insert/update a `ci_runs` row from a synced result artifact. */
export interface NewCiRun {
  ciInstallationId: string;
  prNumber: number | null;
  ranAt: Date | null;
  status: string;
  findingsCount: number | null;
  costUsd: number | null;
  githubUrl: string | null;
  source: string;
}

export class CiRepository {
  constructor(private db: Db) {}

  /** Resolve an agent's id iff it belongs to `workspaceId` — the tenancy gate every method below applies. */
  private async agentInWorkspace(workspaceId: string, agentId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: t.agents.id })
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, agentId)));
    return row !== undefined;
  }

  /**
   * Insert-or-update the `ci_installations` row for `(agentId, repo)` (app-level
   * upsert — no DB unique constraint, see class doc). Returns `undefined` when
   * the agent isn't in `workspaceId` (tenancy gate).
   */
  async upsertInstallation(
    workspaceId: string,
    agentId: string,
    repo: string,
    targetType: CiTarget,
  ): Promise<CiInstallationRow | undefined> {
    if (!(await this.agentInWorkspace(workspaceId, agentId))) return undefined;

    const [existing] = await this.db
      .select()
      .from(t.ciInstallations)
      .where(and(eq(t.ciInstallations.agentId, agentId), eq(t.ciInstallations.repo, repo)));

    if (existing) {
      const [row] = await this.db
        .update(t.ciInstallations)
        .set({ targetType })
        .where(eq(t.ciInstallations.id, existing.id))
        .returning();
      return row;
    }

    const [row] = await this.db
      .insert(t.ciInstallations)
      .values({ agentId, repo, targetType })
      .returning();
    return row;
  }

  /** A single installation, workspace-scoped via a join to `agents`. */
  async getInstallation(workspaceId: string, id: string): Promise<CiInstallationRow | undefined> {
    const [row] = await this.db
      .select({ installation: t.ciInstallations })
      .from(t.ciInstallations)
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id))
      .where(and(eq(t.ciInstallations.id, id), eq(t.agents.workspaceId, workspaceId)));
    return row?.installation;
  }

  /** Installations for one agent, newest first. Empty (not an error) when the agent isn't in `workspaceId`. */
  async listInstallationsForAgent(workspaceId: string, agentId: string): Promise<CiInstallationRow[]> {
    if (!(await this.agentInWorkspace(workspaceId, agentId))) return [];
    return this.db
      .select()
      .from(t.ciInstallations)
      .where(eq(t.ciInstallations.agentId, agentId))
      .orderBy(desc(t.ciInstallations.installedAt));
  }

  /** Insert-or-update a `ci_runs` row, deduped on `(ci_installation_id, github_url)` (AC-16). */
  async upsertRun(input: NewCiRun): Promise<CiRunRow> {
    const existing = input.githubUrl
      ? (
          await this.db
            .select()
            .from(t.ciRuns)
            .where(
              and(
                eq(t.ciRuns.ciInstallationId, input.ciInstallationId),
                eq(t.ciRuns.githubUrl, input.githubUrl),
              ),
            )
        )[0]
      : undefined;

    if (existing) {
      const [row] = await this.db
        .update(t.ciRuns)
        .set({
          prNumber: input.prNumber,
          ranAt: input.ranAt,
          status: input.status,
          findingsCount: input.findingsCount,
          costUsd: input.costUsd,
          source: input.source,
        })
        .where(eq(t.ciRuns.id, existing.id))
        .returning();
      return row!;
    }

    const [row] = await this.db.insert(t.ciRuns).values(input).returning();
    return row!;
  }

  private enrichedRunSelect() {
    return this.db
      .select({
        run: t.ciRuns,
        repo: t.ciInstallations.repo,
        targetType: t.ciInstallations.targetType,
        agentName: t.agents.name,
      })
      .from(t.ciRuns)
      .innerJoin(t.ciInstallations, eq(t.ciRuns.ciInstallationId, t.ciInstallations.id))
      .innerJoin(t.agents, eq(t.ciInstallations.agentId, t.agents.id));
  }

  private static flattenRuns(
    rows: { run: CiRunRow; repo: string; targetType: string; agentName: string }[],
  ): EnrichedCiRunRow[] {
    return rows.map((r) => ({
      ...r.run,
      repo: r.repo,
      targetType: r.targetType as CiTarget,
      agentName: r.agentName,
    }));
  }

  /** `ci_runs ⋈ ci_installations ⋈ agents WHERE workspace_id`, newest first (AC-18). */
  async listRuns(workspaceId: string): Promise<EnrichedCiRunRow[]> {
    const rows = await this.enrichedRunSelect()
      .where(eq(t.agents.workspaceId, workspaceId))
      .orderBy(desc(t.ciRuns.ranAt));
    return CiRepository.flattenRuns(rows);
  }

  /** Enriched run history for one agent (CI tab), newest first. */
  async listRunsForAgent(workspaceId: string, agentId: string): Promise<EnrichedCiRunRow[]> {
    if (!(await this.agentInWorkspace(workspaceId, agentId))) return [];
    const rows = await this.enrichedRunSelect()
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.ciInstallations.agentId, agentId)))
      .orderBy(desc(t.ciRuns.ranAt));
    return CiRepository.flattenRuns(rows);
  }
}
