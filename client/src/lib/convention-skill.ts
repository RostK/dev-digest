/* convention-skill.ts — pure helpers turning accepted convention candidates into
   a Skill (name + markdown body). No I/O; shared by the list view and the modal. */

import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "repo"
  );
}

/** Last path segment of an `owner/name` full name (or the value itself). */
export function repoShortName(repoFullName: string): string {
  return repoFullName.split("/").pop() || repoFullName;
}

export function defaultSkillName(repoFullName: string): string {
  return `${slugify(repoShortName(repoFullName))}-conventions`;
}

export function categorySkillName(repoFullName: string, category: string): string {
  return `${slugify(repoShortName(repoFullName))}-${category.replace(/_/g, "-")}`;
}

/** `path:start-end` (or `path:start`, or just `path`) for display. */
export function evidenceRange(c: ConventionCandidate): string {
  if (c.evidence_start_line == null) return c.evidence_path;
  const end = c.evidence_end_line;
  return end && end !== c.evidence_start_line
    ? `${c.evidence_path}:${c.evidence_start_line}-${end}`
    : `${c.evidence_path}:${c.evidence_start_line}`;
}

/** Group candidates by category, preserving input order within each bucket. */
export function groupByCategory(
  items: ConventionCandidate[],
): Map<ConventionCategory, ConventionCandidate[]> {
  const out = new Map<ConventionCategory, ConventionCandidate[]>();
  for (const c of items) {
    const bucket = out.get(c.category) ?? [];
    bucket.push(c);
    out.set(c.category, bucket);
  }
  return out;
}

/** Unique evidence paths across the given candidates (for skill.evidence_files). */
export function evidenceFiles(items: ConventionCandidate[]): string[] {
  return [...new Set(items.map((c) => c.evidence_path).filter(Boolean))];
}

/**
 * Markdown body for the generated skill: a header + one section per rule, each
 * citing the grounded `file:line` and the verbatim snippet. This is what the
 * review prompt enforces, so the evidence travels with the rule.
 */
export function buildSkillBody(
  repoFullName: string,
  items: ConventionCandidate[],
  title = defaultSkillName(repoFullName),
): string {
  const lines: string[] = [
    `# ${title}`,
    ``,
    `House conventions for \`${repoShortName(repoFullName)}\`. Flag changes that ` +
      `violate any rule below and cite the offending \`file:line\`.`,
    ``,
  ];
  for (const c of items) {
    lines.push(`## ${slugify(c.rule)}`);
    lines.push(c.rule.trim());
    lines.push(``);
    lines.push(`Detected in \`${evidenceRange(c)}\`:`);
    lines.push("```");
    lines.push(c.evidence_snippet.trim());
    lines.push("```");
    lines.push(``);
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
