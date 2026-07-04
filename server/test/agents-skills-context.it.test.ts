import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';
import { AgentsService } from '../src/modules/agents/service.js';
import { SkillsRepository } from '../src/modules/skills/repository.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { Container } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-skills-context] Docker not available — skipping integration tests.');
}

/**
 * SPEC-02 Project Context — T5: attach persistence (agent + skill) and the
 * effective-context resolution (own + enabled-skill inherited, deduped).
 *
 * Covers: AC-4 (agent attach, ordered paths, no text), AC-6 (skill attach,
 * same rules), AC-7 (effective set = own ∪ enabled-skill inherited, deduped —
 * own wins), AC-8 (paths only, never text — structurally guaranteed by the
 * `{path, order}` table shape, asserted at the HTTP boundary too), AC-19
 * (workspace-scoped; a cross-tenant attach/read is rejected, and a same-join
 * defense-in-depth check for a mis-linked cross-workspace skill).
 */
d('agents + skills — Project Context attach & effective paths', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const agentBody = {
    name: 'Context Agent',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review the diff.',
  };

  const skillBody = {
    name: 'context-skill',
    type: 'custom' as const,
    body: '# Rule\nSome body text that must never be persisted as a context doc.',
  };

  // ---- AC-4 — agent attach --------------------------------------------------

  it('agent: attaches, lists, and replaces ordered context docs (paths only, no text)', async () => {
    const app = await makeApp();
    const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json()
      .id as string;

    const attach = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: ['docs/a.md', 'specs/b.md'],
    });
    expect(attach.statusCode).toBe(200);
    const attached = attach.json();
    expect(attached).toEqual([
      { path: 'docs/a.md', order: 0 },
      { path: 'specs/b.md', order: 1 },
    ]);
    // AC-8: only path + order are ever persisted/returned — no body/text field.
    for (const doc of attached) {
      expect(Object.keys(doc).sort()).toEqual(['order', 'path']);
    }

    const list = await app.inject({ method: 'GET', url: `/agents/${agentId}/context` });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual(attached);

    // A second attach REPLACES the previous set (mirrors setSkills semantics).
    const replace = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: ['docs/c.md'],
    });
    expect(replace.json()).toEqual([{ path: 'docs/c.md', order: 0 }]);
    await app.close();
  });

  it('agent: rejects unsafe paths at attach time (422) — traversal, absolute, drive letter, URL, non-.md', async () => {
    const app = await makeApp();
    const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json()
      .id as string;

    const unsafe = [
      ['../evil.md'],
      ['docs/../../evil.md'],
      ['/abs/path.md'],
      ['C:\\Windows\\evil.md'],
      ['http://evil.example/x.md'],
      ['notes.txt'],
    ];
    for (const payload of unsafe) {
      const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/context`, payload });
      expect(res.statusCode).toBe(422);
    }
    await app.close();
  });

  it('agent: a 404 for an unknown agent', async () => {
    const app = await makeApp();
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/context` })).statusCode).toBe(
      404,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/agents/${ghost}/context`,
          payload: ['docs/a.md'],
        })
      ).statusCode,
    ).toBe(404);
    await app.close();
  });

  // ---- AC-6 — skill attach ---------------------------------------------------

  it('skill: attaches and lists ordered context docs (paths only, no text)', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody })).json()
      .id as string;

    const attach = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: ['docs/skill-doc.md', 'insights/notes.md'],
    });
    expect(attach.statusCode).toBe(200);
    expect(attach.json()).toEqual([
      { path: 'docs/skill-doc.md', order: 0 },
      { path: 'insights/notes.md', order: 1 },
    ]);

    const list = await app.inject({ method: 'GET', url: `/skills/${skillId}/context` });
    expect(list.json()).toEqual(attach.json());
    await app.close();
  });

  it('skill: rejects an unsafe path at attach time (422)', async () => {
    const app = await makeApp();
    const skillId = (await app.inject({ method: 'POST', url: '/skills', payload: skillBody })).json()
      .id as string;
    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: ['../evil.md'],
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  // ---- AC-7 — effective context (own ∪ enabled-skill inherited, deduped) ----

  it('effective context: own docs + enabled-skill inherited docs, deduped (own wins; else first position)', async () => {
    const app = await makeApp();
    const agentsRepo = new AgentsRepository(pg.handle.db);

    const skillA = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'skill-a' } })
    ).json().id as string;
    const skillB = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'skill-b' } })
    ).json().id as string;

    await app.inject({
      method: 'POST',
      url: `/skills/${skillA}/context`,
      payload: ['docs/shared.md', 'docs/skill-a-only.md'],
    });
    await app.inject({
      method: 'POST',
      url: `/skills/${skillB}/context`,
      payload: ['docs/shared.md'],
    });

    const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json()
      .id as string;
    // Own doc "docs/shared.md" also exists via a skill — own must win (dropped
    // from inherited).
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/context`,
      payload: ['specs/own.md', 'docs/shared.md'],
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: skillA, enabled: true },
          { skill_id: skillB, enabled: true },
        ],
      },
    });

    const effective = await agentsRepo.effectiveContextPaths(agentId);
    expect(effective.own).toEqual(['specs/own.md', 'docs/shared.md']);
    // "docs/shared.md" is contributed by both own AND skill-B — own wins, and
    // among the remaining inherited paths only the first occurrence survives.
    expect(effective.inherited).toEqual(['docs/skill-a-only.md']);
    await app.close();
  });

  it('effective context: a disabled binding or a globally-disabled skill contributes NO inherited docs', async () => {
    const app = await makeApp();
    const agentsRepo = new AgentsRepository(pg.handle.db);

    const skillId = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...skillBody, name: 'toggle-skill' } })
    ).json().id as string;
    await app.inject({
      method: 'POST',
      url: `/skills/${skillId}/context`,
      payload: ['docs/x.md'],
    });
    const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json()
      .id as string;

    // Disabled binding → no inherited docs.
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: skillId, enabled: false }] },
    });
    expect((await agentsRepo.effectiveContextPaths(agentId)).inherited).toEqual([]);

    // Enabled binding → the doc flows through.
    await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skills: [{ skill_id: skillId, enabled: true }] },
    });
    expect((await agentsRepo.effectiveContextPaths(agentId)).inherited).toEqual(['docs/x.md']);

    // Globally disabling the skill also drops it, even though the binding is enabled.
    await app.inject({ method: 'PUT', url: `/skills/${skillId}`, payload: { enabled: false } });
    expect((await agentsRepo.effectiveContextPaths(agentId)).inherited).toEqual([]);
    await app.close();
  });

  it('effective context: a cross-workspace skill link contributes NO inherited docs even if the link row exists (defense-in-depth)', async () => {
    const app = await makeApp();
    const { db } = pg.handle;
    const agentsRepo = new AgentsRepository(db);
    const skillsRepo = new SkillsRepository(db);

    const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: agentBody })).json()
      .id as string;

    const [foreignWs] = await db.insert(t.workspaces).values({ name: 'foreign-context-ws' }).returning();
    const foreignSkill = await skillsRepo.insert({
      workspaceId: foreignWs!.id,
      name: 'foreign skill',
      type: 'custom',
      source: 'manual',
      body: 'x',
    });
    await skillsRepo.setContextDocs(foreignSkill.id, ['docs/foreign.md']);

    // Simulate a mis-linked row that bypassed the service's cross-tenant guard
    // (agentsRepo.linkSkill is a lower-level primitive with no workspace check —
    // the SAME-WORKSPACE guard on the effectiveContextPaths JOIN must still hold).
    await agentsRepo.linkSkill(agentId, foreignSkill.id, 0, true);

    expect((await agentsRepo.effectiveContextPaths(agentId)).inherited).toEqual([]);
    await app.close();
  });

  // ---- AC-19 — workspace scoping at the service layer -----------------------

  it('cross-workspace: reading/attaching context docs for a foreign agent or skill is rejected', async () => {
    const { db } = pg.handle;
    const agentsRepo = new AgentsRepository(db);
    const skillsRepo = new SkillsRepository(db);
    const agentsService = new AgentsService({ db } as unknown as Container);
    const skillsService = new SkillsService({ db } as unknown as Container);

    const [foreignWs] = await db.insert(t.workspaces).values({ name: 'foreign-ws-2' }).returning();
    const foreignAgent = await agentsRepo.insert({
      workspaceId: foreignWs!.id,
      name: 'Foreign Agent',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });
    const foreignSkill = await skillsRepo.insert({
      workspaceId: foreignWs!.id,
      name: 'Foreign Skill',
      type: 'custom',
      source: 'manual',
      body: 'x',
    });

    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    // A different workspace can neither read nor set — undefined (route → 404).
    expect(await agentsService.contextDocs(defaultWs!, foreignAgent.id)).toBeUndefined();
    expect(
      await agentsService.setContextDocs(defaultWs!, foreignAgent.id, ['docs/x.md']),
    ).toBeUndefined();
    expect(await skillsService.contextDocs(defaultWs!, foreignSkill.id)).toBeUndefined();
    expect(
      await skillsService.setContextDocs(defaultWs!, foreignSkill.id, ['docs/x.md']),
    ).toBeUndefined();

    // The owning workspace CAN.
    expect(await agentsService.setContextDocs(foreignWs!.id, foreignAgent.id, ['docs/x.md'])).toEqual([
      { path: 'docs/x.md', order: 0 },
    ]);
    expect(await skillsService.setContextDocs(foreignWs!.id, foreignSkill.id, ['docs/y.md'])).toEqual([
      { path: 'docs/y.md', order: 0 },
    ]);
  });
});
