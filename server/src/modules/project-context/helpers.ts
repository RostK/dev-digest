import type { ProjectContextDoc } from '@devdigest/shared';
import type { DiscoveredDoc } from '../repo-intel/types.js';
import { resolveEffectiveContextPaths } from '../_shared/project-context.js';

/**
 * Pure helpers for the project-context module (SPEC-02 T4) — the used_by /
 * coverage counting logic and the row → DTO mapping. No I/O, no DB, so these
 * are unit-testable without Postgres (AC-1, AC-2, AC-17, AC-21).
 */

/** One (agent, path) pair — either an agent's OWN attached doc, or a doc it
 *  INHERITS from an enabled skill binding. The repository is responsible for
 *  filtering to enabled bindings/skills and workspace scope BEFORE these rows
 *  reach this module; this function only tallies what it's given. */
export interface AgentDocRow {
  agentId: string;
  path: string;
}

/**
 * Per doc path, how many agents' EFFECTIVE context (own docs ∪ docs inherited
 * from enabled skills, deduped — own wins) includes it. Groups the raw rows by
 * agent, resolves each agent's effective set via the shared pure resolver (own
 * wins over inherited; inherited deduped across skills), then tallies path →
 * count of DISTINCT agents whose effective set contains it.
 */
export function countUsedBy(ownRows: AgentDocRow[], inheritedRows: AgentDocRow[]): Map<string, number> {
  const ownByAgent = groupPathsByAgent(ownRows);
  const inheritedByAgent = groupPathsByAgent(inheritedRows);

  const agentIds = new Set<string>([...ownByAgent.keys(), ...inheritedByAgent.keys()]);

  const counts = new Map<string, number>();
  for (const agentId of agentIds) {
    const own = ownByAgent.get(agentId) ?? [];
    const inherited = inheritedByAgent.get(agentId) ?? [];
    const effective = resolveEffectiveContextPaths(own, inherited);
    // own ∪ inherited is already deduped (own wins, inherited deduped) — a
    // path appears at most once here per agent, so incrementing per path is
    // safe (never double-counts one agent for one path).
    for (const path of [...effective.own, ...effective.inherited]) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return counts;
}

function groupPathsByAgent(rows: AgentDocRow[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows) {
    const arr = map.get(row.agentId);
    if (arr) arr.push(row.path);
    else map.set(row.agentId, [row.path]);
  }
  return map;
}

/** 0..1 ratio; 0 when the workspace has no agents (avoid divide-by-zero) rather
 *  than NaN, so a brand-new workspace renders 0% instead of a broken value. */
export function computeCoverage(usedBy: number, totalAgents: number): number {
  if (totalAgents <= 0) return 0;
  return usedBy / totalAgents;
}

/** Map a discovered doc + its computed tokens/usage into the public DTO. */
export function toProjectContextDoc(
  doc: DiscoveredDoc,
  tokens: number,
  usedBy: number,
  totalAgents: number,
): ProjectContextDoc {
  return {
    path: doc.path,
    badge: doc.badge,
    tokens,
    used_by: usedBy,
    coverage: computeCoverage(usedBy, totalAgents),
  };
}
