import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalExpectation } from '@devdigest/shared';
import type { FindingRow, PullRow } from '../../db/rows.js';

/**
 * SPEC-05 T3 — eval data-access. Owns `eval_cases` + `eval_runs`. Every case
 * read/write is scoped by `workspace_id`; every run write carries the run-group
 * snapshot (group_id, agent_version, system_prompt) captured ONCE at the top of
 * `EvalService.runSet` (server/INSIGHTS.md — mid-run edit isolation).
 *
 * Cross-module reads (finding → its review's agent_id/pr_id, and the PR row for
 * diff capture) are done here via OWN workspace-scoped `db.select()` calls over
 * the shared `reviews`/`findings`/`pull_requests` tables — NOT by importing the
 * reviews module's `ReviewRepository` (server/INSIGHTS.md:47 — a repository
 * owning its SQL over a shared table is the sanctioned pattern; importing a
 * sibling module's repository class is not).
 */

export type EvalCaseRow = typeof t.evalCases.$inferSelect;
export type EvalRunRow = typeof t.evalRuns.$inferSelect;

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: 'skill' | 'agent';
  ownerId: string;
  name: string;
  inputDiff?: string | null;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectedOutput: EvalExpectation;
  notes?: string | null;
}

export interface InsertEvalRun {
  caseId: string;
  actualOutput?: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  /** Raw grounding counts for this case (feed the POOLED group citation_accuracy). */
  kept: number | null;
  dropped: number | null;
  durationMs: number | null;
  costUsd: number | null;
  /** Run-group snapshot — shared across every case's row in the same runSet call. */
  groupId: string;
  agentVersion: number;
  systemPrompt: string;
}

/** The context a finding resolves to: its own row, its review, and the PR the
 *  review ran against — everything `createCaseFromFinding` needs. */
export interface FindingContext {
  finding: FindingRow;
  reviewAgentId: string | null;
  prId: string;
}

/**
 * Aggregate metrics for one run-group (T4 read side) — the SQL-computed
 * counterpart of `scoring.ts`'s `aggregateRun`, but over ALREADY-PERSISTED
 * per-case `eval_runs` rows (recall/precision/citation_accuracy were computed
 * once by `scoreCase` at run time and stored per row), so the read path never
 * re-derives them from raw kept/dropped counts. `recall`/`precision`/
 * `citation_accuracy` average the non-null values across the group's rows —
 * Postgres `avg()` ignores NULLs, matching `aggregateRun`'s own
 * null-exclusion for `recall_case`. Returns `undefined` if the group has no
 * rows in this workspace (never-run / cross-tenant group id).
 */
export interface GroupAggregate {
  groupId: string;
  agentVersion: number;
  systemPrompt: string;
  ranAt: string;
  recall: number;
  precision: number;
  citationAccuracy: number;
  tracesPassed: number;
  tracesTotal: number;
  costUsd: number | null;
}

/** One agent's rollup row for the global dashboard's summary table. */
export interface AgentSummaryRow {
  agentId: string;
  agentVersion: number;
  recall: number;
  precision: number;
  citationAccuracy: number;
  runCount: number;
}

export class EvalRepository {
  constructor(private db: Db) {}

  // ---- eval_cases ----------------------------------------------------------

