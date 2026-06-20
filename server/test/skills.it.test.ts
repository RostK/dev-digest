import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills module — CRUD + body versioning + import preview, and the binding wiring
 * the review pipeline depends on: only ENABLED bindings of ENABLED skills feed
 * `enabledSkillBodies`, in order (a disabled binding/skill is omitted).
 */
d('skills module', () => {
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

  const createBody = {
    name: 'no-then-chains',
    description: 'Avoid .then() chains; prefer async/await.',
    type: 'convention' as const,
    body: '# Rule\nUse async/await, not .then().',
  };

  it('creates, reads, lists, and snapshots a skill (v1)', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'no-then-chains', type: 'convention', version: 1, enabled: true });

    expect((await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode).toBe(200);

    const list = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(list.some((s: { id: string }) => s.id === skill.id)).toBe(true);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ skill_id: skill.id, version: 1 });
    await app.close();
  });

  it('bumps the version only when the body changes', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;

    // metadata-only edit → no bump
    expect((await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { description: 'x' } })).json().version).toBe(1);
    // enabled toggle → no bump
    const tog = await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { enabled: false } });
    expect(tog.json()).toMatchObject({ version: 1, enabled: false });
    // body change → bump + snapshot v2
    expect((await app.inject({ method: 'PUT', url: `/skills/${id}`, payload: { body: '# Rule v2' } })).json().version).toBe(2);

    const versions = (await app.inject({ method: 'GET', url: `/skills/${id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    await app.close();
  });

  it('deletes a skill (404 afterwards)', async () => {
    const app = await makeApp();
    const id = (await app.inject({ method: 'POST', url: '/skills', payload: createBody })).json().id as string;
    expect((await app.inject({ method: 'DELETE', url: `/skills/${id}` })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/skills/${id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('import preview extracts ONLY the markdown body from a zip (no execution)', async () => {
    const app = await makeApp();
    const zip = zipSync({ 'SKILL.md': strToU8('# Imported\nbody'), 'run.sh': strToU8('echo pwned') });
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'pack.zip', content_base64: Buffer.from(zip).toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ body: '# Imported\nbody' });
    expect(res.json().ignored_files).toContain('run.sh');
    await app.close();
  });

  it('feeds only enabled bindings of enabled skills to the prompt, in order', async () => {
    const app = await makeApp();
    const repo = new AgentsRepository(pg.handle.db);
    // These skills are global (no repo_id), so they feed any repo's review — the
    // repoId arg only filters repo-pinned skills (covered in skills-repo-scope.it).
    const anyRepoId = '00000000-0000-0000-0000-000000000000';

    const agentId = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Binder', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'x' },
      })
    ).json().id as string;

    const mk = async (name: string, body: string) =>
      (await app.inject({ method: 'POST', url: '/skills', payload: { name, type: 'custom', body } })).json()
        .id as string;
    const a = await mk('skill-a', 'BODY-A');
    const b = await mk('skill-b', 'BODY-B');
    const c = await mk('skill-c', 'BODY-C');

    // order a, b, c; binding b is disabled.
    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: {
        skills: [
          { skill_id: a, enabled: true },
          { skill_id: b, enabled: false },
          { skill_id: c, enabled: true },
        ],
      },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json()).toHaveLength(3);

    // only enabled bindings flow, in order: A then C.
    expect(await repo.enabledSkillBodies(agentId, anyRepoId)).toEqual(['BODY-A', 'BODY-C']);

    // globally disabling skill C drops it too.
    await app.inject({ method: 'PUT', url: `/skills/${c}`, payload: { enabled: false } });
    expect(await repo.enabledSkillBodies(agentId, anyRepoId)).toEqual(['BODY-A']);

    // the link list still reports all three bindings with their enabled flags.
    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(links).toHaveLength(3);
    expect(links.find((l: { skill_id: string }) => l.skill_id === b).enabled).toBe(false);
    await app.close();
  });
});
