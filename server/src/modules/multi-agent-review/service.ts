import type { Container } from '../../platform/container.js';
import type {
  AgentEstimate,
  MultiAgentEstimate,
  MultiAgentRun,
  MultiAgentRunListItem,
} from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { runCostUsd } from '../../adapters/llm/pricing.js';
import type { AgentRow } from '../../db/rows.js';
import { MultiAgentReviewRepository, type LinkedAgentRun, type MultiRunRow } from './repository.js';
import { buildConflicts, calcAgentEstimate, calcMultiAgentEstimate, mapAgentColumn } from './helpers.js';

/**
 * Multi-Agent Review service. Orchestrates the concurrent fan-out over the
 * EXISTING single-agent review path (never touches run-executor/engine
 * internals), composes the `MultiAgentRun` read contract from persisted rows
 * (columns + the deterministic conflict builder), and serves pre-run
 * estimates. All Drizzle lives in `./repository.ts`; cross-module reads reuse
 * `container.reviewRepo` / `container.agentsRepo` / `container.reviewService`
 * — never a sibling module's internals.
 */
export class MultiAgentReviewService {
  private repo: MultiAgentReviewRepository;

  constructor(private container: Container) {
    this.repo = new MultiAgentReviewRepository(container.db);
  }

  // ===========================================================================
  // Start a multi-run (AC-2/AC-7)
  // ===========================================================================

  /**
   * Resolve the PR + the selected agents INSIDE the caller's workspace,
   * server-compute (never trust a client-sent number) the pre-run estimate for
   * exactly that set, persist the `multi_agent_runs` row, then fan out ONE
   * single-agent `container.reviewService.runReview` call PER agent under
   * `Promise.all`.
   *
   * `runReview` is fire-and-forget: each call creates its agent_run row and
   * returns immediately, executing the actual review in the background
   * (reviews/service.ts:117). So N separate single-agent calls — not one call
   * with all N agents — are what makes the executions genuinely CONCURRENT:
   * `ReviewRunExecutor.executeRuns` loops its `jobs` array SEQUENTIALLY
   * (run-executor.ts:128), so passing all N agents to a single `runReview`
   * call would run them one after another instead. Per-agent failure
   * isolation is inherited from the executor (run-executor.ts:146..154).
   */
  async start(workspaceId: string, prId: string, agentIds: string[]): Promise<{ id: string }> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const agents = await this.resolveAgents(workspaceId, agentIds);
    const estimate = await this.estimateForAgents(workspaceId, agentIds);
    const multiRun = await this.repo.createMultiRun(workspaceId, prId, estimate);

    // Warm the PR's intent ONCE before fanning out. Each fanned-out review runs
    // its OWN `executeRuns`, which calls `ensureIntent`; on a COLD cache all N
    // miss simultaneously and each recomputes the intent (there is no
    // single-flight dedup), and those competing cold computes serialize the
    // whole fan-out — the agents' review calls then fire seconds apart instead
    // of overlapping, defeating the concurrency AC-7 promises. Computing it here
    // first means every fanned-out run hits the cache (`getIntent`) and the
    // reviews genuinely run in parallel (`total_duration_ms` = max, not sum).
    // Fail-soft: intent is best-effort and must never block a multi-run (mirrors
    // `ensureIntent`'s own catch).
    if (!(await this.container.reviewService.getIntent(workspaceId, prId))) {
      await this.container.reviewService.recomputeIntent(workspaceId, prId).catch(() => undefined);
    }

    // One INDEPENDENT single-agent runReview call per agent — see the trap
    // documented above. Promise.all here waits only for the N calls to return
    // their runId (near-instant); the reviews themselves keep executing in
    // the background after this method resolves.
    const results = await Promise.all(
      agents.map((agent) => this.container.reviewService.runReview(workspaceId, prId, [agent])),
    );
    const runIds = results.flatMap((r) => r.runs.map((run) => run.run_id));
    await this.repo.linkAgentRuns(multiRun.id, runIds);

