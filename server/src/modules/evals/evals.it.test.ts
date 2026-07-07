import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from '../../../test/helpers/pg.js';
import { loadConfig } from '../../platform/config.js';
import { Container } from '../../platform/container.js';
import { MockLLMProvider } from '../../adapters/mocks.js';
import * as t from '../../db/schema.js';
import type { Review } from '@devdigest/shared';
import { EvalService } from './service.js';
import { EvalRepository } from './repository.js';

/**
 * SPEC-05 T3 — DB-backed integration tests (real Postgres via testcontainers,
 * self-skips without Docker). Constructs a `Container` directly (no Fastify
 * app / routes — this task unit does not own routes.ts) and drives
 * `EvalService` against real `eval_cases`/`eval_runs` rows.
 *
 * Covers AC-1 (accepted finding → must_find case), AC-2 (dismissed finding →
 * must_not_flag case), AC-4/AC-8 (runSet writes one row per case sharing
 * group_id + agent snapshot, engine called exactly once per non-skipped
 * case), AC-16 (a case with an empty/invalid diff is skipped, never sent to
 * the engine; a mixed valid+invalid set still completes the valid ones).
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[evals.it] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** A diff touching src/config.ts line 11 (matches the finding fixtures below). */
const PATCH = '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded secret found.',
  score: 40,
  findings: [
    {
      id: 'f-1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

d('evals module (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'eval-test-ws' }).returning();
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeContainer(structured: unknown = REVIEW_FIXTURE) {
    return new Container(config(), pg.handle.db, {
      llm: { openai: new MockLLMProvider('openai', { structured }) },
    });
  }

  async function seedRepoPrAndReview() {
    const suffix = Math.random().toString(36).slice(2, 8);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: `repo-${suffix}`, fullName: `acme/repo-${suffix}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add config',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'abc123',
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: PATCH,
    });

    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: 'Eval Test Agent',
        provider: 'openai',
        model: 'gpt-4.1',
        systemPrompt: 'You are a reviewer.',
      })
      .returning();

    const [review] = await pg.handle.db
      .insert(t.reviews)
      .values({ workspaceId, prId: pr!.id, agentId: agent!.id, kind: 'review' })
      .returning();

    return { repo: repo!, pr: pr!, agent: agent!, review: review! };
  }

  // ---- AC-1 / AC-2 — createCaseFromFinding ----------------------------------

  it('AC-1: an ACCEPTED finding becomes a must_find case', async () => {
    const container = makeContainer();
    const service = new EvalService(container);
    const { agent, review } = await seedRepoPrAndReview();

    const [finding] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: review.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'A live Stripe key is committed in source.',
        confidence: 0.95,
        acceptedAt: new Date(),
      })
      .returning();

    const created = await service.createCaseFromFinding(workspaceId, finding!.id);

    expect(created.ownerKind).toBe('agent');
    expect(created.ownerId).toBe(agent.id);
    expect(created.inputDiff).toContain('src/config.ts');
    const expected = created.expectedOutput as { kind: string; findings: unknown[] };
    expect(expected.kind).toBe('must_find');
    expect(expected.findings).toHaveLength(1);
    expect(created.workspaceId).toBe(workspaceId);
  });

  it('AC-2: a DISMISSED finding becomes a must_not_flag case', async () => {
    const container = makeContainer();
    const service = new EvalService(container);
    const { review } = await seedRepoPrAndReview();

    const [finding] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: review.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'WARNING',
        category: 'style',
        title: 'False-positive style nit',
        rationale: 'Not actually an issue.',
        confidence: 0.6,
        dismissedAt: new Date(),
      })
      .returning();

    const created = await service.createCaseFromFinding(workspaceId, finding!.id);
    const expected = created.expectedOutput as { kind: string };
    expect(expected.kind).toBe('must_not_flag');
  });

  // ---- AC-4 / AC-8 — runSet -------------------------------------------------

  it('AC-4/AC-8: runSet writes one row per case sharing group_id + agent snapshot, ' +
    'and calls the engine exactly once per case', async () => {
    const mockLlm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = new Container(config(), pg.handle.db, { llm: { openai: mockLlm } });
    const service = new EvalService(container);
    const { agent } = await seedRepoPrAndReview();

    const repo = new EvalRepository(pg.handle.db);
    await repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'case A',
      inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
      expectedOutput: {
        kind: 'must_find',
        findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }],
      },
    });
    await repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'case B',
      inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
      expectedOutput: {
        kind: 'must_not_flag',
        findings: [{ file: 'src/config.ts', start_line: 999, end_line: 999 }],
      },
    });

    const structuredCallsBefore = mockLlm.calls.filter((c) => c.method === 'completeStructured').length;
    const result = await service.runSet(workspaceId, agent.id);
    const structuredCallsAfter = mockLlm.calls.filter((c) => c.method === 'completeStructured').length;

    expect(result.cases_run).toBe(2);
    expect(result.cases_skipped).toBe(0);
    // AC-8 — exactly one engine call per non-skipped case.
    expect(structuredCallsAfter - structuredCallsBefore).toBe(2);

    const groupRuns = await repo.getGroup(workspaceId, result.group_id);
    expect(groupRuns).toHaveLength(2);
    for (const run of groupRuns) {
      expect(run.groupId).toBe(result.group_id);
      expect(run.agentVersion).toBe(agent.version);
      expect(run.systemPrompt).toBe(agent.systemPrompt);
    }
  });

  // ---- AC-16 — partial-failure skip ----------------------------------------

  it('AC-16: skips a case with an empty input_diff, never calling the engine for it, ' +
    'while a valid sibling case in the same set still completes', async () => {
    const mockLlm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = new Container(config(), pg.handle.db, { llm: { openai: mockLlm } });
    const service = new EvalService(container);
    const { agent } = await seedRepoPrAndReview();

    const repo = new EvalRepository(pg.handle.db);
    // Invalid: empty diff.
    await repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'empty-diff case',
      inputDiff: '',
      expectedOutput: {
        kind: 'must_find',
        findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }],
      },
    });
    // Valid.
    await repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'valid case',
      inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
      expectedOutput: {
        kind: 'must_find',
        findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }],
      },
    });

    const structuredCallsBefore = mockLlm.calls.filter((c) => c.method === 'completeStructured').length;
    const result = await service.runSet(workspaceId, agent.id);
    const structuredCallsAfter = mockLlm.calls.filter((c) => c.method === 'completeStructured').length;

    expect(result.cases_run).toBe(1);
    expect(result.cases_skipped).toBe(1);
    // Exactly one engine call — the skipped case never reached reviewPullRequest.
    expect(structuredCallsAfter - structuredCallsBefore).toBe(1);

    const skipped = result.outcomes.find((o) => o.skipped);
    expect(skipped).toBeDefined();
    if (skipped?.skipped) {
      expect(skipped.reason).toMatch(/empty|missing/i);
    }
  });

  it('AC-16: skips a case whose expected_output fails the EvalExpectation schema', async () => {
    const mockLlm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = new Container(config(), pg.handle.db, { llm: { openai: mockLlm } });
    const service = new EvalService(container);
    const { agent } = await seedRepoPrAndReview();

    const repo = new EvalRepository(pg.handle.db);
    // Write a malformed expected_output directly (bypassing the typed insert)
    // to simulate a legacy/off-contract row.
    await pg.handle.db.insert(t.evalCases).values({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'malformed case',
      inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
      expectedOutput: { kind: 'not_a_real_kind', findings: 'not-an-array' },
    });

    const result = await service.runSet(workspaceId, agent.id);
    expect(result.cases_run).toBe(0);
    expect(result.cases_skipped).toBe(1);
    const skipped = result.outcomes.find((o) => o.skipped);
    if (skipped?.skipped) {
      expect(skipped.reason).toMatch(/schema/i);
    }
  });

  // ---- T4 — AC-10 dashboard, AC-11 compare, AC-18 global read --------------

  it('AC-10: the dashboard reflects metrics after 2 runs (current + delta + trend + recent_runs), ' +
    'and the read path makes ZERO container.llm calls', async () => {
    const mockLlm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container = new Container(config(), pg.handle.db, { llm: { openai: mockLlm } });
    const service = new EvalService(container);
    const { agent } = await seedRepoPrAndReview();

    const repo = new EvalRepository(pg.handle.db);
    await repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'dashboard case',
      inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
      expectedOutput: {
        kind: 'must_find',
        findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }],
      },
    });

    // Run 1 — the model finds it (good run).
    await service.runSet(workspaceId, agent.id);

    // Run 2 — a "broken prompt" run that misses the finding entirely
    // (recall/precision regress), so the dashboard has a real delta to show.
    const brokenLlm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'Looks fine.', score: 100, findings: [] },
    });
    const brokenContainer = new Container(config(), pg.handle.db, { llm: { openai: brokenLlm } });
    const brokenService = new EvalService(brokenContainer);
    await brokenService.runSet(workspaceId, agent.id);

    // Zero-LLM guard on the READ path: spy on the read-side container's own
    // llm resolver — dashboardForAgent must never call it.
    const readContainer = new Container(config(), pg.handle.db, {});
    let llmCalls = 0;
    const originalLlm = readContainer.llm.bind(readContainer);
    readContainer.llm = (async (...args: Parameters<typeof originalLlm>) => {
      llmCalls++;
      return originalLlm(...args);
    }) as typeof readContainer.llm;
    const readService = new EvalService(readContainer);

    const dashboard = await readService.dashboardForAgent(workspaceId, agent.id);

    expect(llmCalls).toBe(0);
    expect(dashboard.owner_kind).toBe('agent');
    expect(dashboard.owner_id).toBe(agent.id);
    expect(dashboard.cases_total).toBe(1);
    // Latest run (broken) found nothing → current recall/precision reflect that.
    expect(dashboard.current.recall).toBe(0);
    // Delta vs the prior (good) run is negative (a regression).
    expect(dashboard.delta.recall).toBeLessThan(0);
    expect(dashboard.trend.length).toBe(2);
    expect(dashboard.recent_runs.length).toBeGreaterThan(0);
    // A recall drop > the alert threshold should surface a warning.
    expect(dashboard.alert).toMatch(/recall/i);
  });

  it('AC-11: compare returns both group aggregates + per-metric deltas + BOTH agent_version ' +
    'and BOTH system_prompt snapshots', async () => {
    const goodLlm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const goodContainer = new Container(config(), pg.handle.db, { llm: { openai: goodLlm } });
    const goodService = new EvalService(goodContainer);
    const { agent } = await seedRepoPrAndReview();

    const repo = new EvalRepository(pg.handle.db);
    await repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'compare case',
      inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
      expectedOutput: {
        kind: 'must_find',
        findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }],
      },
    });

    const runA = await goodService.runSet(workspaceId, agent.id);

    // Bump the agent's system prompt (version bump) before the second run, so
    // the two groups carry genuinely different agent_version + system_prompt
    // snapshots.
    await goodContainer.agentsRepo.update(workspaceId, agent.id, {
      systemPrompt: 'You are a STRICTER reviewer. Flag every secret.',
    });

    const brokenLlm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'Looks fine.', score: 100, findings: [] },
    });
    const brokenContainer = new Container(config(), pg.handle.db, { llm: { openai: brokenLlm } });
    const brokenService = new EvalService(brokenContainer);
    const runB = await brokenService.runSet(workspaceId, agent.id);

    const compareService = new EvalService(new Container(config(), pg.handle.db, {}));
    const compare = await compareService.compareGroups(workspaceId, runA.group_id, runB.group_id);

    expect(compare.a.group_id).toBe(runA.group_id);
    expect(compare.b.group_id).toBe(runB.group_id);
    expect(compare.a.agent_version).toBe(runA.agent_version);
    expect(compare.b.agent_version).toBe(runB.agent_version);
    expect(compare.b.agent_version).toBeGreaterThan(compare.a.agent_version);
    expect(compare.delta.recall).toBeLessThan(0);
    expect(compare.a_system_prompt).toBe(agent.systemPrompt);
    expect(compare.b_system_prompt).toBe('You are a STRICTER reviewer. Flag every secret.');
    expect(compare.a_system_prompt).not.toBe(compare.b_system_prompt);
  });

  it('AC-7: getGroupAggregate POOLS citation_accuracy (sum(kept)/sum(kept+dropped)), ' +
    'NOT a mean of per-case ratios', async () => {
    const { agent } = await seedRepoPrAndReview();
    const repo = new EvalRepository(pg.handle.db);
    const c = await repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'pooled-citation case',
      inputDiff: 'x',
      expectedOutput: { kind: 'must_find', findings: [{ file: 'a.ts', start_line: 1, end_line: 1 }] },
    });

    const groupId = randomUUID();
    const base = {
      caseId: c.id,
      pass: true,
      recall: 1,
      precision: 1,
      durationMs: 1,
      costUsd: 0,
      groupId,
      agentVersion: 1,
      systemPrompt: 'p',
    };
    // Two cases with UNEQUAL grounding denominators so pooled ≠ avg-of-ratios:
    //   case 1: kept 1 / dropped 0 → per-case ratio 1.00
    //   case 2: kept 1 / dropped 3 → per-case ratio 0.25
    await repo.insertRun({ ...base, citationAccuracy: 1, kept: 1, dropped: 0 });
    await repo.insertRun({ ...base, citationAccuracy: 0.25, kept: 1, dropped: 3 });

    const agg = await repo.getGroupAggregate(workspaceId, groupId);
    // Pooled: (1+1) / ((1+1)+(0+3)) = 2/5 = 0.4. A mean of the ratios would be 0.625.
    expect(agg?.citationAccuracy).toBeCloseTo(0.4, 5);
    expect(agg?.citationAccuracy).not.toBeCloseTo(0.625, 3);
  });

  it('runSet uses the CLIENT-supplied run id as the group id, and runProgress ' +
    'reports done/total for that group', async () => {
    const container = makeContainer();
    const service = new EvalService(container);
    const { agent } = await seedRepoPrAndReview();

    const repo = new EvalRepository(pg.handle.db);
    for (const n of [1, 2, 3]) {
      await repo.createCase({
        workspaceId,
        ownerKind: 'agent',
        ownerId: agent.id,
        name: `progress case ${n}`,
        inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
        expectedOutput: { kind: 'must_find', findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }] },
      });
    }

    const runId = randomUUID();
    const result = await service.runSet(workspaceId, agent.id, runId);
    // The provided id IS the group id (so the client's progress poll addresses it).
    expect(result.group_id).toBe(runId);
    expect(result.cases_run).toBe(3);

    // All 3 cases ran under bounded concurrency and persisted; progress is 3/3.
    const progress = await service.runProgress(workspaceId, agent.id, runId);
    expect(progress).toEqual({ done: 3, total: 3 });

    // A foreign/unknown group id resolves to done 0 (never leaks progress).
    const none = await service.runProgress(workspaceId, agent.id, randomUUID());
    expect(none.done).toBe(0);
  });

  it('AC-18: the global dashboard reads recent runs + a per-agent summary rollup ' +
    'across every agent, with ZERO container.llm calls', async () => {
    const mockLlm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const container2 = new Container(config(), pg.handle.db, { llm: { openai: mockLlm } });
    const service = new EvalService(container2);
    const { agent } = await seedRepoPrAndReview();

    const repo = new EvalRepository(pg.handle.db);
    await repo.createCase({
      workspaceId,
      ownerKind: 'agent',
      ownerId: agent.id,
      name: 'global case',
      inputDiff: `diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n${PATCH}`,
      expectedOutput: {
        kind: 'must_find',
        findings: [{ file: 'src/config.ts', start_line: 11, end_line: 11 }],
      },
    });
    await service.runSet(workspaceId, agent.id);

    const readContainer = new Container(config(), pg.handle.db, {});
    let llmCalls = 0;
    const originalLlm = readContainer.llm.bind(readContainer);
    readContainer.llm = (async (...args: Parameters<typeof originalLlm>) => {
      llmCalls++;
      return originalLlm(...args);
    }) as typeof readContainer.llm;
    const readService = new EvalService(readContainer);

    const global = await readService.globalDashboard(workspaceId);

    expect(llmCalls).toBe(0);
    expect(global.recent_runs.length).toBeGreaterThan(0);
    expect(global.recent_runs.some((r) => r.agent_version === agent.version)).toBe(true);
    const row = global.summary_rows.find((r) => r.agent_id === agent.id);
    expect(row).toBeDefined();
    expect(row?.agent_name).toBe(agent.name);
    expect(row?.run_count).toBeGreaterThanOrEqual(1);
  });

  it('cross-tenant: createCaseFromFinding 404s when the finding is in a different workspace', async () => {
    const container = makeContainer();
    const service = new EvalService(container);
    const { review } = await seedRepoPrAndReview();

    const [finding] = await pg.handle.db
      .insert(t.findings)
      .values({
        reviewId: review.id,
        file: 'src/config.ts',
        startLine: 11,
        endLine: 11,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        rationale: 'A live Stripe key is committed in source.',
        confidence: 0.95,
        acceptedAt: new Date(),
      })
      .returning();

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-ws' }).returning();
    await expect(service.createCaseFromFinding(otherWs!.id, finding!.id)).rejects.toThrow();

    // Sanity: cleanup isn't required (each test seeds fresh rows), but confirm
    // the finding itself still resolves in its OWN workspace.
    const ok = await service.createCaseFromFinding(workspaceId, finding!.id);
    expect(ok).toBeDefined();
  });
});
