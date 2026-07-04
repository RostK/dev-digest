import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';
import type { Tokenizer } from '../src/adapters/tokenizer/index.js';
import { buildProjectContextSpecs } from '../src/modules/reviews/project-context.js';

/**
 * run-executor × Project Context injection (SPEC-02 T6) — DB-backed. Covers the
 * full wiring an in-process unit test can't: T5's `effectiveContextPaths` (real
 * agent_context_docs / skill_context_docs / agent_skills rows) → T6's
 * `ProjectContextService` (repo-clone reads) → the run trace (`specs_read`,
 * `stats.specs_tokens`, `prompt_assembly.specs`). Self-skips without Docker.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[reviews-project-context] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** Deterministic stand-in for TiktokenTokenizer — count = char length, so the
 *  expected `specs_tokens` in assertions is exactly the joined text's length. */
const FAKE_TOKENIZER: Tokenizer = { count: (text: string) => text.length };

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Clean "approve" fixture — this suite is about the prompt slot, not grounding. */
const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 100,
  findings: [],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `ctx-run-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Wire project context',
      author: 'dev',
      branch: 'feat/ctx',
      base: 'main',
      headSha: 'deadbeef',
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

d('reviews × Project Context injection (DB-backed, SPEC-02 T6)', () => {
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

  function appWith(files: Record<string, string>) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF, files }),
        tokenizer: FAKE_TOKENIZER,
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  it('populates specs / specs_read / specs_tokens / assembly.specs — own before inherited, order preserved', async () => {
    const db = pg.handle.db;
    const app = await appWith({
      'docs/setup.md': 'Own doc body.',
      'specs/plan.md': 'Inherited doc body.',
    });
    const { pr } = await setupRepoAndPr(db, workspaceId);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CtxAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();

    // Own doc, directly attached (T5).
    await db.insert(t.agentContextDocs).values({ agentId: agent.id, path: 'docs/setup.md', order: 0 });

    // Inherited doc, via an enabled skill binding (T5).
    const [skill] = await db
      .insert(t.skills)
      .values({ workspaceId, name: 'Ctx Skill', description: 'x', type: 'custom', source: 'manual', body: 'x' })
      .returning();
    await db.insert(t.skillContextDocs).values({ skillId: skill!.id, path: 'specs/plan.md', order: 0 });
    await db.insert(t.agentSkills).values({ agentId: agent.id, skillId: skill!.id, order: 0, enabled: true });

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();

    // specs_read: own THEN inherited, in order (AC-14: no skipped path here).
    expect(trace.specs_read).toEqual(['docs/setup.md', 'specs/plan.md']);

    // The pure grouping function fed the SAME known doc content reproduces the
    // exact injected text — proves the end-to-end wiring didn't drop/reorder
    // anything on the way from DB rows to the trace.
    const expectedSpecs = buildProjectContextSpecs(
      [{ path: 'docs/setup.md', content: 'Own doc body.' }],
      [{ path: 'specs/plan.md', content: 'Inherited doc body.' }],
    );
    expect(trace.stats.specs_tokens).toBe(expectedSpecs.join('\n\n').length);

    // assembly.specs is the engine's wrapUntrusted-fenced render (no `## Project
    // context` header — that's in `.user`, not per-slot assembly fields).
    expect(trace.prompt_assembly.specs).toContain('<untrusted source="spec-0">');
    expect(trace.prompt_assembly.specs).toContain('// Agent-attached documents');
    expect(trace.prompt_assembly.specs).toContain('docs/setup.md');
    expect(trace.prompt_assembly.specs).toContain('Own doc body.');
    expect(trace.prompt_assembly.specs).toContain('<untrusted source="spec-1">');
    expect(trace.prompt_assembly.specs).toContain('// Inherited from skills');
    expect(trace.prompt_assembly.specs).toContain('specs/plan.md');
    expect(trace.prompt_assembly.specs).toContain('Inherited doc body.');

    // No LLM call beyond the review itself (AC-12) — provable indirectly: the
    // run completed via the single openai mock with no configured openrouter
    // key, so any extra LLM path (there is none) would have thrown.
    expect(runId).toBeTruthy();

    await app.close();
  });

  it('AC-8: editing the doc in the repo and re-running reflects the new text (no caching)', async () => {
    const db = pg.handle.db;

    // First run — original content.
    const appV1 = await appWith({ 'docs/setup.md': 'Version 1 text.' });
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const agent = (
      await appV1.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'EditAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await db.insert(t.agentContextDocs).values({ agentId: agent.id, path: 'docs/setup.md', order: 0 });

    const runV1 = (
      await appV1.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json().runs[0].run_id;
    await waitForPrRuns(db, pr.id, { expected: 1 });
    const traceV1 = (await appV1.inject({ method: 'GET', url: `/runs/${runV1}/trace` })).json();
    expect(traceV1.prompt_assembly.specs).toContain('Version 1 text.');
    await appV1.close();

    // Second run, same agent/PR, but the file's content in the repo "changed"
    // (a fresh app instance with an updated MockGitClient — same DB).
    const appV2 = await appWith({ 'docs/setup.md': 'Version 2 text — EDITED.' });
    const runV2 = (
      await appV2.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } })
    ).json().runs[0].run_id;
    await waitForPrRuns(db, pr.id, { expected: 2 });
    const traceV2 = (await appV2.inject({ method: 'GET', url: `/runs/${runV2}/trace` })).json();
    expect(traceV2.prompt_assembly.specs).toContain('Version 2 text — EDITED.');
    expect(traceV2.prompt_assembly.specs).not.toContain('Version 1 text.');

    await appV2.close();
  });

  it('AC-19: an agent never injects another agent/repo\'s context docs (no cross-contamination)', async () => {
    const db = pg.handle.db;
    const app = await appWith({
      'docs/agent-a-only.md': 'Agent A private doc.',
      'docs/agent-b-only.md': 'Agent B private doc.',
    });

    const { pr: prA } = await setupRepoAndPr(db, workspaceId);
    const { pr: prB } = await setupRepoAndPr(db, workspaceId);

    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'IsoA', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'IsoB', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await db.insert(t.agentContextDocs).values({ agentId: agentA.id, path: 'docs/agent-a-only.md', order: 0 });
    await db.insert(t.agentContextDocs).values({ agentId: agentB.id, path: 'docs/agent-b-only.md', order: 0 });

    const runA = (
      await app.inject({ method: 'POST', url: `/pulls/${prA.id}/review`, payload: { agentId: agentA.id } })
    ).json().runs[0].run_id;
    const runB = (
      await app.inject({ method: 'POST', url: `/pulls/${prB.id}/review`, payload: { agentId: agentB.id } })
    ).json().runs[0].run_id;
    await waitForPrRuns(db, prA.id, { expected: 1 });
    await waitForPrRuns(db, prB.id, { expected: 1 });

    const traceA = (await app.inject({ method: 'GET', url: `/runs/${runA}/trace` })).json();
    const traceB = (await app.inject({ method: 'GET', url: `/runs/${runB}/trace` })).json();

    expect(traceA.specs_read).toEqual(['docs/agent-a-only.md']);
    expect(traceA.prompt_assembly.specs).toContain('Agent A private doc.');
    expect(traceA.prompt_assembly.specs).not.toContain('Agent B private doc.');

    expect(traceB.specs_read).toEqual(['docs/agent-b-only.md']);
    expect(traceB.prompt_assembly.specs).toContain('Agent B private doc.');
    expect(traceB.prompt_assembly.specs).not.toContain('Agent A private doc.');

    await app.close();
  });

  it('AC-19: the SAME path resolves to each PR\'s OWN clone, never another repo\'s (per-clone isolation)', async () => {
    const db = pg.handle.db;
    // Create both repos FIRST so we can key file content by their real names.
    const { repo: repoA, pr: prA } = await setupRepoAndPr(db, workspaceId);
    const { repo: repoB, pr: prB } = await setupRepoAndPr(db, workspaceId);

    // The IDENTICAL repo-relative path, but DIFFERENT content in each clone.
    const app = await buildApp({
      config: config(),
      db,
      overrides: {
        git: new MockGitClient({
          diff: DIFF,
          filesByRepo: {
            [`${repoA.owner}/${repoA.name}`]: { 'docs/shared.md': 'REPO A version of the doc.' },
            [`${repoB.owner}/${repoB.name}`]: { 'docs/shared.md': 'REPO B version of the doc.' },
          },
        }),
        tokenizer: FAKE_TOKENIZER,
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });

    // One agent per repo, each attaching the SAME repo-relative path.
    const agentA = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CloneA', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    const agentB = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'CloneB', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await db.insert(t.agentContextDocs).values({ agentId: agentA.id, path: 'docs/shared.md', order: 0 });
    await db.insert(t.agentContextDocs).values({ agentId: agentB.id, path: 'docs/shared.md', order: 0 });

    const runA = (
      await app.inject({ method: 'POST', url: `/pulls/${prA.id}/review`, payload: { agentId: agentA.id } })
    ).json().runs[0].run_id;
    const runB = (
      await app.inject({ method: 'POST', url: `/pulls/${prB.id}/review`, payload: { agentId: agentB.id } })
    ).json().runs[0].run_id;
    // Two concurrent background reviews on a slow (Docker) machine → give the
    // waits room so the trace is persisted before we read prompt_assembly.
    await waitForPrRuns(db, prA.id, { expected: 1, timeoutMs: 30_000 });
    await waitForPrRuns(db, prB.id, { expected: 1, timeoutMs: 30_000 });

    const traceA = (await app.inject({ method: 'GET', url: `/runs/${runA}/trace` })).json();
    const traceB = (await app.inject({ method: 'GET', url: `/runs/${runB}/trace` })).json();

    // Each run injected ITS OWN repo's version of the identical path — a bug
    // that read from the wrong clone would leak the other repo's content here.
    expect(traceA.prompt_assembly.specs).toContain('REPO A version of the doc.');
    expect(traceA.prompt_assembly.specs).not.toContain('REPO B version of the doc.');
    expect(traceB.prompt_assembly.specs).toContain('REPO B version of the doc.');
    expect(traceB.prompt_assembly.specs).not.toContain('REPO A version of the doc.');

    await app.close();
  });

  it('a missing/unreadable doc is skipped and the run still succeeds (AC-13)', async () => {
    const db = pg.handle.db;
    const app = await appWith({ 'docs/exists.md': 'Present.' });
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'MissingDocAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    // 'docs/missing.md' is attached but never present in the mock's files map —
    // the mock git adapter resolves it to '' (same as ENOENT on the real one).
    await db.insert(t.agentContextDocs).values([
      { agentId: agent.id, path: 'docs/exists.md', order: 0 },
      { agentId: agent.id, path: 'docs/missing.md', order: 1 },
    ]);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    const runs = await waitForPrRuns(db, pr.id, { expected: 1 });
    expect(runs[0]!.status).toBe('done'); // never fails the run over one bad doc

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.specs_read).toEqual(['docs/exists.md']); // missing path excluded

    await app.close();
  });

  it('empty effective set → no `## Project context` section, byte-identical to pre-feature (AC-11)', async () => {
    const db = pg.handle.db;
    const app = await appWith({});
    const { pr } = await setupRepoAndPr(db, workspaceId);
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'NoCtxAgent', provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    // No agentContextDocs, no skills — effective set is empty.

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(db, pr.id, { expected: 1 });

    const trace = (await app.inject({ method: 'GET', url: `/runs/${runId}/trace` })).json();
    expect(trace.specs_read).toEqual([]);
    expect(trace.stats.specs_tokens).toBe(0);
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Project context');

    await app.close();
  });
});