    return { id: multiRun.id };
  }

  /** Resolve each selected agent id INSIDE the caller's workspace (A01 IDOR —
   *  a cross-workspace agent id must never be reachable from here). */
  private async resolveAgents(workspaceId: string, agentIds: string[]): Promise<AgentRow[]> {
    const agents: AgentRow[] = [];
    for (const id of agentIds) {
      const agent = await this.container.agentsRepo.getById(workspaceId, id);
      if (!agent) throw new NotFoundError(`Agent not found: ${id}`);
      agents.push(agent);
    }
    return agents;
  }

  private async estimateForAgents(workspaceId: string, agentIds: string[]): Promise<MultiAgentEstimate> {
    const perAgent = await Promise.all(
      agentIds.map(async (id) => {
        const history = await this.repo.agentRunHistory(workspaceId, id);
        return calcAgentEstimate(id, history);
      }),
    );
    return calcMultiAgentEstimate(perAgent);
  }

  // ===========================================================================
  // Read (AC-8/AC-9/AC-22)
  // ===========================================================================

  /** Compose the `MultiAgentRun` contract for one multi-run, workspace-scoped
   *  (a cross-workspace id resolves to NotFoundError, AC-8). */
  async getMultiRun(workspaceId: string, id: string): Promise<MultiAgentRun> {
    const multiRun = await this.repo.getMultiRun(workspaceId, id);
    if (!multiRun) throw new NotFoundError('Multi-agent run not found');

    // The PR always exists while its multi-run does (multi_agent_runs.pr_id is
    // an ON DELETE CASCADE FK) — the `pull?.number` fallback is defensive only.
    const pull = await this.container.reviewRepo.getPull(workspaceId, multiRun.prId);

    const linkedRuns = await this.repo.getLinkedAgentRuns(id);
    const columnSources = await this.buildColumnSources(multiRun.prId, linkedRuns);
    const columns = columnSources.map(mapAgentColumn);
    const conflicts = buildConflicts(columnSources);

    const durations = columns.map((c) => c.duration_ms).filter((d): d is number => d != null);
    const costs = columns.map((c) => c.cost_usd).filter((c): c is number => c != null);

    return {
      id: multiRun.id,
      pr_id: multiRun.prId,
      pr_number: pull?.number ?? null,
      ran_at: multiRun.ranAt.toISOString(),
      agent_count: columns.length,
      // The multi-run's total is the MAX (not the sum) of its columns — the
      // agents ran CONCURRENTLY (AC-8). 0 only for the degenerate case of no
      // linked runs with a known duration yet (e.g. all still `running`).
      total_duration_ms: durations.length ? Math.max(...durations) : 0,
      total_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      columns,
      conflicts,
      // Calibration: the pre-run estimate captured at launch, alongside the
      // actual outcome above (AC-22).
      estimate: multiRun.estimate,
    };
  }

  /** A PR's multi-run history, newest first (AC-25). */
  async listForPr(workspaceId: string, prId: string): Promise<MultiAgentRunListItem[]> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const rows = await this.repo.listMultiRunsForPr(workspaceId, prId);
    return Promise.all(rows.map((row) => this.toListItem(row)));
  }

  private async toListItem(row: MultiRunRow): Promise<MultiAgentRunListItem> {
    const linkedRuns = await this.repo.getLinkedAgentRuns(row.id);
    const durations = linkedRuns.map((r) => r.durationMs).filter((d): d is number => d != null);
    const costs = linkedRuns
      .filter((r) => r.status === 'done')
      .map((r) => runCostUsd(r.model, r.tokensIn, r.tokensOut))
      .filter((c): c is number => c != null);
    return {
      id: row.id,
      ran_at: row.ranAt.toISOString(),
      agent_count: linkedRuns.length,
      total_duration_ms: durations.length ? Math.max(...durations) : null,
      total_cost_usd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
    };
  }

  /** Join each linked agent_run with its review (if any) — the raw material
   *  both the column mapper and the conflict builder consume. */
  private async buildColumnSources(prId: string, linkedRuns: LinkedAgentRun[]) {
    if (linkedRuns.length === 0) return [];
    // Every agent_run linked to a multi-run was fanned out for the SAME PR at
    // start() — one shared reviewsForPull read covers every column instead of
    // N per-run queries.
    const reviewRows = await this.container.reviewRepo.reviewsForPull(prId);
    const byRunId = new Map<string, (typeof reviewRows)[number]>();
    for (const row of reviewRows) {
      if (row.review.runId != null) byRunId.set(row.review.runId, row);
    }

    return linkedRuns.map((run) => {
      const matched = byRunId.get(run.id);
      return {
        run,
        agentName: run.agentName,
        review: matched
          ? { verdict: matched.review.verdict, summary: matched.review.summary }
          : undefined,
        findings: matched?.findings ?? [],
      };
    });
  }

  // ===========================================================================
  // Pre-run estimates (AC-5/AC-6) — GET /multi-agent/estimates
  // ===========================================================================

  /** Per-agent estimate for every ENABLED agent in the workspace (the picker's
   *  candidate set); aggregation into a selection's summary happens
   *  CLIENT-side (Q2) — the server only serves per-agent numbers here. */
  async estimates(workspaceId: string): Promise<AgentEstimate[]> {
    const agents = await this.container.agentsRepo.listEnabled(workspaceId);
    return Promise.all(
      agents.map(async (agent) => {
        const history = await this.repo.agentRunHistory(workspaceId, agent.id);
        return calcAgentEstimate(agent.id, history);
      }),
    );
  }
}
