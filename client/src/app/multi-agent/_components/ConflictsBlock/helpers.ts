import type { Conflict } from "@devdigest/shared";

/**
 * A conflict group is a genuine DIVERGENCE when its takes don't all agree —
 * either the flagged severities differ, or some agents flagged it while at
 * least one other explicitly did not (`verdict === "ignored"`). A group where
 * every take carries the SAME verdict (e.g. two agents both flag it WARNING)
 * is a duplicate, not a disagreement, and is hidden by "Show only conflicts".
 * Pure — no fetching, computes only over the `conflicts[]` prop already given.
 */
export function hasDivergence(conflict: Conflict): boolean {
  const verdicts = new Set(conflict.takes.map((take) => take.verdict));
  return verdicts.size > 1;
}