  async createCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff ?? null,
        inputFiles: (values.inputFiles as object | undefined) ?? null,
        inputMeta: (values.inputMeta as object | undefined) ?? null,
        expectedOutput: values.expectedOutput,
        notes: values.notes ?? null,
      })
      .returning();
    return row!;
  }

  /** All cases owned by a given agent, workspace-scoped. */
  async listCasesForAgent(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      );
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return row;
  }

  /**
   * Cases owned by an agent that carry a checkable `expected_output` (AC-16
   * skips are decided by the CALLER via `EvalExpectation.safeParse` — this just
   * hands back the raw rows so runSet can validate + skip per-case).
   */
  async getExpectedCasesForAgent(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.listCasesForAgent(workspaceId, agentId);
  }

  /**
   * The latest `eval_runs` row per case, for every case owned by an agent —
   * the state the case-list UI needs (`last_run_pass`/`actual_count`).
   * Resolved with `DISTINCT ON (case_id)` ordered by `ran_at DESC`, NOT
   * fetch-all-runs-then-dedup-in-JS (server/INSIGHTS.md:36). A case with no
   * runs yet simply has no entry in the returned map.
   */
  async latestRunPerCase(workspaceId: string, agentId: string): Promise<Map<string, EvalRunRow>> {
    const rows = await this.db
      .selectDistinctOn([t.evalRuns.caseId], { run: t.evalRuns })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(t.evalRuns.caseId, desc(t.evalRuns.ranAt));
    return new Map(rows.map((r) => [r.run.caseId, r.run]));
  }

  // ---- eval_runs -------------------------------------------------------------

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        actualOutput: (values.actualOutput as object | undefined) ?? null,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        kept: values.kept,
        dropped: values.dropped,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
        groupId: values.groupId,
        agentVersion: values.agentVersion,
        systemPrompt: values.systemPrompt,
      })
      .returning();
    return row!;
  }

  /** All runs for every case owned by an agent, newest first, workspace-scoped
   *  via a join through the owning case — the raw feed behind the (T4-owned)
   *  dashboard/run-history reads. */
  async getRunsForAgent(workspaceId: string, agentId: string): Promise<EvalRunRow[]> {
    const rows = await this.db
      .select({ run: t.evalRuns })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
        ),
      )
      .orderBy(desc(t.evalRuns.ranAt));
    return rows.map((r) => r.run);
  }

  /** All eval_runs rows sharing a run-group id, workspace-scoped via a join
   *  through their owning case. Used by runSet's return + the (T4-owned)
   *  group-aggregate/compare reads. */
  async getGroup(workspaceId: string, groupId: string): Promise<EvalRunRow[]> {
    const rows = await this.db
      .select({ run: t.evalRuns })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalRuns.groupId, groupId)))
      .orderBy(desc(t.evalRuns.ranAt));
    return rows.map((r) => r.run);
  }

  /**
   * Every DISTINCT run-group id for an agent, most-recent first — the
   * grouping key for `GET /agents/:id/eval-runs` (aggregated run history).
   * `groupId` is NOT a real FK (a value object, not a row — see the schema
   * comment on `eval_runs.group_id`), so this reduces the raw per-case rows
   * to one entry per group via `GROUP BY`, ordering by each group's own
   * latest `ran_at` (a case's row is not necessarily written in group order
   * within a batch, but the whole group shares one wall-clock window).
   */
  async listGroupIdsForAgent(workspaceId: string, agentId: string): Promise<string[]> {
    const rows = await this.db
      .select({ groupId: t.evalRuns.groupId, latest: sql<Date>`max(${t.evalRuns.ranAt})` })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          eq(t.evalCases.ownerId, agentId),
          sql`${t.evalRuns.groupId} is not null`,
        ),
      )
      .groupBy(t.evalRuns.groupId)
      .orderBy(sql`max(${t.evalRuns.ranAt}) desc`);
    return rows.map((r) => r.groupId).filter((id): id is string => id !== null);
  }

  /**
   * How many rows a run-group has persisted so far — powers the live run
   * progress poll. `workspace_id`-scoped via the join through `eval_cases`, so a
   * foreign group id counts 0 (never leaks another tenant's progress).
   */
  async countRunsInGroup(workspaceId: string, groupId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalRuns.groupId, groupId)));
    return row?.n ?? 0;
  }

  /**
   * Aggregate one run-group's metrics (T4). `workspace_id`-scoped via the
   * join through `eval_cases` — a group id from another tenant resolves to
   * `undefined`, never leaking cross-tenant aggregates.
   */
  async getGroupAggregate(workspaceId: string, groupId: string): Promise<GroupAggregate | undefined> {
    const [row] = await this.db
      .select({
        agentVersion: sql<number>`max(${t.evalRuns.agentVersion})`,
        systemPrompt: sql<string>`max(${t.evalRuns.systemPrompt})`,
        ranAt: sql<Date>`max(${t.evalRuns.ranAt})`,
        recall: sql<number | null>`avg(${t.evalRuns.recall})`,
        precision: sql<number | null>`avg(${t.evalRuns.precision})`,
        // AC-7: POOLED, not avg — sum(kept)/(sum(kept)+sum(dropped)); empty
        // pool (no raw findings, or legacy rows with null counts) → 1.
        citationAccuracy: sql<number>`case when coalesce(sum(${t.evalRuns.kept}),0) + coalesce(sum(${t.evalRuns.dropped}),0) = 0 then 1 else coalesce(sum(${t.evalRuns.kept}),0)::float8 / (coalesce(sum(${t.evalRuns.kept}),0) + coalesce(sum(${t.evalRuns.dropped}),0)) end`.mapWith(Number),
        tracesPassed: sql<number>`count(*) filter (where ${t.evalRuns.pass} is true)`.mapWith(Number),
        tracesTotal: sql<number>`count(*)`.mapWith(Number),
        costUsd: sql<number | null>`sum(${t.evalRuns.costUsd})`,
      })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalRuns.groupId, groupId)));

    if (!row || row.tracesTotal === 0) return undefined;
    return {
      groupId,
      agentVersion: row.agentVersion,
      systemPrompt: row.systemPrompt,
      ranAt: new Date(row.ranAt).toISOString(),
      recall: row.recall ?? 1,
      precision: row.precision ?? 1,
      citationAccuracy: row.citationAccuracy ?? 1,
      tracesPassed: row.tracesPassed,
      tracesTotal: row.tracesTotal,
      costUsd: row.costUsd,
    };
  }

  /**
   * The LATEST run-group per agent across the whole workspace (global
   * dashboard `recent_runs` + the per-agent summary rollup's "current"
   * snapshot) — resolved with `DISTINCT ON` in Postgres, NOT fetch-every-run-
   * then-dedup-in-JS (server/INSIGHTS.md:36). Ordered by each agent's own
   * latest run timestamp, most-recent first.
   */
  async latestGroupPerAgent(workspaceId: string): Promise<GroupAggregate[]> {
    // One row per (case, its run) first, tagged with the owning agent id —
    // then DISTINCT ON (owner_id, group_id) collapses to one row per group,
    // and a second pass picks the latest group per agent.
    const perGroup = this.db
      .selectDistinctOn([t.evalCases.ownerId, t.evalRuns.groupId], {
        agentId: t.evalCases.ownerId,
        groupId: t.evalRuns.groupId,
        ranAt: t.evalRuns.ranAt,
      })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, 'agent'),
          sql`${t.evalRuns.groupId} is not null`,
        ),
      )
      .orderBy(t.evalCases.ownerId, t.evalRuns.groupId, desc(t.evalRuns.ranAt))
      .as('per_group');

    const latestPerAgent = this.db
      .selectDistinctOn([perGroup.agentId], {
        agentId: perGroup.agentId,
        groupId: perGroup.groupId,
      })
      .from(perGroup)
      .orderBy(perGroup.agentId, desc(perGroup.ranAt))
      .as('latest_per_agent');

    const rows = await this.db
      .select({ groupId: latestPerAgent.groupId })
      .from(latestPerAgent)
      .orderBy(desc(latestPerAgent.groupId));

    const groupIds = rows.map((r) => r.groupId).filter((id): id is string => id !== null);
    const aggregates = await Promise.all(
      groupIds.map((id) => this.getGroupAggregate(workspaceId, id)),
    );
    return aggregates
      .filter((a): a is GroupAggregate => a !== undefined)
      .sort((a, b) => new Date(b.ranAt).getTime() - new Date(a.ranAt).getTime());
  }

  /**
   * Per-agent rollup for the global dashboard's summary table: latest
   * agent_version + pooled recall/precision/citation_accuracy across ALL of
   * that agent's runs (not just the latest group) + a run_count. Workspace-
   * scoped via the join through `eval_cases`.
   */
  async agentSummaryRows(workspaceId: string): Promise<AgentSummaryRow[]> {
    const rows = await this.db
      .select({
        agentId: t.evalCases.ownerId,
        agentVersion: sql<number>`max(${t.evalRuns.agentVersion})`,
        recall: sql<number | null>`avg(${t.evalRuns.recall})`,
        precision: sql<number | null>`avg(${t.evalRuns.precision})`,
        // AC-7: POOLED across ALL the agent's runs — sum(kept)/(sum(kept)+sum(dropped)),
        // empty pool → 1 (matches the group-level formula above).
        citationAccuracy: sql<number>`case when coalesce(sum(${t.evalRuns.kept}),0) + coalesce(sum(${t.evalRuns.dropped}),0) = 0 then 1 else coalesce(sum(${t.evalRuns.kept}),0)::float8 / (coalesce(sum(${t.evalRuns.kept}),0) + coalesce(sum(${t.evalRuns.dropped}),0)) end`.mapWith(Number),
        runCount: sql<number>`count(distinct ${t.evalRuns.groupId})`.mapWith(Number),
      })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.ownerKind, 'agent')))
      .groupBy(t.evalCases.ownerId);

    return rows.map((r) => ({
      agentId: r.agentId,
      agentVersion: r.agentVersion,
      recall: r.recall ?? 1,
      precision: r.precision ?? 1,
      citationAccuracy: r.citationAccuracy ?? 1,
      runCount: r.runCount,
    }));
  }

  // ---- cross-module reads (own workspace-scoped SQL; no sibling repo import) --

  /** Resolve a finding → its review's agent_id + pr_id, workspace-scoped via the
   *  PR. Returns undefined if the finding doesn't exist or isn't in this
   *  workspace (never leaks a cross-tenant finding). */
  async findingContext(workspaceId: string, findingId: string): Promise<FindingContext | undefined> {
    const [row] = await this.db
      .select({
        finding: t.findings,
        reviewAgentId: t.reviews.agentId,
        prId: t.reviews.prId,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(eq(t.findings.id, findingId), eq(t.reviews.workspaceId, workspaceId)));
    if (!row) return undefined;
    return { finding: row.finding, reviewAgentId: row.reviewAgentId, prId: row.prId };
  }

  /** The PR row (for diff capture: pr_files patches), workspace-scoped. */
  async getPull(workspaceId: string, prId: string): Promise<PullRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    return row;
  }

  /** Persisted patches for a PR — the raw material `service.ts` assembles into
   *  a unified-diff string for the case's `input_diff`. */
  async getPrFiles(prId: string): Promise<(typeof t.prFiles.$inferSelect)[]> {
    return this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
  }
}
