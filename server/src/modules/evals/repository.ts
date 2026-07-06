import { and, desc, eq } from 'drizzle-orm';
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
