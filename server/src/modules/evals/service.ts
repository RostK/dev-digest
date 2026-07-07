import { randomUUID } from 'node:crypto';
import type {
  EvalCaseWithState,
  EvalCompare,
  EvalDashboard,
  EvalExpectation,
  EvalRunGroup,
  EvalTrendPoint,
  GlobalEvalDashboard,
} from '@devdigest/shared';
import { EvalExpectation as EvalExpectationSchema } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import {
  DASHBOARD_ALERT_DROP_THRESHOLD,
  DASHBOARD_RECENT_RUNS_LIMIT,
  DASHBOARD_TREND_LIMIT,
  EVAL_CASE_TIMEOUT_MS,
  EVAL_REVIEW_STRATEGY,
  EVAL_RUN_CONCURRENCY,
} from './constants.js';
import {
  buildDiffFromPrFiles,
  caseNameFromFinding,
  expectationFromFinding,
  mapWithConcurrency,
  parseCaseDiff,
  withTimeout,
} from './helpers.js';
import { EvalRepository, type EvalCaseRow, type EvalRunRow, type GroupAggregate } from './repository.js';
import { aggregateRun, scoreCase, type CaseScoreResult } from './scoring.js';

/** One case's outcome inside a `runSet` batch — either scored or skipped
 *  (AC-16: never sent to the engine). */
export type CaseRunOutcome =
  | { caseId: string; skipped: false; run: EvalRunRow }
  | { caseId: string; skipped: true; reason: string };

export interface RunSetResult {
  group_id: string;
  agent_version: number;
  ran_at: string;
  cases_run: number;
  cases_skipped: number;
  outcomes: CaseRunOutcome[];
  aggregate: {
    recall: number;
    precision: number;
    citation_accuracy: number;
    traces_passed: number;
    traces_total: number;
  };
}

/**
 * SPEC-05 T3 — eval case creation + suite execution.
 *
 * `createCaseFromFinding` turns a human review decision (accept/dismiss) into a
 * regression case; `runSet` replays every checkable case for an agent against
 * a SNAPSHOT of that agent's config (read once, before any case runs — a
 * mid-run edit to the live agent must never leak into an in-flight run's
 * persisted rows) and scores the outcome with the committed, pure `scoring.ts`.
 */
