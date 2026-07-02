import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Onboarding } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import type { RepoIntel, IndexState } from '../src/modules/repo-intel/types.js';
import { INDEX_JOB_KIND } from '../src/modules/repo-intel/constants.js';
import { ONBOARDING_JOB_KIND } from '../src/modules/onboarding/constants.js';

/**
 * onboarding module (SPEC-03 T3) — DB-backed. Covers the wiring an in-process
 * unit test can't: the real Fastify routes + JobRunner + Postgres `jobs`/
 * `onboarding` tables — background generation (AC-23, AC-4), Regenerate
 * overwriting the single row (AC-9), cross-workspace isolation (AC-17), the
 * not-cloned/not-indexed guard (AC-19), and the real INDEX-job-completion →
 * auto-regen wiring (AC-24). The pure decision logic (maybeEnqueueRegen
 * branches, fact assembly, normalization, fallback) is already unit-tested in
 * test/onboarding.test.ts — this file proves the end-to-end plumbing around it.
 * Self-skips without Docker.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[onboarding] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type TestDb = PgFixture['handle']['db'];

/** A valid `Onboarding` fixture — the canonical five sections. */
const ONBOARDING_FIXTURE: Onboarding = {
  sections: [
    {
      kind: 'architecture',
      title: 'Architecture overview',
      body: 'How the pieces fit together.',
      diagram: null,
      links: [],
    },
    {
      kind: 'critical_paths',
      title: 'Critical paths',
      body: 'The most important files to know.',
      diagram: null,
      links: [{ label: 'index.ts', path: 'src/index.ts', rationale: 'Entry point.', used_by: null }],
    },
    {
      kind: 'how_to_run',
      title: 'How to run locally',
      body: 'npm install && npm run dev',
      diagram: null,
      links: [],
    },
    {
      kind: 'reading_path',
      title: 'Guided reading path',
      body: 'Start at src/index.ts.',
      diagram: null,
      links: [],
    },
    {
      kind: 'first_tasks',
      title: 'First tasks',
      body: 'Fix a typo in the README.',
      diagram: null,
      links: [],
    },
  ],
};

/** A minimal but fully-typed RepoIntel stub — `state` is mutable so a test can
 *  advance `updatedAt` between calls (AC-24's "index moved on" check). */
function fakeRepoIntel(state: { filesIndexed: number; updatedAt: Date }): RepoIntel {
  return {
    indexRepo: async () => ({ status: 'full', filesIndexed: state.filesIndexed, filesSkipped: 0, durationMs: 1 }),
    refreshIndex: async () => ({
      status: 'full',
      filesIndexed: state.filesIndexed,
      filesSkipped: 0,
      durationMs: 1,
    }),
    getIndexState: async (repoId: string): Promise<IndexState> => ({
      repoId,
      status: state.filesIndexed > 0 ? 'full' : 'degraded',
      filesIndexed: state.filesIndexed,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: 'deadbeef',
      indexerVersion: 2,
      updatedAt: state.updatedAt,
    }),
    getBlastRadius: async () => ({ changedSymbols: [], callers: [], impactedEndpoints: ['GET /health'] }),
    getRepoMap: async () => ({ text: 'src/\n  index.ts', tokens: 5, cached: false }),
    getFileRank: async (_repoId, paths) => paths.map((path, i) => ({ path, percentile: 1 - i * 0.1 })),
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => ['src/index.ts'],
    getCriticalPaths: async () => [['src/index.ts', 'src/lib/util.ts']],
  };
}

let repoSeq = 0;
async function makeRepo(
  db: TestDb,
  workspaceId: string,
  opts: { clonePath?: string | null } = {},
) {
  const name = `onboarding-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({
      workspaceId,
      owner: 'acme',
      name,
      fullName: `acme/${name}`,
      clonePath: opts.clonePath === undefined ? `/mock/clones/acme/${name}` : opts.clonePath,
    })
    .returning();
  return repo!;
}

/** Onboarding-kind jobs enqueued for `repoId` — mirrors OnboardingRepository's own query shape. */
async function onboardingJobsForRepo(db: TestDb, repoId: string) {
  return db
    .select()
    .from(t.jobs)
    .where(and(eq(t.jobs.kind, ONBOARDING_JOB_KIND), sql`${t.jobs.payload} ->> 'repoId' = ${repoId}`));
}

/** Poll `GET /repos/:id/onboarding/job/:jobId` until it reaches a terminal status — the
 *  generation itself is a fire-and-forget background job (see routes.ts docstring). */
async function pollJobStatus(
  app: FastifyInstance,
  repoId: string,
  jobId: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ job_id: string; status: string; error: string | null }> {
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const start = Date.now();
  for (;;) {
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/onboarding/job/${jobId}` });
    const body = res.json() as { job_id: string; status: string; error: string | null };
    if (body.status === 'done' || body.status === 'failed') return body;
    if (Date.now() - start > timeoutMs) return body;
    await new Promise((r) => setTimeout(r, 25));
  }
}

