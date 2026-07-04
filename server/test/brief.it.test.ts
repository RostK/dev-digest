import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import type { BlastRadius, Brief, LLMProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { BlastService } from '../src/modules/blast/service.js';

/**
 * DB-backed brief module: persist→cache-read (AC-5), regenerate overwrite
 * (AC-6), POST returns the brief (AC-7), cross-workspace not-found (AC-11),
 * and the one-model-call budget (AC-15). The blast facade is stubbed (its own
 * pipeline is covered by blast.it.test.ts) so this focuses on the brief
 * module's own wiring: assembly → ONE model call → grounding → persistence.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const FULL_MAP: BlastRadius = {
  changed_symbols: [{ name: 'rateLimit', file: 'src/lib/rate.ts', kind: 'function' }],
  downstream: [
    {
      symbol: 'rateLimit',
      callers: [{ name: 'handler', file: 'src/api/public/index.ts', line: 23 }],
      endpoints_affected: ['GET /api/public/items'],
      crons_affected: [],
    },
  ],
  summary: '1 changed symbol with 1 caller across 1 impacted endpoint.',
};

function fakeBlast(map: BlastRadius): BlastService {
  return { blastMapForPr: async () => map } as unknown as BlastService;
}

const MODEL_FIXTURE = {
  what: 'Adds rate limiting to the public API.',
  why: 'Prevents abuse of public endpoints.',
  // Deliberately chosen to DIFFER from what deterministicRiskLevel(FULL_MAP)
  // would compute (FULL_MAP has 1 caller / 1 endpoint → 'medium' by the
  // deterministic thresholds) — proves risk_level is MODEL-sourced, not
  // blast-derived, on the happy path (AC-9).
  risk_level: 'high',
  risks: [
    {
      kind: 'perf',
      title: 'Hot path change',
      explanation: 'The rate limiter sits on every public request.',
      severity: 'medium',
      file_refs: ['src/lib/rate.ts', 'src/made/up/path.ts'], // 2nd is NOT real → dropped
    },
  ],
  review_focus: [
    { path: 'src/api/public/index.ts', line: 23, reason: 'New caller of rateLimit' },
    { path: 'src/invented.ts', line: 1, reason: 'not real' }, // dropped
  ],
};

d('Brief module (DB-backed)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(opts: { name: string; llm?: LLMProvider; blast?: BlastRadius }) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const { workspaceId } = await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: opts.name,
        fullName: `acme/${opts.name}`,
        clonePath: `/mock/clones/acme/${opts.name}`,
      })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rate-limit',
        base: 'main',
        headSha: 'deadbeef',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/lib/rate.ts', additions: 40, deletions: 2 },
    ]);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        blast: fakeBlast(opts.blast ?? FULL_MAP),
        ...(opts.llm ? { llm: { openai: opts.llm } } : {}),
      },
    });
    return { app, prId: pr!.id, repoId: repo!.id, workspaceId };
  }

  it('GET returns null before any generation, with ZERO LLM calls', async () => {
    const complete = vi.fn();
    const completeStructured = vi.fn();
    const spyLlm = { complete, completeStructured } as unknown as LLMProvider;
    const { app, prId } = await setup({ name: 'demo-empty', llm: spyLlm });

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();
    expect(completeStructured).not.toHaveBeenCalled();

    await app.close();
  });

  it('POST generates, persists, and returns the brief; GET then reads the CACHE with the LLM UNCALLED (AC-5, AC-7)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { BriefProposal: MODEL_FIXTURE } });
    const { app, prId } = await setup({ name: 'demo-persist', llm });

    const postRes = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(postRes.statusCode).toBe(200);
    const { brief } = postRes.json() as { brief: Brief };
    expect(brief.what).toBe(MODEL_FIXTURE.what);
    // AC-9: risk_level is the MODEL's value, not deterministicRiskLevel(FULL_MAP)
    // (which would compute 'medium' for this blast — see MODEL_FIXTURE comment).
    expect(brief.risk_level).toBe('high');
    // Grounding drop (AC-3): the invented file_ref / review_focus path is gone.
    expect(brief.risks[0]!.file_refs).toEqual(['src/lib/rate.ts']);
    expect(brief.review_focus).toEqual([
      { path: 'src/api/public/index.ts', line: 23, reason: 'New caller of rateLimit' },
    ]);
    expect(brief.generated_at).toBeTruthy();
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1); // AC-15

    const getRes = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(getRes.statusCode).toBe(200);
    expect((getRes.json() as Brief).what).toBe(MODEL_FIXTURE.what);
    // The cache read must not have spent another model call.
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    await app.close();
  });

  it('stamps head_sha on generate and HIDES the cached brief once the PR head advances (staleness)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { BriefProposal: MODEL_FIXTURE } });
    const { app, prId } = await setup({ name: 'demo-stale', llm });

    const postRes = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const { brief } = postRes.json() as { brief: Brief };
    // Generation pins the brief to the PR's head SHA at that moment (from setup()).
    expect(brief.head_sha).toBe('deadbeef');

    // Head unchanged → the cache still serves the brief.
    const fresh = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect((fresh.json() as Brief | null)?.what).toBe(MODEL_FIXTURE.what);

    // A new commit advances the PR head → the persisted brief no longer matches
    // → GET treats it as stale and returns null (UI falls back to Generate).
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'cafef00dcafef00d' })
      .where(eq(t.pullRequests.id, prId));

    const stale = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(stale.statusCode).toBe(200);
    expect(stale.json()).toBeNull();

    await app.close();
  });

  it('POST regenerate overwrites a prior good brief (AC-6)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { BriefProposal: MODEL_FIXTURE } });
    const { app, prId } = await setup({ name: 'demo-regen', llm });

    const first = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const firstBrief = (first.json() as { brief: Brief }).brief;

    const updatedFixture = { ...MODEL_FIXTURE, what: 'Updated: adds stricter rate limiting.' };
    llm.calls.length = 0;
    (llm as unknown as { opts: { structuredBySchema: Record<string, unknown> } }).opts.structuredBySchema = {
      BriefProposal: updatedFixture,
    };

    const second = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const secondBrief = (second.json() as { brief: Brief }).brief;

    expect(secondBrief.what).toBe('Updated: adds stricter rate limiting.');
    expect(secondBrief.what).not.toBe(firstBrief.what);

    const cached = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect((cached.json() as Brief).what).toBe('Updated: adds stricter rate limiting.');

    await app.close();
  });

  it('falls back to the deterministic brief on a throwing model and does NOT clobber a prior good brief (AC-8, #6/#7 atomic no-clobber)', async () => {
    const goodLlm = new MockLLMProvider('openai', { structuredBySchema: { BriefProposal: MODEL_FIXTURE } });
    const { app, prId } = await setup({ name: 'demo-fallback', llm: goodLlm });

    const first = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    const goodBrief = (first.json() as { brief: Brief }).brief;
    expect(goodBrief.what).toBe(MODEL_FIXTURE.what);

    // Swap in a throwing LLM and regenerate — the degraded generation must
    // NOT overwrite the good brief already persisted above. Persistence now
    // goes through `insertBriefIfAbsent` (INSERT … ON CONFLICT DO NOTHING),
    // which is atomic at the DB — no read-then-write window to race (#7).
    const throwingLlm = {
      complete: async () => {
        throw new Error('no key');
      },
      completeStructured: async () => {
        throw new Error('no key');
      },
    } as unknown as LLMProvider;
    const app2 = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: { blast: fakeBlast(FULL_MAP), llm: { openai: throwingLlm } },
    });
    const second = await app2.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(second.statusCode).toBe(200);
    const fallbackReturn = (second.json() as { brief: Brief }).brief;
    // No-clobber: returns the EXISTING good brief, not a degraded one — the
    // degraded generation's own risk_level (deterministic) never surfaces.
    expect(fallbackReturn.what).toBe(MODEL_FIXTURE.what);
    expect(fallbackReturn.risk_level).toBe('high');

    const cached = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect((cached.json() as Brief).what).toBe(MODEL_FIXTURE.what);

    await app.close();
    await app2.close();
  });

  it('persists the deterministic fallback when NO brief exists yet (AC-8)', async () => {
    const throwingLlm = {
      complete: async () => {
        throw new Error('no key');
      },
      completeStructured: async () => {
        throw new Error('no key');
      },
    } as unknown as LLMProvider;
    const { app, prId } = await setup({ name: 'demo-first-fallback', llm: throwingLlm });

    const res = await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    const brief = (res.json() as { brief: Brief }).brief;
    expect(brief.risks).toEqual([]);
    expect(brief.review_focus).toEqual([]);
    expect(['low', 'medium', 'high']).toContain(brief.risk_level);

    const cached = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect((cached.json() as Brief).what).toBe(brief.what);

    await app.close();
  });

  it('404s GET and POST for a PR outside the workspace (AC-11)', async () => {
    const { app } = await setup({ name: 'demo-404' });
    const missingId = '00000000-0000-0000-0000-000000000000';

    const getRes = await app.inject({ method: 'GET', url: `/pulls/${missingId}/brief` });
    expect(getRes.statusCode).toBe(404);

    const postRes = await app.inject({ method: 'POST', url: `/pulls/${missingId}/brief` });
    expect(postRes.statusCode).toBe(404);

    await app.close();
  });

  it('GET returns null for a malformed persisted pr_brief.json blob instead of an off-contract object (FIX 1)', async () => {
    const { app, prId } = await setup({ name: 'demo-malformed' });

    // Manually insert a jsonb blob that does NOT satisfy the Brief contract
    // (missing every required field) — simulates a stale/corrupt row bypassing
    // the service's normal write path.
    await pg.handle.db.insert(t.prBrief).values({ prId, json: { garbage: true } as never });

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/brief` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toBeNull();

    await app.close();
  });

  it('makes AT MOST ONE model call per generate (AC-15) — blastMapForPr is stubbed, no 2nd call', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('unexpected complete() call'));
    const completeStructured = vi.fn().mockResolvedValue({
      data: MODEL_FIXTURE,
      model: 'gpt-4.1',
      tokensIn: 10,
      tokensOut: 10,
      costUsd: 0,
      raw: '{}',
      attempts: 1,
    });
    const spyLlm = { complete, completeStructured } as unknown as LLMProvider;
    const { app, prId } = await setup({ name: 'demo-one-call', llm: spyLlm });

    await app.inject({ method: 'POST', url: `/pulls/${prId}/brief` });

    expect(complete).not.toHaveBeenCalled();
    expect(completeStructured).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
