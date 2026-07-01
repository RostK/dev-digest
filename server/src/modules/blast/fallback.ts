import type { BlastCallerRow, BlastResult } from '../repo-intel/types.js';

/**
 * Best-effort caller reconstruction for when the repo index has NO resolved
 * cross-file references (the indexer's `decl_file` resolution is a later-lesson
 * slot, so the facade's persistent path returns 0 callers). We rebuild callers
 * by name-matching the `references` table, restricted upstream to symbol names
 * declared in exactly one file (unambiguous), so a reference to that name almost
 * certainly points at our changed symbol. No index mutation — pure read.
 */

/** Mirror of repo-intel's MAX_CALLERS_PER_SYMBOL so the two paths agree. */
export const FALLBACK_MAX_CALLERS_PER_SYMBOL = 20;

export interface RawCaller {
  file: string;
  toSymbol: string;
  line: number;
  rank: number;
}

export interface RawFacts {
  filePath: string;
  endpoints: string[];
  crons: string[];
}

/**
 * Fold name-matched caller rows + caller-file facts into a `BlastResult` (the
 * facade's shape) so the existing mapper/summary run unchanged. `callerRows`
 * must arrive sorted by rank DESC; we cap per changed symbol.
 */
export function buildFallbackResult(
  base: BlastResult,
  callerRows: RawCaller[],
  factsRows: RawFacts[],
): BlastResult {
  const byVia = new Map<string, BlastCallerRow[]>();
  for (const r of callerRows) {
    let list = byVia.get(r.toSymbol);
    if (!list) {
      list = [];
      byVia.set(r.toSymbol, list);
    }
    if (list.length >= FALLBACK_MAX_CALLERS_PER_SYMBOL) continue;
    // No enclosing-symbol name in the references table — the UI shows file:line.
    list.push({ file: r.file, symbol: '', viaSymbol: r.toSymbol, line: r.line, rank: r.rank });
  }
  const callers = [...byVia.values()].flat();

  const factsByFile: Record<string, { endpoints: string[]; crons: string[] }> = {};
  for (const f of factsRows) {
    factsByFile[f.filePath] = { endpoints: f.endpoints, crons: f.crons };
  }
  const impactedEndpoints = [...new Set(factsRows.flatMap((f) => f.endpoints))];

  return {
    changedSymbols: base.changedSymbols,
    callers,
    impactedEndpoints,
    factsByFile,
    degraded: base.degraded,
    reason: base.reason,
  };
}
