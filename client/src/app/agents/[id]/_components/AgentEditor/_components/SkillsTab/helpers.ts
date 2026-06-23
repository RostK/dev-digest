import type { AgentSkillLink, Skill } from "@devdigest/shared";

/** A skill row in the Skills tab: the workspace skill + its per-agent enabled state. */
export interface SkillBindingItem {
  skill: Skill;
  enabled: boolean;
}

/**
 * Merge every workspace skill with the agent's saved bindings into one ordered
 * list: linked skills first (in saved order, carrying their enabled flag), then
 * the remaining workspace skills appended (disabled, A→Z) so a never-attached
 * skill can still be toggled on. "N of M enabled" reads off this list.
 */
export function mergeBindings(skills: Skill[], links: AgentSkillLink[]): SkillBindingItem[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  const linkedIds = new Set<string>();
  const linked: SkillBindingItem[] = [];
  for (const l of [...links].sort((a, b) => a.order - b.order)) {
    const skill = byId.get(l.skill_id);
    if (!skill) continue;
    linkedIds.add(skill.id);
    linked.push({ skill, enabled: l.enabled });
  }
  const unlinked = skills
    .filter((s) => !linkedIds.has(s.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, enabled: false }));
  return [...linked, ...unlinked];
}

/** Pure array move used by drag-reorder. */
export function move<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  if (item === undefined) return arr;
  next.splice(to, 0, item);
  return next;
}
