/**
 * Pure helpers for the Smart Diff composer.
 *
 * No DB / LLM / network / `this`. Operates purely on its arguments — mirror
 * the style of helpers.ts. Import this from the service; never call it from
 * routes.
 */
import type { SmartDiff, SmartDiffFile, SmartDiffGroup, SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_PATTERNS,
  WIRING_PATTERNS,
  SPLIT_TOO_BIG_LINES,
  SPLIT_DIR_DEPTH,
} from './smart-diff-constants.js';

/**
 * Classify a file path into a SmartDiffRole.
 *
 * Priority: boilerplate → wiring → core (default).
 * Backslashes are normalised to forward slashes before matching so Windows
 * paths coming in from the DB work correctly.
 */
export function classifyFile(path: string): SmartDiffRole {
  const normalised = path.replace(/\\/g, '/');
  for (const re of BOILERPLATE_PATTERNS) {
    if (re.test(normalised)) return 'boilerplate';
  }
  for (const re of WIRING_PATTERNS) {
    if (re.test(normalised)) return 'wiring';
  }
  return 'core';
}

/**
 * Top-`depth` path segments of `path` (forward-slash normalised), used to
 * produce the proposed-split name.
 *
 * E.g. classifyPrefix('src/api/users.ts', 2) === 'src/api'
 */
function dirPrefix(path: string, depth: number): string {
  const parts = path.replace(/\\/g, '/').split('/');
  // If the file lives in the root (no subdirectory) use its own name as the
  // group name so every file always has a non-empty bucket.
  if (parts.length <= 1) return parts[0] ?? path;
  return parts.slice(0, depth).join('/');
}

/**
 * Compose a SmartDiff from raw PR files and a flat list of finding anchors.
 *
 * files    — { path, additions, deletions } (from pr_files)
 * findings — { file, start_line } (de-duplicated across agents by the caller)
 *
 * Group order in the output: core → wiring → boilerplate (empty groups omitted).
 * Within a group files are ordered: has-findings desc, then change-size desc,
 * then path asc.
 */
export function composeSmartDiff(
  files: { path: string; additions: number; deletions: number }[],
  findings: { file: string; start_line: number }[],
): SmartDiff {
  // Build a map of path → sorted-unique finding lines.
  const findingsByPath = new Map<string, Set<number>>();
  for (const f of findings) {
    let lines = findingsByPath.get(f.file);
    if (!lines) {
      lines = new Set();
      findingsByPath.set(f.file, lines);
    }
    lines.add(f.start_line);
  }

  // Classify and build SmartDiffFile entries.
  const byRole: Record<SmartDiffRole, SmartDiffFile[]> = {
    core: [],
    wiring: [],
    boilerplate: [],
  };

  for (const file of files) {
    const role = classifyFile(file.path);
    const lines = findingsByPath.get(file.path);
    const finding_lines = lines ? [...lines].sort((a, b) => a - b) : [];
    byRole[role].push({
      path: file.path,
      pseudocode_summary: null,
      additions: file.additions,
      deletions: file.deletions,
      finding_lines,
    });
  }

  // Sort within each role: has-findings desc, change-size desc, path asc.
  const sortGroup = (items: SmartDiffFile[]) =>
    items.sort((a, b) => {
      const aHas = a.finding_lines.length > 0 ? 1 : 0;
      const bHas = b.finding_lines.length > 0 ? 1 : 0;
      if (bHas !== aHas) return bHas - aHas;
      const aSize = a.additions + a.deletions;
      const bSize = b.additions + b.deletions;
      if (bSize !== aSize) return bSize - aSize;
      return a.path.localeCompare(b.path);
    });

  // Build groups in canonical output order, omit empty.
  const ROLE_ORDER: SmartDiffRole[] = ['core', 'wiring', 'boilerplate'];
  const groups: SmartDiffGroup[] = [];
  for (const role of ROLE_ORDER) {
    const items = sortGroup(byRole[role]);
    if (items.length > 0) groups.push({ role, files: items });
  }

  // Split suggestion.
  const total_lines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const too_big = total_lines > SPLIT_TOO_BIG_LINES;

  let proposed_splits: { name: string; files: string[] }[] = [];
  if (too_big) {
    const buckets = new Map<string, string[]>();
    for (const file of files) {
      const prefix = dirPrefix(file.path, SPLIT_DIR_DEPTH);
      let bucket = buckets.get(prefix);
      if (!bucket) {
        bucket = [];
        buckets.set(prefix, bucket);
      }
      bucket.push(file.path);
    }
    proposed_splits = [...buckets.entries()].map(([name, fileList]) => ({
      name,
      files: fileList,
    }));
  }

  return {
    groups,
    split_suggestion: { too_big, total_lines, proposed_splits },
  };
}
