import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { CiExport } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import type { MockGitHubOptions } from '../src/adapters/mocks.js';

/**
 * CI module's first automated test — SPEC-08 (idempotent Export-to-CI,
 * reset-to-base). Pattern off brief.it.test.ts: dockerAvailable() self-skip,
 * buildApp({ db, overrides }), seed, MockLLMProvider. Drives `POST
 * /agents/:id/ci/install` through the real service+adapter wiring, with the
 * GitHub call swapped for MockGitHubClient so the resulting branch tree
 * (reset-to-base) can be asserted directly. One case per AC-1..AC-7.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const REPO = 'acme/widgets';
const CI_BRANCH = 'devdigest/ci';
const SECRET_SUBSTRINGS = ['sk-', 'ghp_', 'github_pat'];

interface AgentManifestLike {
  name: string;
  provider: string;
  model: string;
  system_prompt: string;
  skills?: string[] | null;
}

d('CI export idempotency — reset-to-base (DB-backed)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(githubOpts: MockGitHubOptions = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const { workspaceId, userId } = await seed(pg.handle.db);
    const github = new MockGitHubClient(githubOpts);
    const mockLLM = new MockLLMProvider('openai');
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { github, llm: { openai: mockLLM } },
    });
    return { app, workspaceId, userId, github, mockLLM };
  }

  async function createAgent(workspaceId: string, userId: string, name: string, model = 'openrouter/deepseek-v4-flash') {
    const [agent] = await pg.handle.db
      .insert(t.agents)
      .values({
        workspaceId,
        name,
        description: `${name} — test agent`,
        provider: 'openrouter',
        model,
        systemPrompt: `You are agent ${name}.`,
        createdBy: userId,
      })
      .returning();
    return agent!;
  }

  function installBody(overrides: Record<string, unknown> = {}) {
    return { repo: REPO, target: 'gha', action: 'open_pr', base: 'main', ...overrides };
  }

  function manifestPathFor(slug: string): string {
    return `.devdigest/agents/${slug}.yaml`;
  }

  function manifestKeysOf(branch: Record<string, string>): string[] {
    return Object.keys(branch).filter((p) => p.startsWith('.devdigest/agents/'));
  }

  it('AC-1: exporting a different agent replaces the prior manifest, none stale', async () => {
    const { app, workspaceId, userId, github } = await setup();
    const agentA = await createAgent(workspaceId, userId, 'A');
    const agentB = await createAgent(workspaceId, userId, 'B');

    const resA = await app.inject({
      method: 'POST',
      url: `/agents/${agentA.id}/ci/install`,
      payload: installBody(),
    });
    expect(resA.statusCode).toBe(200);

    const resB = await app.inject({
      method: 'POST',
      url: `/agents/${agentB.id}/ci/install`,
      payload: installBody(),
    });
    expect(resB.statusCode).toBe(200);

    const branch = github.branches[CI_BRANCH]!;
    expect(manifestKeysOf(branch)).toEqual([manifestPathFor('b')]);
    expect(branch[manifestPathFor('a')]).toBeUndefined();

    await app.close();
  });

  it('AC-2: same-agent re-export stays a single manifest, no duplication', async () => {
    const { app, workspaceId, userId, github } = await setup();
    const agentA = await createAgent(workspaceId, userId, 'A');

    for (let i = 0; i < 2; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/agents/${agentA.id}/ci/install`,
        payload: installBody(),
      });
      expect(res.statusCode).toBe(200);
    }

    const branch = github.branches[CI_BRANCH]!;
    expect(manifestKeysOf(branch)).toEqual([manifestPathFor('a')]);

    await app.close();
  });

  it('AC-3: self-heals a branch already broken with two stale manifests (PR #22)', async () => {
    const { app, workspaceId, userId, github } = await setup({
      branchFiles: {
        [CI_BRANCH]: {
          [manifestPathFor('a')]: 'stale manifest a',
          [manifestPathFor('c')]: 'stale manifest c',
        },
      },
    });
    const agentB = await createAgent(workspaceId, userId, 'B');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentB.id}/ci/install`,
      payload: installBody(),
    });
    expect(res.statusCode).toBe(200);

    const branch = github.branches[CI_BRANCH]!;
    expect(manifestKeysOf(branch)).toEqual([manifestPathFor('b')]);

    await app.close();
  });

  it('AC-4: commits runner + workflow + empty memory.jsonl, and reuses a single PR', async () => {
    const { app, workspaceId, userId, github } = await setup();
    const agentA = await createAgent(workspaceId, userId, 'A');

    const first = await app.inject({
      method: 'POST',
      url: `/agents/${agentA.id}/ci/install`,
      payload: installBody(),
    });
    expect(first.statusCode).toBe(200);

    const branch = github.branches[CI_BRANCH]!;
    expect(Object.keys(branch).some((p) => p === '.devdigest/runner/index.js')).toBe(true);
    expect(Object.keys(branch).some((p) => p.startsWith('.devdigest/runner/'))).toBe(true);
    expect(branch['.github/workflows/devdigest-review.yml']).toBeTruthy();
    expect(branch['.devdigest/memory.jsonl']).toBe('');

    const second = await app.inject({
      method: 'POST',
      url: `/agents/${agentA.id}/ci/install`,
      payload: installBody(),
    });
    expect(second.statusCode).toBe(200);
    expect(github.openedPrs.length).toBe(1); // PR reused, not re-opened

    await app.close();
  });

  it("AC-5: action:'files' has no side effect — no commit, no PR, no installation row", async () => {
    const { app, workspaceId, userId, github } = await setup();
    const agentA = await createAgent(workspaceId, userId, 'A');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentA.id}/ci/install`,
      payload: installBody({ action: 'files' }),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as CiExport;

    expect(body.files.length).toBeGreaterThan(0);
    expect(body.installation).toBeNull();
    expect(body.pr_url).toBeNull();
    expect(github.committed.length).toBe(0);
    expect(github.openedPrs.length).toBe(0);

    await app.close();
  });

  it('AC-6: no LLM calls, openrouter+verbatim model, no secret, 403->422, non-gha no-op', async () => {
    // -- no LLM, provider/model, no-secret --
    const { app, workspaceId, userId, github, mockLLM } = await setup();
    const model = 'openrouter/my-custom-model';
    const agentA = await createAgent(workspaceId, userId, 'A', model);

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentA.id}/ci/install`,
      payload: installBody(),
    });
    expect(res.statusCode).toBe(200);
    expect(mockLLM.calls.length).toBe(0);

    const branch = github.branches[CI_BRANCH]!;
    const manifest = parseYaml(branch[manifestPathFor('a')]!) as AgentManifestLike;
    expect(manifest.provider).toBe('openrouter');
    expect(manifest.model).toBe(model);

    for (const contents of Object.values(branch)) {
      for (const secret of SECRET_SUBSTRINGS) {
        expect(contents.includes(secret)).toBe(false);
      }
    }

    await app.close();

    // -- 403 -> 422 ValidationError --
    const { app: app403, workspaceId: ws2, userId: u2 } = await setup({
      throwOnCommit: { status: 403 },
    });
    const agent2 = await createAgent(ws2, u2, 'C');
    const res403 = await app403.inject({
      method: 'POST',
      url: `/agents/${agent2.id}/ci/install`,
      payload: installBody(),
    });
    expect(res403.statusCode).toBe(422);
    expect((res403.json() as { error: { code: string } }).error.code).toBe('validation_error');
    await app403.close();

    // -- non-gha target: no functional export --
    const { app: appNonGha, workspaceId: ws3, userId: u3, github: githubNonGha } = await setup();
    const agent3 = await createAgent(ws3, u3, 'D');
    const resNonGha = await appNonGha.inject({
      method: 'POST',
      url: `/agents/${agent3.id}/ci/install`,
      payload: installBody({ target: 'cli' }),
    });
    expect(resNonGha.statusCode).toBe(422);
    expect(githubNonGha.committed.length).toBe(0);
    await appNonGha.close();
  });

  it('AC-7: branch tree = base tree + current bundle exactly, drops stale + unrelated files', async () => {
    const { app, workspaceId, userId, github } = await setup({
      baseTree: {
        'README.md': '# widgets',
        'notes.txt': 'some notes',
      },
      branchFiles: {
        [CI_BRANCH]: {
          [manifestPathFor('a')]: 'stale manifest a',
          '.devdigest/skills/s1.md': 'stale skill body',
          'extra.txt': 'unrelated branch-only file',
        },
      },
    });
    const agentB = await createAgent(workspaceId, userId, 'B');

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentB.id}/ci/install`,
      payload: installBody(),
    });
    expect(res.statusCode).toBe(200);

    const branch = github.branches[CI_BRANCH]!;
    // base tree survives
    expect(branch['README.md']).toBe('# widgets');
    expect(branch['notes.txt']).toBe('some notes');
    // current bundle present
    expect(branch[manifestPathFor('b')]).toBeTruthy();
    // stale/unrelated branch-only content is GONE
    expect(branch[manifestPathFor('a')]).toBeUndefined();
    expect(branch['.devdigest/skills/s1.md']).toBeUndefined();
    expect(branch['extra.txt']).toBeUndefined();

    expect(github.resets.some((r) => r.branch === CI_BRANCH && r.base === 'main')).toBe(true);

    await app.close();
  });
});
