/** Cost / token formatters for the RunCostBadge (and the Run Trace COST tile). */

/**
 * Compact USD cost for a single run.
 *  - null/undefined → "—" (no data; never "$0.00", per spec)
 *  - 0              → "$0.00" (a genuinely free run, e.g. a $0-priced model)
 *  - < $0.001       → "<$0.001" (too small to show with 3 dp)
 *  - < $0.01        → 3 dp, e.g. "$0.001"
 *  - otherwise      → 2 dp, e.g. "$0.07"
 */
export function formatCostCompact(usd: number | null | undefined): string {
  if (usd == null) return "—";
  if (usd <= 0) return "$0.00";
  if (usd < 0.001) return "<$0.001";
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/** Token in→out summary, e.g. "15k→1.2k". Matches the Run Trace formatter. */
export function formatTokensShort(tokensIn: number, tokensOut: number): string {
  return `${(tokensIn / 1000).toFixed(0)}k→${(tokensOut / 1000).toFixed(1)}k`;
}
