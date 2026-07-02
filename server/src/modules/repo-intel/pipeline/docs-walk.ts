/**
 * repo-intel pipeline — context-doc discovery walk (SPEC-02 T3).
 *
 * Recursively walks a clone directory and returns markdown files that live
 * under a `specs/`, `docs/`, or `insights/` directory at ANY depth (matches
 * `**\/{specs,docs,insights}/**\/*.md`). Modeled on `walk.ts`:
 *   - EXCLUDED_DIRS is reused (not redefined) so node_modules/.git/etc. are
 *     never descended into.
 *   - Symlinks are never followed (loops, perf, and — per the `security`
 *     skill — no reading outside the clone via a symlinked escape hatch).
 *   - Unreadable directories (permissions, dangling symlink target) are
 *     skipped cleanly so the walk keeps making progress.
 *   - Paths are Windows-safe: built with `node:path` `join`, normalized to
 *     forward slashes via `.split(sep).join('/')` (server INSIGHTS
 *     2026-06-16; see `walk.ts:119`).
 *
 * The badge is derived from the NEAREST matching ancestor directory, so
 * `docs/specs/x.md` badges as 'specs' (the immediate parent), not 'docs'.
 *
 * Pure-ish: takes a clone root (+ optional scoped roots) and does fs reads;
 * returns plain data. The facade (`service.ts#discoverContextDocs`) owns
 * resolving `repoId` -> clone path.
 */
import { readdir } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { DOC_ROOT_DIRS, EXCLUDED_DIRS } from '../constants.js';
import type { DiscoveredDoc } from '../types.js';

const EXCLUDED_SET: ReadonlySet<string> = new Set(EXCLUDED_DIRS);
const DOC_ROOT_SET: ReadonlySet<string> = new Set(DOC_ROOT_DIRS);

/**
 * Discover context docs (markdown under specs/docs/insights) in `clonePath`.
 *
 * @param clonePath Absolute path to the repo clone on disk.
 * @param roots     Optional repo-relative directories to scope the walk to
 *                  (e.g. `['packages/app']` in a monorepo). Default = the
 *                  whole clone (AC-1's "default repo-wide" behavior); pass
 *                  an explicit list to override.
 */
export async function walkContextDocs(
  clonePath: string,
  roots?: string[],
): Promise<DiscoveredDoc[]> {
  const scanRoots = roots && roots.length > 0 ? roots : [''];
  const out: DiscoveredDoc[] = [];
  const seen = new Set<string>();

  for (const root of scanRoots) {
    const startDir = root ? join(clonePath, root) : clonePath;
    await walkDir(clonePath, startDir, out, seen);
  }

  out.sort((a, b) => a.path.localeCompare(b.path));
  return out;
}

async function walkDir(
  clonePath: string,
  dir: string,
  out: DiscoveredDoc[],
  seen: Set<string>,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    // Unreadable directory (permissions, dangling symlink, or a scoped root
    // that doesn't exist) — skip cleanly, same contract as walk.ts.
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks
    const name = entry.name;

    if (entry.isDirectory()) {
      if (EXCLUDED_SET.has(name)) continue;
      await walkDir(clonePath, join(dir, name), out, seen);
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(name).toLowerCase();
    if (ext !== '.md') continue;

    const full = join(dir, name);
    const rel = relative(clonePath, full).split(sep).join('/');

    const badge = nearestDocRootBadge(rel);
    if (!badge) continue; // no specs/docs/insights ancestor — not a context doc

    if (seen.has(rel)) continue; // dedupe when scanned roots overlap
    seen.add(rel);
    out.push({ path: rel, badge });
  }
}

/**
 * The NEAREST ancestor directory (closest to the file, walking up towards
 * the clone root) that matches DOC_ROOT_DIRS, or `null` if none does.
 * Case-sensitive exact match, same convention as EXCLUDED_DIRS.
 */
function nearestDocRootBadge(relPath: string): DiscoveredDoc['badge'] | null {
  const segments = relPath.split('/');
  // segments[last] is the filename; walk ancestor dir names nearest-first.
  for (let i = segments.length - 2; i >= 0; i -= 1) {
    const seg = segments[i];
    if (seg !== undefined && DOC_ROOT_SET.has(seg)) {
      return seg as DiscoveredDoc['badge'];
    }
  }
  return null;
}