export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  /**
   * Build + persist an eval case from a finding (AC-1 accepted → must_find,
   * AC-2 dismissed → must_not_flag). Captures the PR's diff at CASE-CREATION
   * time from the persisted `pr_files` patches — the same synthetic-diff
   * technique `reviews/diff-loader.ts` uses, reconstructed locally so this
   * module never imports the reviews module's repository (server/INSIGHTS.md:47).
   *
   * IDEMPOTENT per finding: a repeat call returns the EXISTING case instead of
   * minting a duplicate. The UI invites repeat clicks (button state is lost on
   * remount, and a mid-interaction list reorder once landed stray clicks here),
   * so the same decision must never become two regression cases. Backstopped
   * at the DB by `eval_cases_finding_uq` — the read-then-insert below has no
   * TOCTOU window because a raced duplicate insert conflicts to `undefined`
   * and we return the winner's row.
   */
  async createCaseFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseRow> {
    const ctx = await this.repo.findingContext(workspaceId, findingId);
    if (!ctx) throw new NotFoundError('Finding not found');
    if (!ctx.reviewAgentId) {
      throw new NotFoundError('Finding has no owning agent (summary-only review)');
    }

    const existing = await this.repo.getCaseByFinding(workspaceId, findingId);
    if (existing) return existing;

    const files = await this.repo.getPrFiles(ctx.prId);
    const inputDiff = buildDiffFromPrFiles(files.map((f) => ({ path: f.path, patch: f.patch })));

    const expectedOutput: EvalExpectation = expectationFromFinding(ctx.finding);

    const created = await this.repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: ctx.reviewAgentId,
      name: caseNameFromFinding(ctx.finding),
      inputDiff,
      expectedOutput,
      notes: `Derived from finding ${ctx.finding.id} (PR ${ctx.prId}).`,
      findingId: ctx.finding.id,
    });
    if (created) return created;

    // Lost a create race — the conflicting insert won; serve its row.
    const winner = await this.repo.getCaseByFinding(workspaceId, findingId);
    if (!winner) throw new NotFoundError('Eval case not found after concurrent creation');
    return winner;
  }

  /**
   * Run every checkable case owned by an agent, ONE `reviewPullRequest` call
   * per non-skipped case (AC-8), against a SNAPSHOT of the agent's config read
   * ONCE here (before any case runs) so a concurrent agent edit mid-run can
   * never leak into this run-group's persisted rows.
   *
   * AC-16: a case with an empty/missing diff, or an `expected_output` that
   * fails `EvalExpectation.safeParse`, is SKIPPED (recorded with a reason) —
   * never sent to the engine. A set mixing invalid + valid cases still
   * completes every valid case.
   */
  async runSet(workspaceId: string, agentId: string, runId?: string): Promise<RunSetResult> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    // Snapshot — captured ONCE, before the loop. Every row this call writes
    // carries THIS system_prompt/version, never a value read mid-loop.
    const snapshot = {
      systemPrompt: agent.systemPrompt,
      version: agent.version,
      model: agent.model,
      // AC-4 + constants.ts: strategy is FORCED to single-pass for every eval
      // run (independent of the agent's own configured strategy) so a case's
      // score stays comparable across runs. Do NOT fall back to agent.strategy.
      strategy: EVAL_REVIEW_STRATEGY,
    };

    const llm = await this.container.llm(agent.provider);
    const skillBodies = await this.container.agentsRepo.enabledSkillBodies(agentId);

    // Reuse the CLIENT-supplied run id (so it can poll progress while this call
    // is in flight) or mint one. This is the shared group_id every row carries.
    const groupId = runId ?? randomUUID();
    const cases = await this.repo.getExpectedCasesForAgent(workspaceId, agentId);

    // Cases run with BOUNDED CONCURRENCY (EVAL_RUN_CONCURRENCY) — the review pass
    // is the slow part and each case is independent, so a large set no longer
    // runs strictly one-at-a-time. `mapWithConcurrency` preserves input order in
    // its result, so the per-case `outcomes` list stays deterministic regardless
    // of completion order. The snapshot/llm/skillBodies captured above are shared
    // read-only across every concurrent case.
    const perCase = await mapWithConcurrency(
      cases,
      EVAL_RUN_CONCURRENCY,
      async (c): Promise<{ outcome: CaseRunOutcome; caseScore: CaseScoreResult | null }> => {
        // AC-16 — never send an empty/missing diff to the engine.
        if (!c.inputDiff || c.inputDiff.trim().length === 0) {
          return { outcome: { caseId: c.id, skipped: true, reason: 'empty or missing input_diff' }, caseScore: null };
        }

        const expectedParsed = EvalExpectationSchema.safeParse(c.expectedOutput);
        if (!expectedParsed.success) {
          return {
            outcome: { caseId: c.id, skipped: true, reason: 'expected_output failed EvalExpectation schema' },
            caseScore: null,
          };
        }
        const expectation = expectedParsed.data;

        const diff = parseCaseDiff(c.inputDiff);
        if (diff.files.length === 0) {
          return { outcome: { caseId: c.id, skipped: true, reason: 'input_diff parsed to zero files' }, caseScore: null };
        }

        // Fail-soft: a slow/hung/erroring review must NOT abort the whole run
        // (with bounded concurrency a stuck case would otherwise pin a worker and
        // the run would never complete). Bound each review by EVAL_CASE_TIMEOUT_MS
        // and record any timeout/throw as a skipped case (AC-16-style) so the rest
        // of the set still finishes and scores.
        const start = Date.now();
        try {
          const outcome = await withTimeout(
            reviewPullRequest({
              systemPrompt: snapshot.systemPrompt,
              model: snapshot.model,
              diff,
              llm,
              strategy: snapshot.strategy,
              ...(skillBodies.length ? { skills: skillBodies } : {}),
              task: `Eval case "${c.name}"`,
              sessionId: `eval:${agentId}:${c.id}`,
            }),
            EVAL_CASE_TIMEOUT_MS,
            `eval case "${c.name}" review`,
          );
          const durationMs = Date.now() - start;

          const caseScore = scoreCase({
            expectation,
            produced: outcome.review.findings,
            dropped: outcome.dropped.length,
          });

          const run = await this.repo.insertRun({
            caseId: c.id,
            actualOutput: outcome.review,
            pass: caseScore.pass,
            recall: caseScore.recall_case,
            precision: caseScore.precision_case,
            citationAccuracy:
              caseScore.kept + caseScore.dropped === 0 ? 1 : caseScore.kept / (caseScore.kept + caseScore.dropped),
            kept: caseScore.kept,
            dropped: caseScore.dropped,
            durationMs,
            costUsd: outcome.costUsd,
            groupId,
            agentVersion: snapshot.version,
            systemPrompt: snapshot.systemPrompt,
          });
          return { outcome: { caseId: c.id, skipped: false, run }, caseScore };
        } catch (err) {
          const reason = err instanceof Error ? err.message : 'review failed';
          return { outcome: { caseId: c.id, skipped: true, reason }, caseScore: null };
        }
      },
    );

    const outcomes: CaseRunOutcome[] = perCase.map((p) => p.outcome);
    const caseResults: CaseScoreResult[] = perCase
      .map((p) => p.caseScore)
      .filter((s): s is CaseScoreResult => s !== null);

    const aggregate = aggregateRun(caseResults);

    return {
      group_id: groupId,
      agent_version: snapshot.version,
      ran_at: new Date().toISOString(),
      cases_run: outcomes.filter((o) => !o.skipped).length,
      cases_skipped: outcomes.filter((o) => o.skipped).length,
      outcomes,
      aggregate,
    };
  }

  /**
   * Live progress of an in-flight `runSet`, polled by the UI while the (single,
   * long) `POST /agents/:id/eval-runs` request is pending. `done` = rows already
   * persisted for this group (one per completed case); `total` = the agent's
   * case count. Skipped cases never write a row, so `done` may settle just below
   * `total` — the UI ends the indicator when the run mutation resolves, not when
   * done === total. Workspace-scoped; a foreign group id resolves to done 0.
   */
  async runProgress(
    workspaceId: string,
    agentId: string,
    groupId: string,
  ): Promise<{ done: number; total: number }> {
    const [done, cases] = await Promise.all([
      this.repo.countRunsInGroup(workspaceId, groupId),
      this.repo.getExpectedCasesForAgent(workspaceId, agentId),
    ]);
    return { done, total: cases.length };
  }

  // ===========================================================================
  // T4 — read side: case list, run history, dashboard, compare, global.
  // ===========================================================================

  /**
   * An agent's eval cases enriched with their latest-run state
   * (`last_run_pass`/`actual_count`) for the case-list UI. `expected_count`
   * always comes from the case's OWN `expected_output.findings` (schema-
   * validated — an off-contract row degrades to 0 rather than throwing, same
   * safeParse-at-read-boundary rule as `getBrief`, server/INSIGHTS.md:63).
   */
  async listCasesWithState(workspaceId: string, agentId: string): Promise<EvalCaseWithState[]> {
    const [cases, latestRuns] = await Promise.all([
      this.repo.listCasesForAgent(workspaceId, agentId),
      this.repo.latestRunPerCase(workspaceId, agentId),
    ]);

    return cases.map((c) => this.toCaseWithState(c, latestRuns.get(c.id)));
  }

  /** A single case's state (used right after `createCaseFromFinding` to shape
   *  the route's response — a just-created case has no runs yet, so
   *  `last_run_pass`/`actual_count` are always null/0). */
  async caseWithState(workspaceId: string, caseId: string): Promise<EvalCaseWithState | undefined> {
    const c = await this.repo.getCase(workspaceId, caseId);
    if (!c) return undefined;
    return this.toCaseWithState(c, undefined);
  }

  private toCaseWithState(c: EvalCaseRow, run: EvalRunRow | undefined): EvalCaseWithState {
    const expectedParsed = EvalExpectationSchema.safeParse(c.expectedOutput);
    const expectedOutput: EvalExpectation = expectedParsed.success
      ? expectedParsed.data
      : { kind: 'must_find', findings: [] };

    let actualCount = 0;
    if (run) {
      const actual = run.actualOutput as { findings?: unknown[] } | null;
      actualCount = Array.isArray(actual?.findings) ? actual.findings.length : 0;
    }

    return {
      id: c.id,
      owner_kind: c.ownerKind,
      owner_id: c.ownerId,
      name: c.name,
      input_diff: c.inputDiff ?? '',
      input_files: c.inputFiles,
      input_meta: c.inputMeta,
      expected_output: expectedOutput,
      notes: c.notes,
      last_run_pass: run?.pass ?? null,
      expected_count: expectedOutput.findings.length,
      actual_count: actualCount,
    };
  }

  /** One run-group's aggregate, shaped as `EvalRunGroup` — used right after
   *  `runSet` so the POST response's `cost_usd` reflects the real persisted
   *  sum (`runSet`'s own return type predates T4 and has no cost field). */
  async runGroupById(workspaceId: string, groupId: string): Promise<EvalRunGroup | undefined> {
    const aggregate = await this.repo.getGroupAggregate(workspaceId, groupId);
    return aggregate ? toRunGroup(aggregate) : undefined;
  }

  /** Aggregated run-history rows (one per full eval-suite execution),
   *  most-recent first — the raw feed behind the run-history table AND the
   *  compare-modal's row selection. */
  async listRunGroupsForAgent(workspaceId: string, agentId: string): Promise<EvalRunGroup[]> {
    const groupIds = await this.repo.listGroupIdsForAgent(workspaceId, agentId);
    const aggregates = await Promise.all(
      groupIds.map((id) => this.repo.getGroupAggregate(workspaceId, id)),
    );
    return aggregates
      .filter((a): a is GroupAggregate => a !== undefined)
      .map((a) => toRunGroup(a));
  }

  /**
   * The per-agent dashboard (AC-10): current metrics from the LATEST
   * run-group, delta vs the PRIOR run-group, a trend series over the most
   * recent groups, the raw recent-runs feed, and an alert flag when
   * recall/precision regressed by more than `DASHBOARD_ALERT_DROP_THRESHOLD`
   * vs the prior group. Zero LLM calls — every value here is read off
   * already-persisted `eval_runs` rows.
   */
  async dashboardForAgent(workspaceId: string, agentId: string): Promise<EvalDashboard> {
    const cases = await this.repo.listCasesForAgent(workspaceId, agentId);
    const groupIds = await this.repo.listGroupIdsForAgent(workspaceId, agentId);
    const aggregates = (
      await Promise.all(groupIds.map((id) => this.repo.getGroupAggregate(workspaceId, id)))
    ).filter((a): a is GroupAggregate => a !== undefined);
    // groupIds is already most-recent-first (listGroupIdsForAgent orders by
    // each group's own latest ran_at desc); aggregates preserves that order.

    const current = aggregates[0];
    const prior = aggregates[1];

    const trendGroups = aggregates.slice(0, DASHBOARD_TREND_LIMIT).reverse();
    const trend: EvalTrendPoint[] = trendGroups.map((g) => ({
      ran_at: g.ranAt,
      recall: g.recall,
      precision: g.precision,
      citation_accuracy: g.citationAccuracy,
      pass_rate: g.tracesTotal === 0 ? 1 : g.tracesPassed / g.tracesTotal,
      cost_usd: g.costUsd,
    }));

    const runRows = await this.repo.getRunsForAgent(workspaceId, agentId);
    const nameByCase = new Map(cases.map((c) => [c.id, c.name]));
    const recentRuns = runRows.slice(0, DASHBOARD_RECENT_RUNS_LIMIT).map((r) => ({
      id: r.id,
      case_id: r.caseId,
      case_name: nameByCase.get(r.caseId) ?? null,
      ran_at: r.ranAt.toISOString(),
      actual_output: r.actualOutput,
      pass: r.pass,
      recall: r.recall,
      precision: r.precision,
      citation_accuracy: r.citationAccuracy,
      duration_ms: r.durationMs,
      cost_usd: r.costUsd,
    }));

    const delta = {
      recall: current && prior ? current.recall - prior.recall : 0,
      precision: current && prior ? current.precision - prior.precision : 0,
      citation_accuracy: current && prior ? current.citationAccuracy - prior.citationAccuracy : 0,
    };

    let alert: string | null = null;
    if (current && prior) {
      if (prior.recall - current.recall > DASHBOARD_ALERT_DROP_THRESHOLD) {
        alert = `Recall dropped ${Math.round((prior.recall - current.recall) * 100)}% vs the previous run.`;
      } else if (prior.precision - current.precision > DASHBOARD_ALERT_DROP_THRESHOLD) {
        alert = `Precision dropped ${Math.round((prior.precision - current.precision) * 100)}% vs the previous run.`;
      }
    }

    return {
      owner_kind: 'agent',
      owner_id: agentId,
      cases_total: cases.length,
      current: {
        recall: current?.recall ?? 1,
        precision: current?.precision ?? 1,
        citation_accuracy: current?.citationAccuracy ?? 1,
        traces_passed: current?.tracesPassed ?? 0,
        traces_total: current?.tracesTotal ?? 0,
        cost_usd: current?.costUsd ?? null,
      },
      delta,
      trend,
      recent_runs: recentRuns,
      alert,
    };
  }

  /**
   * Side-by-side comparison of two run groups (AC-11): both group aggregates,
   * per-metric deltas (`b - a`), and BOTH `system_prompt` snapshots so the UI
   * can diff the actual wording change that produced the metric delta.
   */
  async compareGroups(workspaceId: string, groupA: string, groupB: string): Promise<EvalCompare> {
    const [a, b] = await Promise.all([
      this.repo.getGroupAggregate(workspaceId, groupA),
      this.repo.getGroupAggregate(workspaceId, groupB),
    ]);
    if (!a) throw new NotFoundError(`Run group ${groupA} not found`);
    if (!b) throw new NotFoundError(`Run group ${groupB} not found`);

    return {
      a: toRunGroup(a),
      b: toRunGroup(b),
      delta: {
        recall: b.recall - a.recall,
        precision: b.precision - a.precision,
        citation_accuracy: b.citationAccuracy - a.citationAccuracy,
        cost_usd: a.costUsd !== null && b.costUsd !== null ? b.costUsd - a.costUsd : null,
      },
      a_system_prompt: a.systemPrompt,
      b_system_prompt: b.systemPrompt,
    };
  }

  /**
   * Workspace-wide dashboard (AC-18): the latest run-group across every
   * agent (recent_runs) + a per-agent rollup (summary_rows). Agent names are
   * resolved via `container.agentsRepo` (the sanctioned cross-module read —
   * a repository on the Container, not a sibling module's internals).
   */
  async globalDashboard(workspaceId: string): Promise<GlobalEvalDashboard> {
    const [latestGroups, summaries, agents] = await Promise.all([
      this.repo.latestGroupPerAgent(workspaceId),
      this.repo.agentSummaryRows(workspaceId),
      this.container.agentsRepo.list(workspaceId),
    ]);

    const nameById = new Map(agents.map((a) => [a.id, a.name]));

    return {
      recent_runs: latestGroups.map((g) => toRunGroup(g)),
      summary_rows: summaries.map((s) => ({
        agent_id: s.agentId,
        agent_name: nameById.get(s.agentId) ?? 'Unknown agent',
        agent_version: s.agentVersion,
        recall: s.recall,
        precision: s.precision,
        citation_accuracy: s.citationAccuracy,
        run_count: s.runCount,
      })),
    };
  }
}

/** `GroupAggregate` (repository row shape) → `EvalRunGroup` (API contract). */
function toRunGroup(a: GroupAggregate): EvalRunGroup {
  return {
    group_id: a.groupId,
    agent_version: a.agentVersion,
    ran_at: a.ranAt,
    recall: a.recall,
    precision: a.precision,
    citation_accuracy: a.citationAccuracy,
    traces_passed: a.tracesPassed,
    traces_total: a.tracesTotal,
    cost_usd: a.costUsd,
  };
}
