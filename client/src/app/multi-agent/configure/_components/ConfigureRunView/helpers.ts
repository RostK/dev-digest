import { formatCostCompact } from "@/components/RunCostBadge";
import type { AgentEstimate, ReviewRecord } from "@devdigest/shared";

/**
 * The selected set's aggregated pre-run estimate (AC-3/AC-5/AC-6). Time is the
 * MAX of the included agents' durations (they run CONCURRENTLY — "parallel
 * fan-out"), cost is the SUM (each agent's own call is billed independently).
 * An agent with no usable history is excluded and marks the summary `partial`
 * — never a fabricated number.
 */
export interface EstimateAggregate {
  /** At least one selected agent contributed a real number. */
  hasAny: boolean;
  /** At least one selected agent was excluded for lacking history. */
  partial: boolean;
  /** e.g. "8.2s", or "—" when nothing could be computed. */
  timeLabel: string;
  /** e.g. "$0.20", or "—" when nothing could be computed. */
  costLabel: string;
}

export function aggregateEstimate(
  selectedIds: string[],
  byAgent: Map<string, AgentEstimate>,
): EstimateAggregate {
  let maxDurationMs = 0;
  let sumCostUsd = 0;
  let included = 0;
  let excluded = 0;

  for (const id of selectedIds) {
    const est = byAgent.get(id);
    if (!est?.has_history) {
      excluded += 1;
      continue;
    }
    included += 1;
    if (est.duration_ms != null) maxDurationMs = Math.max(maxDurationMs, est.duration_ms);
    if (est.cost_usd != null) sumCostUsd += est.cost_usd;
  }

  return {
    hasAny: included > 0,
    partial: excluded > 0,
    timeLabel: included > 0 ? `${(maxDurationMs / 1000).toFixed(1)}s` : "—",
    costLabel: formatCostCompact(included > 0 ? sumCostUsd : null),
  };
}

/**
 * Each agent's one-line summary from its LATEST review ON THE SELECTED PR (if
 * any) — reuses the existing per-PR reviews data, no new backend surface.
 */
export function lastRunSummaryByAgent(reviews: ReviewRecord[]): Map<string, string> {
  const byAgent = new Map<string, string>();
  for (const r of reviews) {
    if (r.kind !== "review" || !r.agent_id || !r.summary) continue;
    const cur = byAgent.has(r.agent_id);
    // `reviews` arrive newest-first (server orderBy desc created_at) — keep
    // only the first (= latest) summary seen per agent.
    if (!cur) byAgent.set(r.agent_id, r.summary);
  }
  return byAgent;
}
