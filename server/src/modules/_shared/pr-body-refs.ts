/**
 * PR-body reference loaders: best-effort extraction of motivation sources
 * referenced FROM a PR body (a linked GitHub issue, in-repo spec/plan docs).
 * Pure I/O helpers — no persistence, no service state — so they can be
 * shared across modules (onion: shared via `_shared`, see project-context.ts
 * for the same cross-module pattern). `container`/ports are taken as
 * PARAMETERS rather than closed over, so callers stay free to construct
 * their own service classes around the container.
 */
import type { Container } from '../../platform/container.js';

/** Extensions we'll read as inline spec/plan context from the cloned repo. */
export const SPEC_EXTS = ['md', 'mdx', 'txt', 'rst'];
/** Cap on referenced spec docs + per-doc size, so the lean prompt stays lean. */
export const MAX_SPEC_DOCS = 3;
export const MAX_SPEC_CHARS = 8_000;

/**
 * Parse the FIRST `#N` reference from the PR body (closes/fixes/resolves/
 * spec/plan/ref or bare) and fetch that issue's body. Returns undefined when
 * there's no reference, no GitHub token, or the fetch fails.
 */
export async function loadLinkedIssue(
  container: Container,
  repoRef: { owner: string; name: string },
  body: string | null,
): Promise<{ number: number; title: string; body?: string | null } | undefined> {
  if (!body) return undefined;
  const m = body.match(/(?:closes|fixes|resolves|spec|plan|ref|issue)?\s*#(\d+)/i);
  const n = m?.[1] ? Number(m[1]) : NaN;
  if (!Number.isInteger(n) || n <= 0) return undefined;
  try {
    const gh = await container.github();
    const issue = await gh.getIssue(repoRef, n);
    return { number: issue.number, title: issue.title, body: issue.body };
  } catch {
    return undefined; // no token / offline / not found — degrade gracefully
  }
}

/**
 * Read in-repo spec/plan files referenced by path in the PR body (e.g.
 * `docs/specs/foo.md`) from the cloned working tree. Path-traversal-guarded
 * (no `..`, no absolute / drive paths, allowlisted extensions), capped, and
 * each read fail-soft. NEVER fetches external URLs.
 *
 * `maxChars` defaults to this module's own `MAX_SPEC_CHARS` (8_000, the
 * intent-service cap) — pass a caller-specific cap (e.g. the brief module's
 * lower 4_000) to apply it ONCE here instead of re-truncating downstream.
 */
export async function loadSpecDocs(
  container: Container,
  repoRef: { owner: string; name: string },
  body: string | null,
  maxChars: number = MAX_SPEC_CHARS,
): Promise<{ path: string; content: string }[]> {
  if (!body) return [];
  const candidates = new Set<string>();
  // Markdown link targets: [text](path)
  for (const m of body.matchAll(/\]\(([^)\s]+)\)/g)) if (m[1]) candidates.add(m[1]);
  // Bare path tokens ending in a spec-ish extension.
  const extAlt = SPEC_EXTS.join('|');
  for (const m of body.matchAll(new RegExp(`(?:^|\\s)([\\w./-]+\\.(?:${extAlt}))\\b`, 'gi'))) {
    if (m[1]) candidates.add(m[1]);
  }

  const out: { path: string; content: string }[] = [];
  for (const raw of candidates) {
    if (out.length >= MAX_SPEC_DOCS) break;
    const rel = raw.trim();
    if (!isSafeRepoPath(rel)) continue;
    try {
      const content = await container.git.readFile(repoRef, rel);
      if (content && content.trim().length > 0) {
        out.push({ path: rel, content: content.slice(0, maxChars) });
      }
    } catch {
      // referenced file not in the clone (or repo not cloned yet) — skip
    }
  }
  return out;
}

/** Reject absolute paths, drive letters, `..` traversal, URLs, and non-spec extensions. */
export function isSafeRepoPath(p: string): boolean {
  if (!p || p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(p) || /^[a-z]+:\/\//i.test(p)) return false; // drive / url
  if (p.split(/[\\/]/).some((seg) => seg === '..')) return false;
  const ext = p.split('.').pop()?.toLowerCase() ?? '';
  return SPEC_EXTS.includes(ext);
}
