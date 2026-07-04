import { and, count, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { AgentDocRow } from './helpers.js';

/**
 * project-context data-access (SPEC-02 T4). Owns the workspace-scoped reads
 * over `agent_context_docs` + `skill_context_docs` + `agent_skills` that feed
 * the used_by / coverage counts — the actual per-agent dedup/tally runs in the
 * pure `countUsedBy` helper (helpers.ts), so this repository's job is only to
 * fetch the ALREADY-FILTERED (workspace, enabled bindings, enabled skills) raw
 * rows, never the whole table.
 *
 * `agent_context_docs` / `skill_context_docs` are NEW (Wave A) tables not yet
 * added to the hand-maintained relational `schema = {…}` object in
 * `db/schema.ts` — use the Drizzle QUERY-BUILDER (`db.select().from(t.x)`),
 * never `db.query.*`, for them (server INSIGHTS Wave-A T2 note).
 */
export class ProjectContextRepository {
  constructor(private db: Db) {}

  /** Repo identity, scoped to the workspace — tenancy guard (AC-19): a repoId
   *  from another workspace resolves to `null` so the route can 404 rather than
   *  reading (and discovering context docs against) a foreign tenant's clone. */
  async repoInWorkspace(
    workspaceId: string,
    repoId: string,
  ): Promise<{ owner: string; name: string } | null> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row ?? null;
  }

  /** Total agents in the workspace — the coverage denominator. */
  async agentCount(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count(t.agents.id) })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    return row?.n ?? 0;
  }

  /** Each agent's OWN attached context docs, workspace-scoped. */
  async ownContextDocRows(workspaceId: string): Promise<AgentDocRow[]> {
    const rows = await this.db
      .select({ agentId: t.agentContextDocs.agentId, path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agents.id, t.agentContextDocs.agentId))
      .where(eq(t.agents.workspaceId, workspaceId));
    return rows;
  }

  /**
   * Each agent's INHERITED context docs — via an ENABLED skill binding
   * (`agent_skills.enabled`) to a GLOBALLY enabled skill (`skills.enabled`) in
   * the SAME workspace as the agent — the same "feeds the prompt" rule as
   * `AgentsRepository.enabledSkillBodies`. A disabled binding, a disabled
   * skill, or a skill from another workspace contributes nothing here.
   */
  async inheritedContextDocRows(workspaceId: string): Promise<AgentDocRow[]> {
    const rows = await this.db
      .select({ agentId: t.agentSkills.agentId, path: t.skillContextDocs.path })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agents.id, t.agentSkills.agentId))
      .innerJoin(
        t.skills,
        and(
          eq(t.skills.id, t.agentSkills.skillId),
          eq(t.skills.enabled, true),
          eq(t.skills.workspaceId, t.agents.workspaceId),
        ),
      )
      .innerJoin(t.skillContextDocs, eq(t.skillContextDocs.skillId, t.skills.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agentSkills.enabled, true)));
    return rows;
  }
}
