import { randomUUID } from 'node:crypto';
import type { EvalExpectation } from '@devdigest/shared';
import { EvalExpectation as EvalExpectationSchema } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { EVAL_REVIEW_STRATEGY } from './constants.js';
import { buildDiffFromPrFiles, caseNameFromFinding, expectationFromFinding, parseCaseDiff } from './helpers.js';
import { EvalRepository, type EvalCaseRow, type EvalRunRow } from './repository.js';
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
   */
  async createCaseFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseRow> {
    const ctx = await this.repo.findingContext(workspaceId, findingId);
    if (!ctx) throw new NotFoundError('Finding not found');
    if (!ctx.reviewAgentId) {
      throw new NotFoundError('Finding has no owning agent (summary-only review)');
    }

    const files = await this.repo.getPrFiles(ctx.prId);
    const inputDiff = buildDiffFromPrFiles(files.map((f) => ({ path: f.path, patch: f.patch })));

    const expectedOutput: EvalExpectation = expectationFromFinding(ctx.finding);

    return this.repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: ctx.reviewAgentId,
      name: caseNameFromFinding(ctx.finding),
      inputDiff,
      expectedOutput,
      notes: `Derived from finding ${ctx.finding.id} (PR ${ctx.prId}).`,
    });
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
  async runSet(workspaceId: string, agentId: string): Promise<RunSetResult> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    // Snapshot — captured ONCE, before the loop. Every row this call writes
    // carries THIS system_prompt/version, never a value read mid-loop.
    const snapshot = {
      systemPrompt: agent.systemPrompt,
      version: agent.version,
      model: agent.model,
      strategy: agent.strategy ?? EVAL_REVIEW_STRATEGY,
    };

    const llm = await this.container.llm(agent.provider);
    const skillBodies = await this.container.agentsRepo.enabledSkillBodies(agentId);

    const groupId = randomUUID();
    const cases = await this.repo.getExpectedCasesForAgent(workspaceId, agentId);

    const outcomes: CaseRunOutcome[] = [];
    const caseResults: CaseScoreResult[] = [];

    for (const c of cases) {
      // AC-16 — never send an empty/missing diff to the engine.
      if (!c.inputDiff || c.inputDiff.trim().length === 0) {
        outcomes.push({ caseId: c.id, skipped: true, reason: 'empty or missing input_diff' });
        continue;
      }

      const expectedParsed = EvalExpectationSchema.safeParse(c.expectedOutput);
      if (!expectedParsed.success) {
        outcomes.push({ caseId: c.id, skipped: true, reason: 'expected_output failed EvalExpectation schema' });
        continue;
      }
      const expectation = expectedParsed.data;

      const diff = parseCaseDiff(c.inputDiff);
      if (diff.files.length === 0) {
        outcomes.push({ caseId: c.id, skipped: true, reason: 'input_diff parsed to zero files' });
        continue;
      }

      const start = Date.now();
      const outcome = await reviewPullRequest({
        systemPrompt: snapshot.systemPrompt,
        model: snapshot.model,
        diff,
        llm,
        strategy: snapshot.strategy,
        ...(skillBodies.length ? { skills: skillBodies } : {}),
        task: `Eval case "${c.name}"`,
        sessionId: `eval:${agentId}:${c.id}`,
      });
      const durationMs = Date.now() - start;

      const caseScore = scoreCase({
        expectation,
        produced: outcome.review.findings,
        dropped: outcome.dropped.length,
        diff,
      });
      caseResults.push(caseScore);

      const run = await this.repo.insertRun({
        caseId: c.id,
        actualOutput: outcome.review,
        pass: caseScore.pass,
        recall: caseScore.recall_case,
        precision: caseScore.precision_case,
        citationAccuracy:
          caseScore.kept + caseScore.dropped === 0 ? 1 : caseScore.kept / (caseScore.kept + caseScore.dropped),
        durationMs,
        costUsd: outcome.costUsd,
        groupId,
        agentVersion: snapshot.version,
        systemPrompt: snapshot.systemPrompt,
      });
      outcomes.push({ caseId: c.id, skipped: false, run });
    }

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
}