d('onboarding module (DB-backed, SPEC-03 T3)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** `openrouter` is the registry default provider for the 'onboarding' feature
   *  (see FEATURE_MODELS in vendor/shared/contracts/platform.ts) — the mock's
   *  own internal `id` field is unused for resolution, only the override KEY is. */
  function appWith(repoIntelState: { filesIndexed: number; updatedAt: Date }) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel: fakeRepoIntel(repoIntelState),
        git: new MockGitClient({ files: {} }),
        llm: { openrouter: new MockLLMProvider('openai', { structured: ONBOARDING_FIXTURE }) },
      },
    });
  }

  it('AC-23/AC-4: generate enqueues ONE background job that reaches done, then GET onboarding returns the persisted tour', async () => {
    const db = pg.handle.db;
    const repo = await makeRepo(db, workspaceId);
    const app = await appWith({ filesIndexed: 5, updatedAt: new Date() });

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/onboarding/generate` });
    expect(res.statusCode).toBe(202);
    const { job_id: jobId } = res.json() as { job_id: string };
    expect(jobId).toBeTruthy();

    // Exactly ONE job was enqueued for this repo.
    const jobs = await onboardingJobsForRepo(db, repo.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.id).toBe(jobId);

    // The background job reaches a terminal state — never assert the tour
    // exists before this (the POST doesn't block on the model).
    const status = await pollJobStatus(app, repo.id, jobId);
    expect(status.status).toBe('done');

    const getRes = await app.inject({ method: 'GET', url: `/repos/${repo.id}/onboarding` });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json() as {
      tour: Onboarding | null;
      generated_at: string | null;
      files_indexed: number;
      indexed: boolean;
    };
    expect(body.tour).not.toBeNull();
    expect(body.tour!.sections.map((s) => s.kind)).toEqual([
      'architecture',
      'critical_paths',
      'how_to_run',
      'reading_path',
      'first_tasks',
    ]);
    expect(body.generated_at).toBeTruthy();
    expect(body.files_indexed).toBe(5);
    expect(body.indexed).toBe(true);

    await app.close();
  });

  it('safety: a generation job that throws is recorded `failed` and does NOT crash the API (fire-and-forget `done` rejection is swallowed)', async () => {
    const db = pg.handle.db;
    const repo = await makeRepo(db, workspaceId);
    // A repo-intel whose getRepoMap throws inside the job handler — OUTSIDE
    // generateOnboarding's own try/catch (which would otherwise fall back to the
    // skeleton). runGenerationJob rejects → JobRunner marks the job `failed` and
    // re-throws into the fire-and-forget `done` promise. Without the service's
    // `void job.done.catch()`, that rejection is unhandled and crashes the process.
    const app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        repoIntel: {
          ...fakeRepoIntel({ filesIndexed: 5, updatedAt: new Date() }),
          getRepoMap: async () => {
            throw new Error('boom');
          },
        },
        git: new MockGitClient({ files: {} }),
        llm: { openrouter: new MockLLMProvider('openai', { structured: ONBOARDING_FIXTURE }) },
      },
    });

    const res = await app.inject({ method: 'POST', url: `/repos/${repo.id}/onboarding/generate` });
    expect(res.statusCode).toBe(202);
    const { job_id: jobId } = res.json() as { job_id: string };

    const status = await pollJobStatus(app, repo.id, jobId);
    expect(status.status).toBe('failed');

    // The process survived the failed fire-and-forget job — a subsequent request
    // still succeeds (an unhandled `done` rejection would have crashed it).
    const getRes = await app.inject({ method: 'GET', url: `/repos/${repo.id}/onboarding` });
    expect(getRes.statusCode).toBe(200);
    expect((getRes.json() as { tour: unknown }).tour).toBeNull();

    await app.close();
  });

  it('AC-9: Regenerate overwrites the single onboarding row for the repo (still exactly one row, generated_at advances)', async () => {
    const db = pg.handle.db;
    const repo = await makeRepo(db, workspaceId);
    const app = await appWith({ filesIndexed: 3, updatedAt: new Date() });

    const res1 = await app.inject({ method: 'POST', url: `/repos/${repo.id}/onboarding/generate` });
    expect(res1.statusCode).toBe(202);
    const job1 = (res1.json() as { job_id: string }).job_id;
    const status1 = await pollJobStatus(app, repo.id, job1);
    expect(status1.status).toBe('done');

    const rowsAfterFirst = await db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repo.id));
    expect(rowsAfterFirst).toHaveLength(1);
    const firstGeneratedAt = rowsAfterFirst[0]!.generatedAt.getTime();

    // Regenerate — the first job already finished, so this is a NEW job, not
    // a de-duped in-flight one.
    const res2 = await app.inject({ method: 'POST', url: `/repos/${repo.id}/onboarding/generate` });
    expect(res2.statusCode).toBe(202);
    const job2 = (res2.json() as { job_id: string }).job_id;
    expect(job2).not.toBe(job1);
    const status2 = await pollJobStatus(app, repo.id, job2);
    expect(status2.status).toBe('done');

    const rowsAfterSecond = await db.select().from(t.onboarding).where(eq(t.onboarding.repoId, repo.id));
    expect(rowsAfterSecond).toHaveLength(1); // still exactly ONE row for the repo (PK = repo_id)
    expect(rowsAfterSecond[0]!.generatedAt.getTime()).toBeGreaterThan(firstGeneratedAt);

    await app.close();
  });

  it('AC-17: a repo in another workspace is rejected — the onboarding row is never read or written cross-workspace', async () => {
    const db = pg.handle.db;
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'onboarding-cross-tenant' }).returning();
    const otherRepo = await makeRepo(db, otherWs!.id);
    // Pre-seed a tour directly (bypassing HTTP) so a leak would be observable.
    await db.insert(t.onboarding).values({ repoId: otherRepo.id, json: ONBOARDING_FIXTURE, generatedAt: new Date() });

    const app = await appWith({ filesIndexed: 4, updatedAt: new Date() });

    const getRes = await app.inject({ method: 'GET', url: `/repos/${otherRepo.id}/onboarding` });
    expect(getRes.statusCode).toBe(404);

    const postRes = await app.inject({ method: 'POST', url: `/repos/${otherRepo.id}/onboarding/generate` });
    expect(postRes.statusCode).toBe(404);

    // Rejected before ever touching the jobs table for that repo.
    const jobs = await onboardingJobsForRepo(db, otherRepo.id);
    expect(jobs).toHaveLength(0);

    await app.close();
  });

  it('AC-19: generation is guarded when the repo is not cloned or not indexed yet (no job, no crash)', async () => {
    const db = pg.handle.db;
    const app = await appWith({ filesIndexed: 0, updatedAt: new Date() });

    // Never cloned.
    const notClonedRepo = await makeRepo(db, workspaceId, { clonePath: null });
    const res1 = await app.inject({ method: 'POST', url: `/repos/${notClonedRepo.id}/onboarding/generate` });
    expect(res1.statusCode).toBe(422);

    // Cloned, but the index has 0 files (never indexed).
    const notIndexedRepo = await makeRepo(db, workspaceId);
    const res2 = await app.inject({ method: 'POST', url: `/repos/${notIndexedRepo.id}/onboarding/generate` });
    expect(res2.statusCode).toBe(422);

    const jobsA = await onboardingJobsForRepo(db, notClonedRepo.id);
    const jobsB = await onboardingJobsForRepo(db, notIndexedRepo.id);
    expect(jobsA).toHaveLength(0);
    expect(jobsB).toHaveLength(0);

    // GET never crashes for a not-indexed repo — tour stays null, indexed: false.
    const getRes = await app.inject({ method: 'GET', url: `/repos/${notIndexedRepo.id}/onboarding` });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json() as { tour: unknown; indexed: boolean };
    expect(body.tour).toBeNull();
    expect(body.indexed).toBe(false);

    await app.close();
  });

  it('AC-24: an INDEX-kind job completion auto-enqueues ONE onboarding regen (carrying workspace_id) when a tour exists, and ZERO when it does not', async () => {
    const db = pg.handle.db;

    const repoWithTour = await makeRepo(db, workspaceId);
    const priorGeneratedAt = new Date(Date.now() - 60_000);
    await db
      .insert(t.onboarding)
      .values({ repoId: repoWithTour.id, json: ONBOARDING_FIXTURE, generatedAt: priorGeneratedAt });

    const repoNoTour = await makeRepo(db, workspaceId);

    // Index "moved on" past the existing tour's generated_at.
    const app = await appWith({ filesIndexed: 5, updatedAt: new Date() });

    // Replace the real repo-intel indexer's INDEX_JOB_KIND handler with a
    // no-op stub — this test drives ONLY the onboarding auto-regen completion
    // hook, not real indexing (see onboarding/service.ts registerJobHandlers).
    app.container.jobs.register(INDEX_JOB_KIND, async () => {});

    const jobWithTour = await app.container.jobs.enqueue(workspaceId, INDEX_JOB_KIND, {
      repoId: repoWithTour.id,
    });
    await jobWithTour.done;

    const jobNoTour = await app.container.jobs.enqueue(workspaceId, INDEX_JOB_KIND, { repoId: repoNoTour.id });
    await jobNoTour.done;

    // Let any auto-triggered onboarding regen job finish before asserting/closing.
    await app.container.jobs.onIdle();

    const regenWithTour = await onboardingJobsForRepo(db, repoWithTour.id);
    expect(regenWithTour).toHaveLength(1);
    expect(regenWithTour[0]!.workspaceId).toBe(workspaceId);

    const regenNoTour = await onboardingJobsForRepo(db, repoNoTour.id);
    expect(regenNoTour).toHaveLength(0);

    await app.close();
  });
});
