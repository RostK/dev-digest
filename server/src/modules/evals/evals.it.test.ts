import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
