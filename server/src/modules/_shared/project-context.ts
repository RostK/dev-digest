/**
 * Pure effective-context path resolver (AC-7): an agent's effective Project Context
 * is its OWN attached docs plus docs INHERITED from its enabled skills, deduped so
 * each path appears exactly once across the two sets — own wins, else first
 * position among inherited. No I/O; importable by both `modules/project-context`
 * and `modules/agents` without a cross-module reach (onion: shared via `_shared`).
 */

export interface EffectiveContextPaths {
  own: string[];
  inherited: string[];
}

/**
 * Resolve the effective context paths for an agent.
 *
 * - Any path present in `own` is removed from the returned `inherited` (own wins).
 * - Among `inherited`, only the FIRST occurrence of each path is kept (dedupe
 *   later duplicates contributed by multiple skills).
 * - Order is preserved within each returned list.
 */
export function resolveEffectiveContextPaths(own: string[], inherited: string[]): EffectiveContextPaths {
  const ownSet = new Set(own);
  const seenInherited = new Set<string>();
  const dedupedInherited: string[] = [];

  for (const path of inherited) {
    if (ownSet.has(path)) continue;
    if (seenInherited.has(path)) continue;
    seenInherited.add(path);
    dedupedInherited.push(path);
  }

  return { own: [...own], inherited: dedupedInherited };
}
