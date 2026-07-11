import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  CompletionRequest,
  CompletionResult,
  LLMProvider,
  ModelInfo,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { MultiAgentRun } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * SPEC-06 T2 — DB-backed multi-agent-review module: the concurrent fan-out
 * (AC-7), the composed `MultiAgentRun` read + workspace scoping (AC-8), a
 * failed lane's null score + retrievable trace (AC-11), the persisted
 * estimate alongside the actual outcome (AC-22), and multi-run history
 * (AC-25). Self-skips without Docker (Testcontainers Postgres); mirrors
 * `reviews.it.test.ts`'s setup + `waitForPrRuns` polling helper.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** A Review fixture with one valid (grounded) finding. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      suggestion: 'Move the key to an environment variable.',
      confidence: 0.95,
      kind: 'finding',
    },
  ],
};

/**
 * Delays `completeStructured` by `delayMs` before delegating to `inner`. Two
 * agents sharing ONE instance of this provider each independently wait
 * `delayMs` — if they run CONCURRENTLY, both finish in ~`delayMs` wall-clock;
 * if the service had (wrongly) fanned them out through run-executor's
 * SEQUENTIAL loop (`run-executor.ts:128`) instead of N separate `runReview`
 * calls, they would cost ~2×`delayMs`. This is the concurrency proof for AC-7.
 */
class DelayedLLMProvider implements LLMProvider {
  readonly id: LLMProvider['id'];
  /** [start,end] wall-clock window of every delayed `completeStructured` call.
   *  Two overlapping windows prove the calls ran CONCURRENTLY (the AC-7 proof) —
   *  a boolean property that, unlike absolute wall-clock, never flakes under
   *  machine load. */
  readonly windows: Array<{ start: number; end: number }> = [];
  constructor(
    private inner: LLMProvider,
    private delayMs: number,
  ) {
    this.id = inner.id;
  }
  listModels(): Promise<ModelInfo[]> {
    return this.inner.listModels();
  }
  complete(req: CompletionRequest): Promise<CompletionResult> {
    return this.inner.complete(req);
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const start = Date.now();
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    try {
      return await this.inner.completeStructured(req);
    } finally {
      this.windows.push({ start, end: Date.now() });
    }
  }
  embed(texts: string[]): Promise<number[][]> {
    return this.inner.embed(texts);
  }
}

/** Always throws — deterministically fails whichever agent is wired to it
 *  (failure-isolation proof, AC-7/AC-11), without relying on real secrets. */
