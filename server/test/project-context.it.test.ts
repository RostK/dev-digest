import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { RepoIntel, DiscoveredDoc } from '../src/modules/repo-intel/types.js';
import type { Tokenizer } from '../src/adapters/tokenizer/index.js';

/**
 * project-context module (SPEC-02 T4) — DB-backed. Covers the used_by /
 * coverage aggregation over real `agents` / `agent_skills` / `skills` /
 * `agent_context_docs` / `skill_context_docs` rows (the pure per-agent tally
 * itself is unit-tested in test/project-context-helpers.test.ts), cross-
 * workspace isolation (AC-19), and that listing docs makes zero LLM calls
 * (AC-12). Self-skips without Docker.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[project-context] Docker not available — skipping integration tests.');
}

/** Deterministic stand-in for TiktokenTokenizer — count = char length, so
 *  expected `tokens` values in assertions are exactly the fixture text length. */
const FAKE_TOKENIZER: Tokenizer = { count: (text: string) => text.length };

function fakeRepoIntel(docs: DiscoveredDoc[]): RepoIntel {
  return { discoverContextDocs: async () => docs } as unknown as RepoIntel;
}

type Doc = { path: string; badge: string; tokens: number; used_by: number; coverage: number };

d('project-context module (DB-backed)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('returns path/badge/tokens/used_by/coverage — own docs, docs inherited from an ENABLED skill binding count, a disabled binding/skill does not, no LLM call', async () => {
    const db = pg.handle.db;

    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx-demo', fullName: 'acme/ctx-demo' })
      .returning();

    // Baseline agent count read LIVE (the seed ships its own demo agents) so
    // the coverage denominator isn't a hardcoded, seed-shape-coupled number.
    const before = await db.select({ id: t.agents.id }).from(t.agents).where(eq(t.agents.workspaceId, workspaceId));

    const mkAgent = async (name: string) =>
      (
        await db
          .insert(t.agents)
          .values({ workspaceId, name, provider: 'openai', model: 'gpt-4o-mini', systemPrompt: 'x' })
          .returning()
      )[0]!;
    const agentA = await mkAgent('Ctx Agent A');
    const agentB = await mkAgent('Ctx Agent B');
    const agentC = await mkAgent('Ctx Agent C');
    const totalAgents = before.length + 3;

    // Agent A OWNS docs/setup.md directly.
    await db.insert(t.agentContextDocs).values({ agentId: agentA.id, path: 'docs/setup.md', order: 0 });

    // Skill X (globally enabled) also attaches docs/setup.md; Agent B inherits
    // it via an ENABLED binding.
    const [skillX] = await db
      .insert(t.skills)
      .values({ workspaceId, name: 'Skill X', description: 'x', type: 'custom', source: 'manual', body: 'x' })
      .returning();
    await db.insert(t.skillContextDocs).values({ skillId: skillX!.id, path: 'docs/setup.md', order: 0 });
    await db.insert(t.agentSkills).values({ agentId: agentB.id, skillId: skillX!.id, order: 0, enabled: true });

    // Agent C links the SAME skill, but the BINDING is disabled — must NOT count.
    await db.insert(t.agentSkills).values({ agentId: agentC.id, skillId: skillX!.id, order: 0, enabled: false });
    // Agent C owns a distinct doc of its own.
    await db.insert(t.agentContextDocs).values({ agentId: agentC.id, path: 'specs/SPEC-01.md', order: 0 });

    // Skill Y is GLOBALLY disabled but bound (enabled binding) to Agent A — must NOT count either.
    const [skillY] = await db
      .insert(t.skills)
      .values({ workspaceId, name: 'Skill Y', description: 'x', type: 'custom', source: 'manual', body: 'x', enabled: false })
      .returning();
    await db.insert(t.skillContextDocs).values({ skillId: skillY!.id, path: 'insights/should-not-count.md', order: 0 });
    await db.insert(t.agentSkills).values({ agentId: agentA.id, skillId: skillY!.id, order: 1, enabled: true });

    const files = {
      'docs/setup.md': 'setup text',
      'specs/SPEC-01.md': 'spec text!',
      'insights/notes.md': 'note',
    };
    const discovered: DiscoveredDoc[] = [
      { path: 'docs/setup.md', badge: 'docs' },
      { path: 'specs/SPEC-01.md', badge: 'specs' },
      { path: 'insights/notes.md', badge: 'insights' }, // discovered but unused by anyone
    ];

    const llm = new MockLLMProvider('openai');
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db,
      overrides: {
        repoIntel: fakeRepoIntel(discovered),
        git: new MockGitClient({ files }),
        tokenizer: FAKE_TOKENIZER,
        llm: { openai: llm },
      },
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/project-context/docs` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Doc[];
    expect(body).toHaveLength(3);

    const setup = body.find((doc) => doc.path === 'docs/setup.md')!;
    expect(setup.badge).toBe('docs');
    expect(setup.tokens).toBe(files['docs/setup.md'].length);
    expect(setup.used_by).toBe(2); // Agent A (own) + Agent B (inherited, enabled binding+skill)
    expect(setup.coverage).toBeCloseTo(2 / totalAgents);

    const spec = body.find((doc) => doc.path === 'specs/SPEC-01.md')!;
    expect(spec.tokens).toBe(files['specs/SPEC-01.md'].length);
    expect(spec.used_by).toBe(1); // Agent C only

    const notes = body.find((doc) => doc.path === 'insights/notes.md')!;
    expect(notes.used_by).toBe(0);
    expect(notes.coverage).toBe(0);

    // AC-12: listing project-context docs never calls an LLM/embedding provider.
    expect(llm.calls).toHaveLength(0);

    await app.close();
  });

  it('AC-19: a repo/agent from another workspace never leaks — 404s cross-tenant and excludes foreign agents from used_by', async () => {
    const db = pg.handle.db;

    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other-tenant' }).returning();
    const [otherRepo] = await db
      .insert(t.repos)
      .values({ workspaceId: otherWs!.id, owner: 'other', name: 'secret', fullName: 'other/secret' })
      .returning();
    const [otherAgent] = await db
      .insert(t.agents)
      .values({ workspaceId: otherWs!.id, name: 'Foreign Agent', provider: 'openai', model: 'gpt-4o-mini', systemPrompt: 'x' })
      .returning();
    // Same path an in-workspace repo will discover below — must not inflate its used_by.
    await db.insert(t.agentContextDocs).values({ agentId: otherAgent!.id, path: 'docs/isolated.md', order: 0 });

    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db,
      overrides: {
        repoIntel: fakeRepoIntel([{ path: 'docs/isolated.md', badge: 'docs' }]),
        git: new MockGitClient({ files: { 'docs/isolated.md': 'x' } }),
        tokenizer: FAKE_TOKENIZER,
      },
    });

    // A repo owned by the OTHER workspace is invisible to the (always-default)
    // request context — 404, not the foreign tenant's docs.
    const foreignRes = await app.inject({ method: 'GET', url: `/repos/${otherRepo!.id}/project-context/docs` });
    expect(foreignRes.statusCode).toBe(404);

    // A repo IN the default workspace that happens to discover the SAME path
    // must NOT count the foreign workspace's agent.
    const [ownRepo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'ctx-isolated', fullName: 'acme/ctx-isolated' })
      .returning();
    const ownRes = await app.inject({ method: 'GET', url: `/repos/${ownRepo!.id}/project-context/docs` });
    expect(ownRes.statusCode).toBe(200);
    const doc = (ownRes.json() as Doc[]).find((x) => x.path === 'docs/isolated.md')!;
    expect(doc.used_by).toBe(0);
    expect(doc.coverage).toBe(0);

    await app.close();
  });

  it('404s for a repoId that does not exist at all', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        repoIntel: fakeRepoIntel([]),
        git: new MockGitClient(),
        tokenizer: FAKE_TOKENIZER,
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/repos/00000000-0000-0000-0000-000000000000/project-context/docs',
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
