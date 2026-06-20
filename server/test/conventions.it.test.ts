import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * DB-backed extract → ground → list → accept flow. The mock LLM proposes four
 * candidates; only the two whose snippet is really in a sampled config file
 * survive grounding (the hallucinated snippet and the off-sample path are dropped).
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const FILES: Record<string, string> = {
  'package.json': '{\n  "name": "demo",\n  "type": "module"\n}\n',
  'tsconfig.json': '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n',
};

const EXTRACTION = {
  candidates: [
    {
      rule: 'Use native ES modules',
      category: 'imports',
      evidence_path: 'package.json',
      evidence_snippet: '"type": "module"',
      confidence: 0.92,
    },
    {
      rule: 'Compile under TypeScript strict mode',
      category: 'typing',
      evidence_path: 'tsconfig.json',
      evidence_snippet: '"strict": true',
      confidence: 0.8,
    },
    {
      // snippet not present in the file → must be dropped as ungrounded
      rule: 'Hallucinated rule',
      category: 'other',
      evidence_path: 'package.json',
      evidence_snippet: '"banana": true',
      confidence: 0.5,
    },
    {
      // path was never sampled → must be dropped
      rule: 'Off-sample rule',
      category: 'style',
      evidence_path: 'src/never-sampled.ts',
      evidence_snippet: 'whatever',
      confidence: 0.4,
    },
  ],
};

d('Conventions extractor (DB-backed)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function setup(name: string) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const { workspaceId } = await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: name,
        fullName: `acme/${name}`,
        clonePath: `/mock/clones/acme/${name}`,
      })
      .returning();
    const llm = new MockLLMProvider('openai', { structured: EXTRACTION });
    const app = await buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient({ files: FILES }), llm: { openai: llm } },
    });
    return { app, repoId: repo!.id };
  }

  it('keeps grounded candidates, drops the rest, then lists + accepts', async () => {
    const { app, repoId } = await setup('demo-a');

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(res.statusCode).toBe(201);
    const cands = res.json() as Array<{
      id: string;
      rule: string;
      evidence_start_line: number | null;
      accepted: boolean;
    }>;

    // 2 of 4 survive grounding
    expect(cands).toHaveLength(2);
    expect(cands.map((c) => c.rule).sort()).toEqual([
      'Compile under TypeScript strict mode',
      'Use native ES modules',
    ]);
    // every survivor has authoritative line numbers from the real file
    expect(cands.every((c) => c.evidence_start_line != null)).toBe(true);
    expect(cands.every((c) => c.accepted === false)).toBe(true);

    // GET returns the persisted set
    const list = await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toHaveLength(2);

    // accept one
    const accept = await app.inject({
      method: 'PATCH',
      url: `/conventions/${cands[0]!.id}`,
      payload: { accepted: true },
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json().accepted).toBe(true);

    await app.close();
  });

  it('404s for a repo outside the workspace', async () => {
    const { app } = await setup('demo-b');
    const res = await app.inject({
      method: 'POST',
      url: `/repos/00000000-0000-0000-0000-000000000000/conventions/extract`,
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
