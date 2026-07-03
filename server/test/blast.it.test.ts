import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { LLMProvider } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel, BlastResult, IndexStatus } from '../src/modules/repo-intel/types.js';

/**
 * DB-backed GET /pulls/:id/blast. The repo-intel facade is stubbed (its own
 * index reads are covered by repo-intel-*.test.ts) so this focuses on the
 * blast module's wiring: pr_files → facade → mapper → summary → BlastResponse,
 * tenancy, the single summary call, and the degraded fallback.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const FULL_MAP: BlastResult = {
  changedSymbols: [{ file: 'src/lib/rate.ts', name: 'rateLimit', kind: 'function' }],
  callers: [
    { file: 'src/api/public/index.ts', symbol: 'handler', viaSymbol: 'rateLimit', line: 23, rank: 9 },
    { file: 'src/api/public/webhooks.ts', symbol: 'onWebhook', viaSymbol: 'rateLimit', line: 45, rank: 7 },
  ],
  impactedEndpoints: ['GET /api/public/items', 'POST /api/public/webhooks'],
  factsByFile: {
    'src/api/public/index.ts': { endpoints: ['GET /api/public/items'], crons: [] },
    'src/api/public/webhooks.ts': { endpoints: ['POST /api/public/webhooks'], crons: [] },
  },
  degraded: false,
};

const DEGRADED_MAP: BlastResult = {
  ...FULL_MAP,
  factsByFile: undefined,
  degraded: true,
  reason: 'no_data',
};

function fakeRepoIntel(result: BlastResult, status: IndexStatus): RepoIntel {
  return {
    getBlastRadius: async () => result,
    getIndexState: async (repoId: string) => ({
      repoId,
      status,
      filesIndexed: 1,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: 'sha',
      indexerVersion: 2,
      updatedAt: new Date(0),
      degraded: status === 'degraded' || status === 'failed',
      degradedReason: status === 'degraded' ? ('no_data' as const) : undefined,
    }),
  } as unknown as RepoIntel;
}

/** An LLM whose only method (complete) always throws → forces the fallback. */
const throwingLlm = {
  complete: async () => {
    throw new Error('no key');
  },
} as unknown as LLMProvider;

d('Blast radius route (DB-backed)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(opts: {
    name: string;
    result: BlastResult;
    status: IndexStatus;
    llm?: LLMProvider;
  }) {
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
        repoIntel: fakeRepoIntel(opts.result, opts.status),
        ...(opts.llm ? { llm: { anthropic: opts.llm } } : {}),
      },
    });
    return { app, prId: pr!.id, repoId: repo!.id, workspaceId };
  }

  it('returns the mapped blast radius with the model summary (one call)', async () => {
    const llm = new MockLLMProvider('anthropic', { completionText: 'Touches the public rate limiter.' });
    const { app, prId } = await setup({ name: 'demo-full', result: FULL_MAP, status: 'full', llm });

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);

    const body = res.json() as {
      blast: {
        changed_symbols: unknown[];
        downstream: { symbol: string; callers: unknown[]; endpoints_affected: string[] }[];
        summary: string;
      };
      degraded: boolean;
      index_status: string;
    };

    expect(body.blast.summary).toBe('Touches the public rate limiter.');
    const rate = body.blast.downstream.find((d2) => d2.symbol === 'rateLimit')!;
    expect(rate.callers.length).toBeGreaterThanOrEqual(2); // acceptance
    expect(rate.endpoints_affected.length).toBeGreaterThanOrEqual(1); // acceptance
    expect(body.degraded).toBe(false);
    expect(body.index_status).toBe('full');
    expect(llm.calls.filter((c) => c.method === 'complete')).toHaveLength(1); // exactly one model call

    await app.close();
  });

  it('surfaces the degraded flag and uses the deterministic fallback summary', async () => {
    const { app, prId } = await setup({
      name: 'demo-degraded',
      result: DEGRADED_MAP,
      status: 'degraded',
      llm: throwingLlm,
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${prId}/blast` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { blast: { summary: string }; degraded: boolean; reason: string | null; index_status: string };

    expect(body.degraded).toBe(true);
    expect(body.reason).toBe('no_data');
    expect(body.index_status).toBe('degraded');
    // deterministic fallback ran (model threw) — 1 changed symbol, 2 callers, 2 endpoints
    expect(body.blast.summary).toBe('1 changed symbol with 2 callers across 2 impacted endpoints.');

    await app.close();
  });

  it('404s for a PR outside the workspace', async () => {
    const { app } = await setup({ name: 'demo-404', result: FULL_MAP, status: 'full' });
    const res = await app.inject({
      method: 'GET',
      url: `/pulls/00000000-0000-0000-0000-000000000000/blast`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('POST /repos/:id/blast accepts an explicit file set', async () => {
    const { app, repoId } = await setup({ name: 'demo-post', result: FULL_MAP, status: 'full', llm: throwingLlm });
    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/blast`,
      payload: { files: ['src/lib/rate.ts'] },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { blast: { downstream: unknown[] } }).blast.downstream.length).toBeGreaterThanOrEqual(1);
    await app.close();
  });

  it('container.blast.blastMapForPr returns the mapped map with ZERO LLM calls', async () => {
    // A spy LLM would throw if called — proves blastMapForPr never touches it,
    // unlike blastForPr (which makes exactly one summary call, asserted above).
    const complete = vi.fn().mockRejectedValue(new Error('blastMapForPr must not call the model'));
    const spyLlm = { complete } as unknown as LLMProvider;
    const { app, workspaceId, prId } = await setup({
      name: 'demo-zero-llm',
      result: FULL_MAP,
      status: 'full',
      llm: spyLlm,
    });

    const blast = await app.container.blast.blastMapForPr(workspaceId, prId);

    expect(complete).not.toHaveBeenCalled();
    const rate = blast.downstream.find((d) => d.symbol === 'rateLimit')!;
    expect(rate.callers.length).toBeGreaterThanOrEqual(2);
    // No model call → the deterministic count-string summary, not the mocked text.
    expect(blast.summary).toBe('1 changed symbol with 2 callers across 2 impacted endpoints.');

    await app.close();
  });
});
