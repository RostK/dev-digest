import type { BlastRadius, BlastCaller, ChangedSymbol, DownstreamImpact } from '@devdigest/shared';
import type { BlastResult } from '../repo-intel/types.js';

/**
 * Map the facade's flat camelCase `BlastResult` to the snake_case, nested
 * `BlastRadius` HTTP contract.
 *
 * The facade returns callers as a flat list, each tagged with the changed
 * symbol it reaches (`viaSymbol`). The contract groups them per changed symbol
 * under `downstream[]`, attributing impacted endpoints/crons to each symbol via
 * the caller files in `factsByFile`.
 *
 * Endpoint/cron attribution:
 *  - Persistent path: `factsByFile` is present → union the facts over the
 *    symbol's caller files (precise per-symbol attribution).
 *  - Degraded path: `factsByFile` is absent → fall back to the flat
 *    `impactedEndpoints` on every entry (best-effort; the degraded badge warns
 *    the reviewer the index is incomplete).
 *
 * Pure function — no I/O, no model. `summary` is computed by the caller.
 */
export function mapToBlastRadius(result: BlastResult, summary: string): BlastRadius {
  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  // Group callers by the changed symbol they reach, preserving the facade's
  // rank ordering and tracking the distinct caller files per symbol.
  const callersByVia = new Map<string, BlastCaller[]>();
  const filesByVia = new Map<string, Set<string>>();
  for (const c of result.callers) {
    let callers = callersByVia.get(c.viaSymbol);
    if (!callers) {
      callers = [];
      callersByVia.set(c.viaSymbol, callers);
    }
    callers.push({ name: c.symbol, file: c.file, line: c.line });

    let files = filesByVia.get(c.viaSymbol);
    if (!files) {
      files = new Set<string>();
      filesByVia.set(c.viaSymbol, files);
    }
    files.add(c.file);
  }

  const flatEndpoints = [...new Set(result.impactedEndpoints)];

  const downstream: DownstreamImpact[] = [];
  for (const [symbol, callers] of callersByVia) {
    const callerFiles = filesByVia.get(symbol) ?? new Set<string>();
    let endpoints_affected: string[];
    let crons_affected: string[];

    if (result.factsByFile) {
      const eps = new Set<string>();
      const crons = new Set<string>();
      for (const file of callerFiles) {
        const facts = result.factsByFile[file];
        if (!facts) continue;
        for (const e of facts.endpoints) eps.add(e);
        for (const cr of facts.crons) crons.add(cr);
      }
      endpoints_affected = [...eps];
      crons_affected = [...crons];
    } else {
      // Degraded path: no per-file facts — attach the flat union as best effort.
      endpoints_affected = flatEndpoints;
      crons_affected = [];
    }

    downstream.push({ symbol, callers, endpoints_affected, crons_affected });
  }

  return { changed_symbols, downstream, summary };
}