class ThrowingLLMProvider implements LLMProvider {
  readonly id: LLMProvider['id'];
  constructor(id: LLMProvider['id']) {
    this.id = id;
  }
  async listModels(): Promise<ModelInfo[]> {
    return [];
  }
  async complete(): Promise<CompletionResult> {
    throw new Error('forced failure');
  }
  async completeStructured<T>(): Promise<StructuredResult<T>> {
    throw new Error('forced agent failure');
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(() => []);
  }
}

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `multi-agent-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 501,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

d('Multi-Agent Review (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm,
      },
    });
  }

  async function createAgent(
    app: Awaited<ReturnType<typeof buildApp>>,
    name: string,
    provider: 'openai' | 'anthropic',
  ): Promise<{ id: string }> {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name,
        provider,
        model: provider === 'anthropic' ? 'claude-x' : 'gpt-4.1',
        system_prompt: `You are the ${name} reviewer.`,
      },
    });
    return res.json();
  }

  it(
    'AC-7: fans out 3 agents CONCURRENTLY (wall-clock ≈ one agent, not N×), links them under ONE ' +
      'multi_agent_runs row, and isolates a single forced failure (2 done, 1 failed)',
    async () => {
      const DELAY_MS = 700;
      const openai = new DelayedLLMProvider(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }), DELAY_MS);
      const anthropic = new ThrowingLLMProvider('anthropic');
      const app = await appWith({ openai, anthropic });
      const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

      const agentA = await createAgent(app, 'Security', 'openai');
      const agentB = await createAgent(app, 'Performance', 'openai');
      const agentC = await createAgent(app, 'Flaky', 'anthropic');

      // Warm the PR's intent BEFORE timing the fan-out. Intent is one-time
      // shared pre-work (each background run's `ensureIntent` load-or-computes
      // it once and caches it) — NOT part of the per-agent review this AC times.
      // `service.start` also warms it up front on a cold PR so the fanned-out
      // runs don't each recompute it concurrently and serialize the fan-out; we
      // pre-seed here so the wall-clock below isolates the REVIEW concurrency
      // (and, in this mock harness, avoids the intent-classifier retrying
      // against a Review-shaped mock fixture — a test artifact, not real cost).
      await pg.handle.db.insert(t.prIntent).values({ prId: pr.id, intent: 'rate limiting' });

      const t0 = Date.now();
      const startRes = await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/multi-agent-run`,
        payload: { agent_ids: [agentA.id, agentB.id, agentC.id] },
      });
      expect(startRes.statusCode).toBe(200);
      const { id: multiRunId } = startRes.json();
      expect(multiRunId).toBeTruthy();

      const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 3 });
      const elapsedMs = Date.now() - t0;
      expect(runs).toHaveLength(3);

      // Concurrency proof (load-independent): agents A and B share ONE delayed
      // provider, so each review's `completeStructured` records a [start,end]
      // window. A sequential fan-out — the run-executor.ts:128 trap (all N
      // agents in a SINGLE runReview call), OR each fanned-out run recomputing
      // intent on a cold cache before its review — makes the two windows
      // DISJOINT (A finishes before B starts). Genuine concurrency makes them
      // OVERLAP. We assert overlap rather than an absolute wall-clock bound so
      // the proof never flakes under CPU contention. (C fails near-instantly on
      // the throwing provider and records no window.)
      expect(openai.windows.length).toBeGreaterThanOrEqual(2);
      const [w1, w2] = [...openai.windows].sort((a, b) => a.start - b.start);
      expect(w2!.start).toBeLessThan(w1!.end);
      // Sanity: the whole fan-out stays far under a fully-sequential cost.
      expect(elapsedMs).toBeLessThan(DELAY_MS * 4);

      // ONE multi_agent_runs row, linked to exactly these 3 agent_runs.
      const multiRunRows = await pg.handle.db
        .select()
        .from(t.multiAgentRuns)
        .where(eq(t.multiAgentRuns.id, multiRunId));
      expect(multiRunRows).toHaveLength(1);

      const linked = await pg.handle.db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.multiAgentRunId, multiRunId));
      expect(linked).toHaveLength(3);

      // Failure isolation: one agent's failure never sinks its siblings.
      const byStatus = linked.reduce<Record<string, number>>((acc, r) => {
        const key = r.status ?? 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});
      expect(byStatus.done).toBe(2);
      expect(byStatus.failed).toBe(1);

      await app.close();
    },
  );

  it('AC-8: composes a valid MultiAgentRun (total_duration_ms = max of columns); a cross-workspace id 404s (A01 IDOR)', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith({ openai: llm });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agentA = await createAgent(app, 'Security', 'openai');
    const agentB = await createAgent(app, 'Performance', 'openai');

    const startRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [agentA.id, agentB.id] },
    });
    const { id: multiRunId } = startRes.json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const getRes = await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` });
    expect(getRes.statusCode).toBe(200);
    const parsed = MultiAgentRun.parse(getRes.json());
    expect(parsed.id).toBe(multiRunId);
    expect(parsed.agent_count).toBe(2);
    expect(parsed.columns).toHaveLength(2);
    const maxDuration = Math.max(...parsed.columns.map((c) => c.duration_ms ?? 0));
    expect(parsed.total_duration_ms).toBe(maxDuration);

    // A multi-run belonging to ANOTHER workspace must 404 through this app's
    // (default-workspace) context — never read across a tenant boundary.
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${Date.now()}` })
      .returning();
    const [otherPr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: otherWs!.id,
        repoId: pr.repoId,
        number: 999,
        title: 'Other workspace PR',
        author: 'someone',
        branch: 'x',
        base: 'main',
        headSha: 'ffffffff',
      })
      .returning();
    const [otherMultiRun] = await pg.handle.db
      .insert(t.multiAgentRuns)
      .values({ workspaceId: otherWs!.id, prId: otherPr!.id })
      .returning();

    const crossRes = await app.inject({ method: 'GET', url: `/multi-agent-runs/${otherMultiRun!.id}` });
    expect(crossRes.statusCode).toBe(404);

    await app.close();
  });

  it('AC-11: a failed lane has a null score, and its failure trace stays retrievable while its sibling completes', async () => {
    const openai = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const anthropic = new ThrowingLLMProvider('anthropic');
    const app = await appWith({ openai, anthropic });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const good = await createAgent(app, 'Security', 'openai');
    const bad = await createAgent(app, 'Flaky', 'anthropic');

    const startRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [good.id, bad.id] },
    });
    const { id: multiRunId } = startRes.json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const body = MultiAgentRun.parse(
      (await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` })).json(),
    );
    const failedColumn = body.columns.find((c) => c.agent_id === bad.id);
    const doneColumn = body.columns.find((c) => c.agent_id === good.id);
    expect(failedColumn?.status).toBe('failed');
    expect(failedColumn?.score).toBeNull();
    expect(doneColumn?.status).toBe('done');

    // The failure's own run trace is still retrievable (persisted on failure,
    // run-executor.ts:353-376).
    const traceRes = await app.inject({ method: 'GET', url: `/runs/${failedColumn!.run_id}/trace` });
    expect(traceRes.statusCode).toBe(200);
    const trace = traceRes.json();
    expect(trace.log.length).toBeGreaterThan(0);

    await app.close();
  });

  it('AC-22: the pre-run estimate is persisted and exposed alongside the run\'s actual duration/cost', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith({ openai: llm });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    // Brand-new agents — no prior agent_runs — so the SERVER-computed pre-run
    // estimate has no history yet (AC-6): null per-agent numbers, partial summary.
    const agentA = await createAgent(app, 'Security', 'openai');
    const agentB = await createAgent(app, 'Performance', 'openai');

    const startRes = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [agentA.id, agentB.id] },
    });
    const { id: multiRunId } = startRes.json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const body = MultiAgentRun.parse(
      (await app.inject({ method: 'GET', url: `/multi-agent-runs/${multiRunId}` })).json(),
    );

    // Calibration: BOTH the captured pre-run estimate AND the actual outcome
    // are present on the same row.
    expect(body.estimate).toBeTruthy();
    expect(body.estimate!.agents).toHaveLength(2);
    expect(body.estimate!.summary.partial).toBe(true); // neither agent had prior history
    expect(body.estimate!.agents.every((a) => a.has_history === false)).toBe(true);

    // The ACTUAL outcome, derived from the completed runs — never fabricated.
    expect(body.total_duration_ms).toBeGreaterThan(0);
    expect(body.total_cost_usd).not.toBeNull();
    for (const column of body.columns) {
      expect(column.cost_usd).not.toBeNull();
      expect(column.duration_ms).not.toBeNull();
    }

    await app.close();
  });

  it('AC-25: re-running the same PR creates a NEW row (distinct id) without mutating the prior one', async () => {
    const llm = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await appWith({ openai: llm });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);
    const agent = await createAgent(app, 'Security', 'openai');

    const first = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [agent.id] },
    });
    const firstId = first.json().id as string;
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    const firstBefore = MultiAgentRun.parse(
      (await app.inject({ method: 'GET', url: `/multi-agent-runs/${firstId}` })).json(),
    );

    const second = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/multi-agent-run`,
      payload: { agent_ids: [agent.id] },
    });
    const secondId = second.json().id as string;
    expect(secondId).not.toBe(firstId);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const history: { id: string }[] = (
      await app.inject({ method: 'GET', url: `/pulls/${pr.id}/multi-agent-runs` })
    ).json();
    expect(history).toHaveLength(2);
    expect(new Set(history.map((h) => h.id))).toEqual(new Set([firstId, secondId]));
    // Newest first.
    expect(history[0]!.id).toBe(secondId);

    const firstAfter = MultiAgentRun.parse(
      (await app.inject({ method: 'GET', url: `/multi-agent-runs/${firstId}` })).json(),
    );
    expect(firstAfter.ran_at).toBe(firstBefore.ran_at);
    // Still linked to only ITS OWN one run — the second launch never joined it.
    expect(firstAfter.columns).toHaveLength(1);

    await app.close();
  });
});
