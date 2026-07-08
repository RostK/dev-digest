import { and, desc, eq, inArray } from 'drizzle-orm';
import { MultiAgentEstimate } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentRunRow } from '../../db/rows.js';
import { AGENT_RUN_HISTORY_WINDOW } from './constants.js';

/**
 * Multi-Agent Review data-access. The ONLY layer touching the DB for this
 * module — owns reads/writes of `multi_agent_runs` and the linkage write onto
 * `agent_runs.multi_agent_run_id` (Q1: a FK column, not a join table). Every
 * query is scoped by `workspace_id`. Column/conflict COMPOSITION (mapping raw
 * rows → the `MultiAgentRun`/`AgentColumn`/`Conflict` contracts) is a SERVICE
 * concern (T2) — this repository only reads/writes rows.
 */

/**
 * One `multi_agent_runs` row with its `estimate` jsonb safely parsed.
 * `estimate` is an UNCONSTRAINED jsonb column with no response schema at the
 * route boundary — a malformed/legacy row degrades to `null` here rather than
 * an unchecked `as MultiAgentEstimate` (server/INSIGHTS.md 2026-07-03).
 */
export interface MultiRunRow {
  id: string;
  workspaceId: string;
  prId: string;
  ranAt: Date;
  estimate: MultiAgentEstimate | null;
}

function toMultiRunRow(row: typeof t.multiAgentRuns.$inferSelect): MultiRunRow {
  const parsed = row.estimate == null ? undefined : MultiAgentEstimate.safeParse(row.estimate);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    prId: row.prId,
    ranAt: row.ranAt,
    estimate: parsed?.success ? parsed.data : null,
  };
}

/** An `agent_runs` row linked to a multi-run, joined with the agent's name. */
export type LinkedAgentRun = AgentRunRow & { agentName: string | null };

export class MultiAgentReviewRepository {
  constructor(private db: Db) {}

  /**
   * Create the `multi_agent_runs` row, persisting the SERVER-computed pre-run
   * estimate (calibration data, AC-22 — never the client-submitted one). A
   * fresh row every call (AC-25: re-running the same PR never overwrites).
   */
  async createMultiRun(
    workspaceId: string,
    prId: string,
    estimate: MultiAgentEstimate | null,
  ): Promise<MultiRunRow> {
    const [row] = await this.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId, prId, estimate })
      .returning();
    return toMultiRunRow(row!);
  }

  /** Workspace-scoped read — a cross-workspace id resolves to `undefined` (→
   *  the SERVICE throws NotFoundError; AC-8). */
  async getMultiRun(workspaceId: string, id: string): Promise<MultiRunRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.id, id)));
    return row ? toMultiRunRow(row) : undefined;
  }

  /** A PR's multi-run history, newest first (AC-25). */
  async listMultiRunsForPr(workspaceId: string, prId: string): Promise<MultiRunRow[]> {
    const rows = await this.db
      .select()
      .from(t.multiAgentRuns)
      .where(and(eq(t.multiAgentRuns.workspaceId, workspaceId), eq(t.multiAgentRuns.prId, prId)))
      .orderBy(desc(t.multiAgentRuns.ranAt));
    return rows.map(toMultiRunRow);
  }

  /**
   * Link the fanned-out `agent_runs` to the multi-run they belong to (Q1: the
   * FK column on `agent_runs`, written after each per-agent `runReview` call
   * has returned its runId — one UPDATE, no join table).
   */
  async linkAgentRuns(multiRunId: string, runIds: string[]): Promise<void> {
    if (runIds.length === 0) return;
    await this.db
      .update(t.agentRuns)
      .set({ multiAgentRunId: multiRunId })
      .where(inArray(t.agentRuns.id, runIds));
  }

  /**
   * The `agent_runs` linked to a multi-run, joined with the agent's name — the
   * raw material for `AgentColumn` composition (mapping is the SERVICE's job;
   * this only reads).
   */
  async getLinkedAgentRuns(multiRunId: string): Promise<LinkedAgentRun[]> {
    const rows = await this.db
      .select({ run: t.agentRuns, agentName: t.agents.name })
      .from(t.agentRuns)
      .leftJoin(t.agents, eq(t.agents.id, t.agentRuns.agentId))
      .where(eq(t.agentRuns.multiAgentRunId, multiRunId));
    return rows.map(({ run, agentName }) => ({ ...run, agentName: agentName ?? null }));
  }

  /**
   * An agent's own past COMPLETED runs (most recent first, capped at
   * `AGENT_RUN_HISTORY_WINDOW`) — the input for the pre-run estimate
   * (AC-5/AC-6). An agent with none (or only failed) runs has no usable
   * history; the SERVICE decides that and renders `— · no history`.
   * Workspace-scoped: `agent_runs.workspace_id` is stamped from the caller's
   * context at run time, so this also acts as the tenancy guard.
   */
  async agentRunHistory(workspaceId: string, agentId: string): Promise<AgentRunRow[]> {
    return this.db
      .select()
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          eq(t.agentRuns.agentId, agentId),
          eq(t.agentRuns.status, 'done'),
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt))
      .limit(AGENT_RUN_HISTORY_WINDOW);
  }
}
