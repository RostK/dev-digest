// Pure name → filesystem-slug conversion for the Export-to-CI bundle. Used for
// BOTH the agent slug (`.devdigest/agents/<slug>.yaml`) and each skill slug
// (`.devdigest/skills/<slug>.md`) — skills have no `slug` column, only `name`
// (see server/src/db/schema/skills.ts), so their file name is `slugify(skill.name)`.

/**
 * Lowercase, collapse any run of non-alphanumeric characters to a single `-`,
 * and trim leading/trailing `-`. Empty or all-punctuation input falls back to
 * `fallback` (default `'agent'`) rather than returning an empty string, since
 * an empty slug would produce an unusable/ambiguous bundle file path.
 *
 * Example: "Security Reviewer" -> "security-reviewer".
 */
export function slugify(name: string, fallback = 'agent'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}
