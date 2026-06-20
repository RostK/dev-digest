import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

/**
 * Repo-scoped skills: a skill pinned to repo A (repo_id set) must feed ONLY
 * reviews of repo A; a global skill (repo_id NULL) feeds every repo. Enforced at
 * the single prompt seam, AgentsRepository.enabledSkillBodies(agentId, repoId).
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('Repo-scoped skills (DB-backed)', () => {
  let pg: PgFixture;
  beforeAll(async () => {
    pg = await startPg();
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('feeds a repo-pinned skill only to its own repo; globals everywhere', async () => {
    const db = pg.handle.db;
    const { workspaceId } = await seed(db);
    const [repoA] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'a', fullName: 'acme/a' })
      .returning();
    const [repoB] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'b', fullName: 'acme/b' })
      .returning();
    const [globalSkill] = await db
      .insert(t.skills)
      .values({ workspaceId, name: 'global', description: '', type: 'rubric', source: 'manual', body: 'GLOBAL RULES' })
      .returning();
    const [pinnedSkill] = await db
      .insert(t.skills)
      .values({
        workspaceId,
        repoId: repoA!.id,
        name: 'a-conv',
        description: '',
        type: 'convention',
        source: 'extracted',
        body: 'A RULES',
      })
      .returning();
    const [agent] = await db
      .insert(t.agents)
      .values({ workspaceId, name: 'rev', provider: 'openai', model: 'gpt-4.1', systemPrompt: 'you review' })
      .returning();
    await db.insert(t.agentSkills).values([
      { agentId: agent!.id, skillId: globalSkill!.id, order: 0, enabled: true },
      { agentId: agent!.id, skillId: pinnedSkill!.id, order: 1, enabled: true },
    ]);

    const app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), db });

    // Reviewing repo A → global + pinned (in link order); repo B → global only.
    expect(await app.container.agentsRepo.enabledSkillBodies(agent!.id, repoA!.id)).toEqual([
      'GLOBAL RULES',
      'A RULES',
    ]);
    expect(await app.container.agentsRepo.enabledSkillBodies(agent!.id, repoB!.id)).toEqual([
      'GLOBAL RULES',
    ]);

    await app.close();
  });

  it('POST /skills round-trips repo_id and rejects a repo outside the workspace', async () => {
    const db = pg.handle.db;
    const { workspaceId } = await seed(db);
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name: 'c', fullName: 'acme/c' })
      .returning();
    const app = await buildApp({ config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv), db });

    const pinned = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'c-conv', type: 'convention', source: 'extracted', body: 'C', repo_id: repo!.id },
    });
    expect(pinned.statusCode).toBe(201);
    expect(pinned.json().repo_id).toBe(repo!.id);

    const global = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'c-global', type: 'rubric', body: 'G' },
    });
    expect(global.json().repo_id).toBeNull();

    const foreign = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: 'c-foreign', type: 'custom', body: 'X', repo_id: '00000000-0000-0000-0000-000000000000' },
    });
    expect(foreign.statusCode).toBe(404);

    await app.close();
  });
});
