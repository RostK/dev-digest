import type { SkillType } from "@devdigest/shared";

/** Selectable skill types (Create/Import/Editor forms). */
export const SKILL_TYPE_OPTIONS: readonly SkillType[] = [
  "rubric",
  "convention",
  "security",
  "custom",
];

/** Type → badge colour, matching the agents design (rubric=purple … security=red). */
const TYPE_COLOR: Record<SkillType, string> = {
  rubric: "#8b5cf6",
  convention: "#10b981",
  security: "var(--crit)",
  custom: "var(--text-muted)",
};

export function skillTypeColor(type: SkillType): string {
  return TYPE_COLOR[type] ?? "var(--text-muted)";
}
