import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}

/** Repo-scope filter for the list. Mirrors the review-time rule (global skills
 *  apply everywhere; a repo-pinned skill only to its own repo). */
export type SkillScope = "repo" | "global" | "all";

export function filterByScope(
  skills: Skill[],
  scope: SkillScope,
  repoId: string | null | undefined,
): Skill[] {
  if (scope === "all") return skills;
  if (scope === "global") return skills.filter((sk) => !sk.repo_id);
  // "repo": global (always applies) + the active repo's pinned skills.
  return skills.filter((sk) => !sk.repo_id || sk.repo_id === repoId);
}
